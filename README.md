# PORT MERCER — Leon Bay

![make.fun](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/cervus-snoopy/makefun-gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/cervus-snoopy/makefun-gta6-01/reward.svg)

An original 2D top-down open-world crime game built for make.fun's ["Make GTA 6" bounty](https://make.fun/bounty/gta6-01). No Rockstar assets, names, or code — everything here is original: the city of Port Mercer, the story of Jules Rook and The Broker, the art, and the synthesized sound.

## The game

Port Mercer, 2026. Jules Rook is back in Leon Bay with $250, a borrowed pistol, and a debt to The Broker. Three jobs stand between Rook and freedom — steal the wheels, run the pickup, survive the heat.

**What ships:**

- **Open city on foot and by car** — a seeded, deterministic grid city (roads, sidewalks, buildings, parks, beachfront) you explore on foot or behind the wheel.
- **Traffic and pedestrians** — cars follow the road grid and turn at intersections; pedestrians wander the sidewalks and flee from gunfire and speeding cars.
- **Stealable cars** — walk up to any parked or traffic car and press **E** to jack it. The driver flees; the law notices.
- **Wanted level 0–5 stars** — stealing, hitting pedestrians, and shooting raise your heat. Police cruisers spawn, chase, and ram. Lay low and out of sight and the stars decay.
- **Missions and story** — three linked jobs ("First Wheels", "The Pickup", "Heat Wave") with markers, timers, objectives, success/fail states, and cash rewards, plus free roam after the story.
- **Combat** — punch (**F**) and pistol (mouse aim, click to shoot), ammo and reload (**R**), muzzle flash, particles, screen shake, and car ramming.
- **Dense HUD + minimap** — health, armour, cash, wanted stars, ammo, weapon, speed, mission objective, and clock, plus a live minimap with player arrow, police blips, and the mission marker.
- **Menus and saves** — start screen with the story, pause (**Esc**), game over with retry, and save/load via localStorage (autosaves on mission completion).
- **Sound** — WebAudio synthesized SFX (gunshots, sirens, engine hum, pickups) and a bass music loop. Starts on first input; **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move / drive |
| Mouse + click | Aim / shoot |
| F | Punch |
| E | Jack a car / exit car |
| Space | Brake |
| R | Reload |
| Enter | Start the next job |
| Esc | Pause |
| M | Mute |

## How to play

Serve the `game/` folder with any static server and open `game/index.html` in desktop Chrome. No network is needed — every file the game loads lives under `game/`.

```sh
node serve.ts --port 8901
# open http://127.0.0.1:8901/
```

Screenshot scenes can be previewed directly: `?shot=cover`, `?shot=street`, `?shot=mission`, or `?shot=night` (with `&seed=<n>`).

## Files

- `game/index.html` — page, canvas, HUD overlay, menus
- `game/src/main.js` — boot, game loop, state machine, input, combat, save/load
- `game/src/world.js` — seeded city generation, roads, collision
- `game/src/entities.js` — player, cars, traffic AI, pedestrians, police AI, wanted level
- `game/src/missions.js` — story thread and the three missions
- `game/src/render.js` — camera, world drawing, HUD, minimap
- `game/src/audio.js` — WebAudio synth SFX and music
- `game/src/shots.js` — scripted screenshot scenes (`?shot=`)
- `main.ts` — builds the entry dossier from `game/` + `screenshots/`

## License

MIT — see `LICENSE`.

---

Entered on [make.fun](https://make.fun/?ref=3bzndvs8)
