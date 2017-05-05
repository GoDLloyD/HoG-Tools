document.addEventListener("DOMContentLoaded", function() {
	'use strict';

	function arr(v) { return Array.prototype.slice.call(v); }
	function appendTo(a) { return function(b) { return a.appendChild(b); }; }
	function el(tag, contents) { var el = document.createElement(tag); if(contents) contents.map(appendTo(el)); return el; }
	function txt() { return document.createTextNode(arr(arguments).join()); }
	function div() { return el("div", arr(arguments)); }
	function span() { return el("span", arr(arguments)); }
	function label() { return el("label", arr(arguments)); }

	function serialize(obj) {
		return Object.keys(obj).map(function(k) {
			var v;
			if(typeof obj[k] === "object") {
				var section = obj[k];
				v = Object.keys(obj[k]).map(function(k) {
					return k+":"+section[k];
				}).join(",");
			} else {
				v = obj[k];
			}
			return k+"="+v;
		}).join("&");
	}
	function deserialize(str) {
		if(!str) return null;
		var data = str.split("&").map(function(str) {
			var parts = str.split("=", 2);
			if(parts[1].indexOf(":") != -1) {
				parts[1] = parts[1].split(",").map(function(str) {
					return str.split(":", 2);
				}).reduce(function(obj, add) {
					obj[add[0]] = add[1];
					return obj;
				}, {})
			}
			return parts;
		}).reduce(function(obj, add) {
			obj[add[0]] = add[1];
			return obj;
		}, {});
		if(data.ships || data.enemies) return data;
		return null;
	}
	function beautyObj(obj) {
		var a = [];
		for(var k in obj) {
			var v = obj[k];
			a.push(k + ": " + (typeof v === "number" ? beauty(v) : v));
		}
		return a.join("\n");
	}
	function dmgred(armor) {
		return 1 - 1 / (1 + Math.log(1 + armor / 1E4) / Math.log(2));
	}
	function speedred(def, atk, weight) {
		var a = def / atk * 4.6 / Math.log(weight) - 2;
		var b = 2 * a / (1 + Math.abs(2 * a));
		return .5 * (1.1 - .9 * b);
	}
	function shipSummaryData(ship, friend, foe) {
		var shipStats = {
			Power: ship.power,
			Armor: ship.armor,
			HP: ship.hp,
			Toughness: ship.hp / (1 - dmgred(ship.armor)),
			Speed: ship.speed,
			Weight: ship.weight,
		};
		if(friend) {
			var bonus = fleetBonus(friend);
			var fleetWeight = friend.weight();
			shipStats.Power *= bonus.power;
			shipStats.Armor *= bonus.armor;
			shipStats.Toughness = ship.hp / (1 - dmgred(shipStats.Armor));
			shipStats.Speed *= bonus.speed;
			shipStats.Duration = (1 + fleetWeight / ship.weight);
		}
		if(foe) {
			var bonus = fleetBonus(foe);
			var fleetWeight = foe.weight();
			var netEffect = foe.ships.map(function(n, k) {
				if(n == 0) return {};
				var enemyShip = ships[k];
				var result = {};
				result.power = n * enemyShip.power * bonus.power;
				result.harm = speedred(shipStats.Speed, enemyShip.speed * bonus.speed, shipStats.Weight) * result.power / shipStats.Toughness;
				result.toughness = n * enemyShip.hp / (1 - dmgred(enemyShip.armor * bonus.armor));
				var modifiedPower = speedred(enemyShip.speed * bonus.speed, shipStats.Speed, enemyShip.weight) * shipStats.Power;
				result.effect = result.toughness / modifiedPower;
				var weightPercent = n * enemyShip.weight / fleetWeight;
				result.powerEffect = weightPercent * modifiedPower * result.power / result.toughness;
				return result;
			}).reduce(function(obj, v) {
				for(var k in v) obj[k] += v[k];
				return obj;
			}, {
				power: 0,
				harm: 0,
				toughness: 0,
				effect: 0,
				powerEffect: 0,
			});
			if(netEffect.harm) shipStats.Toughness = netEffect.power / netEffect.harm;
			if(netEffect.harm && shipStats.Duration) shipStats.Duration /= netEffect.harm;
			if(netEffect.effect) shipStats["Killing Power"] = netEffect.toughness / netEffect.effect;
			if(netEffect.powerEffect) shipStats.Crippling = netEffect.powerEffect;
		}
		return shipStats;
	}
	function shipSummary(ship, friend, foe) {
		var shipStats = shipSummaryData(ship, friend, foe)
		if(ship.id == 14) {
			if(friend) {
				var fleetStats = fleetSummaryData(friend, foe);
				var precount = friend.ships[ship.id];
				var bonusChange = (1 + .1 * Math.log2(2 + precount)) / (1 + .1 * Math.log2(1 + precount));
				shipStats.Power *= bonusChange;
				shipStats.Power += fleetStats.Power * (bonusChange - 1);
				shipStats["Killing Power"] *= bonusChange;
				shipStats["Killing Power"] += fleetStats["Killing Power"] * (bonusChange - 1);
				shipStats.Crippling *= bonusChange;
				shipStats.Crippling += fleetStats.Crippling * (bonusChange - 1);
			} else {
				shipStats.Power *= 1.1;
				shipStats["Killing Power"] *= 1.1;
				shipStats.Crippling *= 1.1;
			}
		}
		return beautyObj(shipStats);
	}
	function fleetSummaryData(friend, foe) {
		return friend.ships.map(function(n, k) {
			if(n == 0) return false;
			var ship = ships[k];
			var shipStats = shipSummaryData(ship, friend, foe);
			shipStats.Count = n;
			return shipStats;
		}).filter(Boolean).map(function(v) {
			for(var k in v) v[k] *= v.Count;
			delete v.Speed; delete v.Duration; delete v.Count;
			return v;
		}).reduce(function(obj, v) {
			for(var k in v) obj[k] += v[k];
			return obj;
		}, {
			Power: 0,
			Armor: 0,
			HP: 0,
			Toughness: 0,
			Weight: 0,
			"Killing Power": 0,
			Crippling: 0,
		});
	}
	function writeFleetSummary(container, friend, foe) {
		while(container.lastChild) container.removeChild(container.lastChild);

		var fleetData = fleetSummaryData(friend, foe);
		var tooltips = {
			Toughness: "Total amount of raw Power this fleet can absorb before dying",
			Weight: "Total mass of ships damage is spread across (helps to keep weaker ships alive)",
			"Killing Power": "Progress toward killing the enemy outright (opposes enemy Toughness)",
			Crippling: "Damage inflicted against enemy Power (reduces losses in later rounds)",
		};
		for(var k in fleetData) {
			if(!tooltips[k]) continue;
			var v = fleetData[k];
			var row = div(txt(k + ": " + (typeof v === "number" ? beauty(v) : v)));
			row.title = tooltips[k];
			container.appendChild(row);
		}
	}
	function fleetBonus(fleet) {
		var bonus = {
			power: 1,
			armor: 1,
			speed: 1,
		};
		["ammunition", "u-ammunition", "t-ammunition"].map(function(name) {
			var resource = resourcesName[name];
			bonus.power += calcBonus[name](fleet.storage[resource.id]);
		});
		bonus.power *= (1 + .1 * Math.log(1 + fleet.ships[14]) / Math.log(2));
		["armor"].map(function(name) {
			var resource = resourcesName[name];
			bonus.armor += calcBonus[name](fleet.storage[resource.id]);
		});
		["engine"].map(function(name) {
			var resource = resourcesName[name];
			bonus.speed += calcBonus[name](fleet.storage[resource.id]);
		});
		return bonus;
	}
	function fleetStats(fleet, enemy) {
		var power = 0,
		    armor = 0,
		    hp = 0,
		    threat = 0,
		    toughness = 0,
		    speedpower = 0,
		    speedtough = 0,
		    rawpower = 0,
		    rawtough = 0;
		var bonus = fleetBonus(fleet);
		fleet.ships.map(function(n, k) {
			if(n == 0) return;
			var ship = ships[k];
			power += n * ship.power * bonus.power;
			armor += n * ship.armor * bonus.armor;
			hp += n * ship.hp;
			var shiptough = ship.hp / (1 - dmgred(ship.armor * bonus.armor));
			threat += (n+1) * ship.power * bonus.power;
			toughness += n * shiptough;
			speedpower += (n+1) * ship.power * bonus.power * speedred(1, ship.speed * bonus.speed, 100000);
			speedtough += n * shiptough / speedred(ship.speed * bonus.speed, 1, ship.weight);
		});
		return {
			Power: power,
			Armor: armor,
			HP: hp,
			Toughness: toughness,
			Value: Math.sqrt(speedpower * speedtough),
		};
	}
	function shipinput(ship, n) {
		var label = span(txt(ship.name));
		label.title = shipSummary(ship);
		var input = el("input");
		input.type = "text";
		input.label = label;
		input.ship = ship;
		if(typeof n !== "undefined") input.value = n;
		input.showLosses = span();
		return div(label, input, input.showLosses);
	}
	function shipselector() {
		var pick_new_ship = el("select");
		available_ships.map(function(ship, k) {
			var option = el("option");
			option.value = k;
			option.innerText = ship.name;
			option.ship = ship;
			return option;
		}).map(appendTo(pick_new_ship));
		var add_new_ship = el("input");
		add_new_ship.type = "button";
		add_new_ship.value = "Add Ship";
		var row = div(span(pick_new_ship), add_new_ship);
		add_new_ship.onclick = function() {
			var i = pick_new_ship.selectedIndex;
			if(i == -1) return;
			var o = pick_new_ship.options[i];
			var parent = row.parentNode;
			parent.removeChild(row);
			parent.appendChild(shipinput(o.ship));
			delete available_ships[o.value];
			parent.appendChild(shipselector(available_ships));
		};
		return row;
	}
	function inputval(input) {
		delete input.title;
		input.setCustomValidity("");

		var value = input.value;
		try {
			value = eval(value);
		} catch(e) {
			input.title = e.message;
			input.setCustomValidity(e.message);
		}
		return parseInt(value) || 0;
	}

	var saveData;
	try {
		saveData = deserialize(window.location.hash.substring(1)) || JSON.parse(localStorage.getItem("battlecalc-persist")) || {};
	} catch(e) {
		console.log(e);
		saveData = {};
	};
	if(window.location.hash) {
		window.history.replaceState({}, document.title, window.location.pathname);
	}

	var shiplist = document.getElementById("shiplist");
	var available_ships = ships.slice();
	game.ships.map(function(ship) {
		var n;
		if(saveData.ships && saveData.ships[ship.id]) n = saveData.ships[ship.id];
		else if(ship.type === "Colonial Ship" || ship.type === "Cargoship") return;
		shiplist.appendChild(shipinput(ship, n));
		delete available_ships[ship.id];
	});
	saveData.ships && Object.keys(saveData.ships).map(function(k) {
		if(!available_ships[k]) return;
		var n = saveData.ships[k];
		shiplist.appendChild(shipinput(ships[k], n));
		delete available_ships[k];
	});
	shiplist.appendChild(shipselector());

	shiplist.statBlock = span();
	shiplist.statBlock.className = "statblock";
	shiplist.parentNode.appendChild(shiplist.statBlock);
	shiplist.statBlockCombat = span();
	shiplist.statBlockCombat.className = "statblock combat";
	shiplist.parentNode.appendChild(shiplist.statBlockCombat);

	var stufflist = document.getElementById("stufflist");
	["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"].map(function(name) {
		var resource = resourcesName[name];
		var input = el("input");
		input.type = "text";
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.resource = resource;
		input.showValue = span();
		return div(span(txt(name)), input, input.showValue);
	}).map(appendTo(stufflist));
	["artofwar"].map(function(name) {
		var research = researches[researchesName[name]];
		var input = el("input");
		input.type = "text";
		input.name = name;
		if(saveData.bonuses && saveData.bonuses[name]) input.value = saveData.bonuses[name];
		input.research = research;
		return div(span(txt(research.name)), input);
	}).map(appendTo(stufflist));
	var calcBonus = {
		"ammunition": function(v) { return 10 * Math.log(1 + v / 1E7)/Math.log(2); },
		"u-ammunition": function(v) { return 20 * Math.log(1 + v / 1E7)/Math.log(2); },
		"t-ammunition": function(v) { return 60 * Math.log(1 + v / 2E7)/Math.log(2); },
		"armor": function(v) { return v / 2e6; },
		"engine": function(v) { return v / 5e6; },
	};

	var enemylist = document.getElementById("enemylist");
	var enemypicker = el("select");
	planets.map(function(planet) {
		for(var k in planet.fleets) {
			var fleet = planet.fleets[k];
			if(!fleet.weight()) continue;
			var text = planet.name + " - " + fleet.name;
			var option = el("option");
			option.innerText = text;
			option.value = planet.id + "_" + k;
			option.fleet = fleet;
			enemypicker.appendChild(option);
		}
	});
	arr(enemypicker.options).sort(function(a, b) { return fleetStats(a.fleet).Value - fleetStats(b.fleet).Value; }).map(appendTo(enemypicker));
	enemylist.parentNode.insertBefore(div(span(txt("Enemy Fleet")), enemypicker), enemylist);
	if(isFinite(saveData.enemySelected)) enemypicker.selectedIndex = saveData.enemySelected;
	else if(saveData.enemySelected) enemypicker.value = saveData.enemySelected;
	enemypicker.onchange = function() {
		var i = enemypicker.selectedIndex;
		if(i == -1) return;
		var parent = enemypicker.parentNode;
		while(enemylist.lastChild) enemylist.removeChild(enemylist.lastChild);
		var o = enemypicker.options[i];
		o.fleet.ships.map(function(n, k) {
			if(!n) return;
			var ship = ships[k];
			enemylist.appendChild(shipinput(ship, n));
		});
	};
	enemypicker.onchange();
	if(saveData.enemies) {
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.enemies[input.ship.id] || "";
			delete saveData.enemies[input.ship.id];
		});
		Object.keys(saveData.enemies).map(function(k) {
			if(!ships[k]) return;
			var n = saveData.enemies[k];
			enemylist.appendChild(shipinput(ships[k], n));
		});
	}

	enemylist.statBlock = span();
	enemylist.statBlock.className = "statblock";
	enemylist.parentNode.appendChild(enemylist.statBlock);
	enemylist.statBlockCombat = span();
	enemylist.statBlockCombat.className = "statblock combat";
	enemylist.parentNode.appendChild(enemylist.statBlockCombat);

	window.onhashchange = function() {
		saveData = deserialize(window.location.hash.substring(1)) || {};

		saveData.ships && arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(!input.ship) return;
			input.value = saveData.ships[input.ship.id] || "";
		});
		saveData.ships && Object.keys(saveData.ships).map(function(k) {
			if(!available_ships[k]) return;
			var n = saveData.ships[k] || "";
			shiplist.appendChild(shipinput(ships[k], n));
			delete available_ships[k];
		});
		saveData.bonuses && arr(stufflist.getElementsByTagName("input")).map(function(input) {
			input.value = saveData.bonuses[input.name] || "";
		});
		if(saveData.enemySelected) {
			if(isFinite(saveData.enemySelected)) enemypicker.selectedIndex = saveData.enemySelected;
			else enemypicker.value = saveData.enemySelected;
			enemypicker.onchange();
		}
		saveData.enemies && arr(enemylist.getElementsByTagName("input")).map(function(input) {
			if(!input.ship) return;
			input.value = saveData.enemies[input.ship.id] || "";
			delete saveData.enemies[input.ship.id];
		});
		saveData.enemies && Object.keys(saveData.enemies).map(function(k) {
			if(!ships[k]) return;
			var n = saveData.enemies[k] || "";
			enemylist.appendChild(shipinput(ships[k], n));
		});
		window.history.replaceState({}, document.title, window.location.pathname);
		update();
	};

	var battlereport = document.getElementById("battlereport");
	var exporter = document.getElementById("exporter");
	var nextrun = document.getElementById("nextrun");
	if(window.name) nextrun.target = window.name+"+";
	var update = document.getElementById("battlecalc").onchange = function() {
		saveData = {
			ships: {},
			bonuses: {},
			enemies: {},
		};

		var warfleet = new Fleet(0, "Simulation");
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(val > 0) warfleet.ships[input.ship.id] = saveData.ships[input.ship.id] = val;
		});
		arr(stufflist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(input.resource) {
				warfleet.storage[input.resource.id] = val;
				input.showValue.innerText = "+"+beauty(calcBonus[input.resource.name](warfleet.storage[input.resource.id])) + "x";
			} else if(input.research) {
				var newLevel = val;
				while(input.research.level > newLevel) { input.research.level--; input.research.unbonus(); }
				while(input.research.level < newLevel) { input.research.level++; input.research.bonus(); }
			}
			if(val > 0) saveData.bonuses[input.name] = val;
		});
		var enemy = new Fleet(1, "Test Dummy");
		saveData.enemySelected = enemypicker.value;
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			var val = inputval(input);
			if(val > 0) enemy.ships[input.ship.id] = saveData.enemies[input.ship.id] = val;
		});

		shiplist.statBlock.innerText = beautyObj(fleetStats(warfleet, enemy));
		writeFleetSummary(shiplist.statBlockCombat, warfleet, enemy);
		enemylist.statBlock.innerText = beautyObj(fleetStats(enemy, warfleet));
		writeFleetSummary(enemylist.statBlockCombat, enemy, warfleet);

		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.label.title = shipSummary(input.ship, warfleet, enemy);
		});
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.label.title = shipSummary(input.ship, enemy, warfleet);
		});

		battlereport.innerHTML = enemy.battle(warfleet).r;
		arr(shiplist.getElementsByTagName("input")).map(function(input) {
			if(input.type === "button") return;
			input.showLosses.innerText = warfleet.ships[input.ship.id];
		});
		shiplist.dataset.weightRemaining = warfleet.weight();
		arr(enemylist.getElementsByTagName("input")).map(function(input) {
			input.showLosses.innerText = enemy.ships[input.ship.id];
		});
		enemylist.dataset.weightRemaining = enemy.weight();

		var basePath = location.protocol+'//'+location.host+location.pathname;
		exporter.href = exporter.firstChild.alt = basePath+"#"+serialize(saveData);
		localStorage.setItem("battlecalc-persist", JSON.stringify(saveData));

		nextrun.href = basePath+"#"+serialize({
			ships: warfleet.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
			bonuses: ["artofwar"].reduce(function(obj, name) {
				var research = researches[researchesName[name]];
				var v = research.level;
				if(v > 0) obj[name] = v;
				return obj;
			}, (warfleet.weight() ? ["ammunition", "u-ammunition", "t-ammunition", "armor", "engine"] : []).reduce(function(obj, name) {
				var resource = resourcesName[name];
				var v = warfleet.storage[resource.id];
				if(v > 0) obj[name] = v;
				return obj;
			}, {})),
			enemySelected: enemypicker.selectedIndex + (enemy.weight() ? 0 : 1),
			enemies: enemy.ships.reduce(function(obj, v, k) { if(v > 0) obj[k] = v; return obj; }, {}),
		});
	};
	update();
});
