# PORT MERCER — Leon Bay

A 3D open-world crime story in the browser. Leon Cross, ex-getaway driver,
comes home to Leon Bay broke and owing $2,500 to Marlon "The Broker" Vane.
Seven jobs to clear the debt — but the man who owns the debt is selling Leon
to the police, one job at a time. The last job isn't a robbery. It's stealing
the book with every name in it.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

```sh
node main.ts
# re-renders the four screenshots from real gameplay states and writes
# output/dossier.json (deterministic: run it twice, the dossier is identical)
```

```sh
node game/tests/test-missions.mjs
# 54 tests: the mission state machine + the top-3 shot checklist
```

## Controls

| Keys | What they do |
| --- | --- |
| W A S D | Drive / walk |
| E | Jack a car, talk to someone |
| Space | Handbrake |
| F | Punch |
| Mouse + click | Aim and shoot |
| M | Radio station / mute |
| P | Photo mode (hides the HUD) |
| Esc | Pause |

## Story — "The Mercer Ledger"

Seven jobs, one arc, two reveals and a twist. Job pay goes to the Broker
first until the debt is $0; what is left over is Leon's.

| Job | What happens | Pay | Debt after |
| --- | --- | --- | --- |
| 1 First Wheels | Steal a car in Old Mercer, bring it to Rook's Garage | $500 | $2,000 |
| 2 The Pickup | A taped shoebox, Bayview Pawn to the Coral Motel, 75 s | $800 | $1,200 |
| 3 Heat Wave | Reach 3 stars, lose the tail, reach the Spire unseen | $1,500 gross, $700 "fee" | $400 |
| 4 The Gull's Cut | Hit Dante's money van in Palm Court at dusk, escape the heli | $2,000 | $0 |
| 5 Wires Crossed | Get the ledger out of the Diner before Kline's raid, 150 s | the ledger itself | $0 |
| 6 The Last Drop | Take the Broker's payoff cash on the docks, 120 s | $600 | $0 |
| 7 The Mercer Score | The counting house, the safe, 5-star heat, Iris's studio | $3,000 | $0 |

Story total: **$8,400**. The debt ledger is the spine — every dollar is
accounted for, and the $700 "fee" in job 3 is the crack in the story: the
Broker has been skimming Leon all along. The van manifest in job 4 names
him as Dante's informant. From there Leon works for himself.

### The ending choice

After the finale Leon holds the ledger and chooses:

- **BROADCAST** — Iris reads the names live on BAY TALK 94.5. The Broker is
  arrested, the counting house is raided, Kline closes the file. Wanted
  stars decay twice as fast in free roam from now on.
- **BURN** — Leon burns the book in the Spire's shadow. The Broker has
  nothing left to sell, Dante has no leverage — but Kline's file stays open
  and wanted decays at the normal rate.

Both endings pay the $3,000. The save records the choice.

### Cast

- **Leon Cross, 27** — the player. Worn leather jacket, his father's.
  "I don't run. I drive."
- **Marlon "The Broker" Vane, 54** — holds the debt, sells Leon to the
  police. "Everything's a transaction, Lee. Even loyalty. Especially loyalty."
- **Rook, 31** — Rook's Garage, Leon's oldest friend.
  "You don't owe him money, Lee. You owe him fear."
- **Sal, 60s** — the Salty Gull Diner. Says one line per mission — the one
  that matters. "Heavier than it looks, that one."
- **Detective Mara Kline, 38** — Leon Bay PD. Her partner was crippled in
  the bad job three years ago. "I don't want an arrest, Cross. I want a name."
- **Dante "The Gull" Ferro, 45** — runs Palm Court's money.
  "The Gull always collects."
- **Iris Vale, 33** — BAY TALK 94.5, studio above the Diner. Reads the news
  Leon makes, live on air. "Tonight, Leon Bay learns every name. Starting
  with mine."

### The city

Five districts, each a story beat: **Furnace Row** (factories, the Broker's
first jobs), **Gullhaven** (docks, the Diner, the Pawn, the Motel),
**Old Mercer** (Rook's Garage, Leon's childhood home with the blue door),
**Palm Court** (money — 1 star just for speeding here), **Mercer Spire**
(the 40-storey landmark; its beacon blinks every 4 seconds).

## Systems

- **Police, 5 stars** — response units with names, distances and live
  status (RAMMING / PURSUIT / ROADBLOCK / SPOTLIGHT ON YOU), helicopter
  with a spotlight cone from 4 stars, SEARCHING when you break line of
  sight. Palm Court speeding alone earns a star.
- **Radio** — BAY TALK 94.5 (Iris reports your own crimes back to you, one
  line per mission), HARBOUR FM 88.3 (chase music), GULL ROCK 101.7 (race
  music, tempo rises with wanted level).
- **Shops and safehouse** — Bayview Pawn (armour $400, ammo $50 a box, sell
  hot goods at 10–40%), Rook's Garage (respray $300, five colours — the
  wanted-break tool), Coral Motel (safehouse: wanted decays 2x faster
  there; slots in the bar, $50 a pull, jackpot $1,000).
- **Side jobs** — street race (Gullhaven loop, 3 laps, entry $200, prize
  $600), Diner deliveries for Sal ($150 each, 90 s per drop, three rotating
  lines), slots, respray, pawn.
- **On foot and by car** — jack cars, talk to Sal, fight, shoot, lose the
  tail, switch cars to break the police description.
- **Saves** — the mission chain, cash, debt, side-job progress and the
  ending choice persist in local storage.

## Screenshots

Rendered headlessly from real gameplay states (fixed seed 20261118, fixed
tick counts — the same run twice produces the same pixels). 1280x720 JPEG.

| Shot | Frame | SHA-256 |
| --- | --- | --- |
| 1-cover.jpg | Mission 4/7 The Gull's Cut, 4 stars, Palm Court dusk 17:45, heli + spotlight | `e9cdbd853ba95c4d780d1fa80404a05b382996da08bdb0c22bcd3f32a5384783` |
| 2-street.jpg | Mission 2/7 The Pickup, 3 stars, Gullhaven beachfront daylight 11:20, Gullhaven Wheel | `9eab48c2424ac871620b5517dd513a219976e9aaad04d3e2767efee6ef1734f8` |
| 3-mission.jpg | Mission 5/7 Wires Crossed, on foot at the Salty Gull Diner, 1 star, 21:30, talk to Sal | `1f35a3c8319e75936b5c724bba3b90d85f725d83af3227f2d3894c4772eb41be` |
| 4-night.jpg | Mission 7/7 The Mercer Score, 5 stars, Palm Court dusk 18:24, drifting, 61% condition | `f4688e802a453c615344ab69cd46639745e71b1f5a5106b966e89e8b619bf227` |

Sizes: 1-cover.jpg 225,035 bytes; 2-street.jpg 179,118 bytes;
3-mission.jpg 189,601 bytes; 4-night.jpg 237,326 bytes.

## How it is built

- **three.js r152** (vendored under `game/vendor/three/`), WebGL1. One
  InstancedMesh for the whole city, one scene shared by the browser and
  the headless renderer.
- **Headless staging** (`game/src/three-headless.mjs`) runs the real game
  under headless-gl, plays the real mission chain to each shot's state,
  renders one frame, and composites the HUD from the same model the
  browser DOM uses — the screenshot HUD and the browser HUD cannot drift.
- **Deterministic** — fixed seed, fixed ticks, no wall-clock input to any
  staged value. `main.ts` re-renders on every run and writes the dossier.
- **Layout** — `game/index.html` loads `game/src/three-browser.js`;
  `game/src/` holds the game (main, city, render, missions, police,
  traffic, combat, audio, hud, font, shot-hud, headless, browser);
  `game/tests/test-missions.mjs` holds the 54 tests.

## License

MIT — see LICENSE.
