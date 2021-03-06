// ==UserScript==
// @name         HoG Tools - Autoroute Manager
// @namespace    https://github.com/Brilliand/HoG-Tools
// @version      1.5
// @description  Provides automated autoroute handling with an arbitrary autoroute network and per-resource hubs
// @author       Brilliand
// @match        https://game274411.konggames.com/gamez/0027/4411/live/*
// @match        https://game288398.konggames.com/gamez/0028/8398/live/*
// @grant        none
// ==/UserScript==

window.hubs = {};
window.addHub = function(resid, planetid) {
	hubs[resid] = hubs[resid] || {};
	hubs[resid][planetid] = true;
};
window.remHub = function(resid, planetid) {
	if(hubs[resid]) {
		delete hubs[resid][planetid];
		if(Object.keys(hubs[resid]).length === 0) delete hubs[resid];
	}
};
window.isHub = function(resid, planetid) {
	return hubs.hasOwnProperty(resid) && hubs[resid][planetid];
};
window.getResourceHubs = function(resid) {
	return Object.keys(hubs[resid] || {}).filter(function(p) {
		return game.searchPlanet(p);
	});
};

(function() {
	'use strict';

	try {
		hubs = JSON.parse(localStorage.getItem("HoGTools-AutorouteHubs")) || {};
		for(var i in hubs) if(typeof hubs[i] === "number" || typeof hubs[i] === "string") {
			var n = hubs[i];
			hubs[i] = {};
			hubs[i][n] = true;
		}
	} catch(e) {
		console.error("Error in saved hubs:", e.stack);
	}
	function saveHubs() {
		localStorage.setItem("HoGTools-AutorouteHubs", JSON.stringify(hubs));
	}

	// Helper functions

	Array.prototype.addSet = function(a) {
		for(var i = 0; i < this.length; i++) {
			this[i] += a[i];
		}
		return this;
	};
	Array.prototype.sub = function(a) {
		return this.map(function(v, i) {
			return v - a[i];
		});
	};
	Array.prototype.multEach = function(n) {
		return this.map(function(v, i) {
			return v *= n;
		});
	};
	Array.prototype.sum = function() {
		return this.reduce(function(a, b) { return a + b; }, 0);
	};
	function reduceResources(res, reduceBy) {
		var sizes = res.slice().sort(function(a, b) { return a - b; });
		var sum = 0, n = 0, cap;
		while(sizes.length) {
			var v = sizes.pop();
			if(cap >= v)
				break;
			sum += v;
			n++;
			cap = Math.floor((sum - reduceBy) / n);
		}
		var ncapped = 0;
		res = res.map(function(v) { if(v <= cap) return v; ncapped++; return cap; });
		res.ncapped = ncapped;
		return res;
	}
	function reduceResourcesReverse(res, reduceBy) {
		var sizes = res.slice().sort(function(a, b) { return b - a; });
		var sum = 0, clip;
		while(sizes.length) {
			var v = sizes.pop();
			if(clip <= v)
				break;
			sum += v;
			clip = Math.ceil((reduceBy - sum) / sizes.length);
		}
		res = res.map(function(v) { if(v >= clip) return v - clip; return 0; });
		return res;
	}

	// Hook into game interface
	$("#icon_cont").append(function() {
		var update_autoroutes_button = $("<img>", {
			id: "update_autoroutes_button",
			src: "ui/empire.png",
			height: 30,
			width: 30,
		}).css({
			position: "absolute",
			top: "6px",
			left: "120px",
			cursor: "pointer",
		}).click(function(e) {
			e.stopPropagation();
			updateRoutes();
		}).attr("title", "Update Autoroutes");
		return update_autoroutes_button;
	});
	var observer = new MutationObserver(function(mutation) {
		var base_style = {
			float: "left",
			margin: "0 2px",
			width: "1em",
			height: "1em",
			"text-align": "center",
			cursor: "pointer",
		};
		var active_style = {
			"background-color": "#80c0ff",
			"border-radius": "1em",
		};
		var inactive_style = {
			"background-color": "",
			"border-radius": "",
		};
		$("#planet_list div[id^=planet_overview_info_] > div[id^=planet_res_]").prepend(function() {
			if($(this).find(".hub_button").length) return;
			var p_r = $(this).attr("name").split("_");
			var p = parseInt(p_r[0]);
			var r = parseInt(p_r[1]);
			var hub_button = $("<img>", {
				"class": "hub_button",
				"src": "ui/empire.png",
			}).css(base_style).data({
				planetid: p,
				resid: r,
			}).click(function(e) {
				e.stopPropagation();
				if(isHub(r, p)) {
					remHub(r, p);
					$(this).css(inactive_style).attr("title", "Set Hub");
				} else {
					var nebula = planets[p].map;
					getResourceHubs(r).filter(function(p) {
						return planets[p].map == nebula;
					}).map(function(p) {
						remHub(r, p);
						$(".hub_button").filter(function() { 
							return $(this).data("resid") == r
							    && $(this).data("planetid") == p;
						}).css(inactive_style).attr("title", "Set Hub");
					});

					addHub(r, p);
					$(this).css(active_style).attr("title", "Clear Hub");
				}
				saveHubs();
				updateRoutes();
			}).css(isHub(r, p) ? active_style : inactive_style).attr("title", isHub(r, p) ? "Clear Hub" : "Set Hub");
			return hub_button;
		});
	});
	var options = {
		childList: true,
		subtree: true,
	};
	observer.observe(document.getElementById("planet_selection_interface"), options);

	// Handle autoroutes
	function updateRoutes() {
		var planetTransport = planets.map(function() { return {}; });

		fleetSchedule.civisFleet(game.id).filter(function(route) {
			return route.type == "auto";
		}).map(function(route) {
			var a = route.origin, b = route.destination;
			var fleet = fleetSchedule.fleets[route.fleet];
			var travelTime = parseInt(Math.floor(2 * planets[a].shortestPath[b].distance / (idleBon * fleet.speed())));
			var storage = fleet.maxStorage();

			var other = planetTransport[a][b];
			if(other) {
				if(other.storage / other.time > storage / travelTime) {
					fleet.type = "normal";
					return;
				} else {
					other.fleet.type = "normal";
				}
			}
			planetTransport[a][b] = planetTransport[b][a] = {
				time: travelTime,
				storage: storage,
				fleet: fleet,
			};
		});

		var planetQueue = planetTransport.reduce(function(arr, v, k) {
			if(Object.keys(v).length == 1) {
				var planetid = Object.keys(v)[0];
				var route = v[planetid];
				arr.push({
					from: k,
					to: planetid,
					route: route,
				});
			}
			return arr;
		}, Array());
		function enterCycle() {
			var foundPlanet = planetTransport.map(function(v, k) {
				return {
					from: k,
					to: Object.keys(v),
				};
			}).filter(function(v) { return v.to.length; })[0];
			if(foundPlanet) {
				var from = foundPlanet.from;
				foundPlanet.to.map(function(to) {
					planetQueue.push({
						from: from,
						to: to,
						route: planetTransport[from][to],
					});
				});
				return true;
			} else {
				return false;
			}
		}

		var planetProduction = planets.map(function(planet) {
			return planet.structure.filter(function(built) {
				return buildings[built.building].show(planet) && built.active;
			}).map(function(built) {
				var building = buildings[built.building];
				var n = built.number;
				if(typeof getBuildingsWanted !== "undefined") n += getBuildingsWanted(planet.id, built.building);
				return building.rawProduction(planet).map(function(v) { return (v < 0) ? v * n : v * built.number; });
			}).reduce(function(total, v) {
				return total.addSet(v);
			}, Array(resNum).fill(0));
		});

		var planetGroups = Array();
		var ungroupedPlanets = game.planets.reduce(function(obj, v) { obj[v] = null; return obj; }, {});
		while(Object.keys(ungroupedPlanets).length) {
			var definer = Object.keys(ungroupedPlanets)[0];
			var planetGroup = [definer];
			for(var i = 0; i < planetGroup.length; i++) {
				delete ungroupedPlanets[planetGroup[i]];
				Object.keys(planetTransport[planetGroup[i]]).map(function(v) {
					if(ungroupedPlanets.hasOwnProperty(v)) planetGroup.push(v);
				});
			}
			planetGroups.push(planetGroup);
		}
		planetGroups = planetGroups.reduce(function(obj, v) {
			var entry = {};
			entry.planets = v;
			entry.totalRes = v.reduce(function(total, p) {
				var v = planetProduction[p];
				v.map(function(v, k) { total[k] += v; });
				return total;
			}, Array(resNum).fill(0));
			v.map(function(p) {
				obj[p] = entry;
			});
			return obj;
		}, {});

		for(var i = 0; i < planetQueue.length || enterCycle(); i++) {
			var entry = planetQueue[i];
			if(!planetTransport[entry.from][entry.to]) continue;
			var prod = planetProduction[entry.from];
			var canLeave = Array(resNum).fill(0);
			var toTransport = prod.map(function(v, k) {
				if(isHub(k, entry.from)) {
					return v - planetGroups[entry.from].totalRes[k];
				} else if(v < 0) {
					return v;
				} else {
					var toSpare = v + Math.min(planetProduction[entry.to][k], 0);
					var leaveBehind = Math.max(Math.min(toSpare, planetGroups[entry.from].totalRes[k]), 0);
					if(getResourceHubs(k).filter(function(p) {
						return planetGroups[p] === planetGroups[entry.from];
					}).length) {
						canLeave[k] = leaveBehind;
						return v;
					} else {
						return v - leaveBehind;
					}
				}
			});
			var travelTime = entry.route.time;
			var resOut = toTransport.map(function(v) { return v > 0 ? Math.ceil(v * travelTime) : 0; });
			var resIn = toTransport.map(function(v) { return v < 0 ? Math.ceil(-v * travelTime) : 0; });
			canLeave = canLeave.multEach(travelTime).map(Math.ceil);

			// Store for logging
			var oldIn = resIn.slice(), oldOut = resOut.slice();

			var outLeave = resOut.sum() - entry.route.storage;
			if(outLeave > 0) {
				var safeLeave = canLeave.sum();
				if(safeLeave > outLeave) {
					canLeave = reduceResourcesReverse(canLeave, safeLeave - outLeave);
				}
				resOut = resOut.sub(canLeave);
				if(safeLeave < outLeave) resOut = reduceResources(resOut, outLeave - safeLeave);
			}

			var inLeave = resIn.sum() - entry.route.storage;
			if(inLeave > 0) resIn = reduceResources(resIn, inLeave);

			if(outLeave > 0 || inLeave > 0) console.log("Autoroute", planets[entry.from].name+"-"+planets[entry.to].name, "short on space for", oldIn.sub(resIn).reduce(function(obj, v, k) {
				if(v) obj[resources[k].name] = beauty(v) + " (" + beauty(v / travelTime) + "/s)";
				return obj;
			}, {}), oldOut.sub(resOut).reduce(function(obj, v, k) {
				if(v) obj[resources[k].name] = beauty(v) + " (" + beauty(v / travelTime) + "/s)";
				return obj;
			}, {}));

			var fleet = entry.route.fleet;
			fleet.autoRes[fleet.autoMap[entry.from]] = resOut;
			fleet.autoRes[fleet.autoMap[entry.to]] = resIn;

			var netTransport = resOut.sub(resIn).multEach(1 / travelTime);
			planetGroups[entry.from].totalRes.addSet(netTransport.sub(prod));
			planetProduction[entry.from].addSet(netTransport.multEach(-1));
			planetProduction[entry.to].addSet(netTransport);

			delete planetTransport[entry.from][entry.to];
			delete planetTransport[entry.to][entry.from];

			var nextLinks = planetTransport[entry.to];
			if(Object.keys(nextLinks).length == 1) {
				var planetid = Object.keys(nextLinks)[0];
				var route = nextLinks[planetid];
				planetQueue.push({
					from: entry.to,
					to: planetid,
					route: route,
				});
			}
		}
	}
	setInterval(updateRoutes, 60*1000);
})();
