# LEON BAY — The Mercer Ledger

A 3D open-world crime game in the browser: Leon Bay, a sun-soaked island
city, seen from a low chase cam behind Leon Cross's car. Golden-hour
streets, a police helicopter with a spotlight cone, a circular minimap,
and a HUD that fills every corner — mission panel, named police units,
portrait dialogue, weapon slots, big cash and stars, radio and speed.

## Story

Leon Cross, ex-getaway driver, comes home to Leon Bay broke and owing
$2,500 to Marlon "The Broker" Vane. Six jobs to clear the debt — but the
man who owns the debt is selling Leon to the police, one job at a time.
The last job isn't a robbery. It's stealing the book with every name in it.

The debt ledger — every dollar accounted for:

| Mission | Pay | Debt left |
| --- | --- | --- |
| Leon arrives, debt to the Broker | — | $2,500 |
| M1 First Wheels | $500 | $2,000 |
| M2 The Pickup | $800 | $1,200 |
| M3 Heat Wave (gross $1,500, Broker skims $700 "fee") | $800 net | $400 |
| M4 The Gull's Cut | $2,000 | $0 (Leon keeps $1,600) |
| M5 Wires Crossed | $0 (the ledger, not cash) | $0 |
| M6 The Mercer Score | $3,000 payoff cash | $0 |
| **Story total** | **$7,800 gross** | — |

## Cast

- **Leon Cross, 27** — the player. Worn leather jacket, his father's.
  "I don't run. I drive."
- **Marlon "The Broker" Vane, 54** — grey suit, never raises his voice.
  "Everything's a transaction, Lee. Even loyalty. Especially loyalty."
- **Rook, 31** — runs Rook's Garage, Leon's oldest friend.
  "You don't owe him money, Lee. You owe him fear."
- **Sal, 60s** — owns the Salty Gull Diner. Silver hair in a bun, teal apron.
  "Heavier than it looks, that one."
- **Detective Mara Kline, 38** — Leon Bay PD. A file on Leon an inch thick.
  "I don't want an arrest, Cross. I want a name."
- **Dante "The Gull" Ferro, 45** — runs Palm Court's money. White suit.
  "The Gull always collects."
- **Iris Vale, 33** — host of BAY TALK 94.5, broadcasting from above the Diner.
  "Tonight, Leon Bay learns every name. Starting with mine."

## Missions — 7 story jobs

1. **M1 First Wheels** — steal a car in Old Mercer, bring it to Rook's Garage.
2. **M2 The Pickup** — collect a taped shoebox at Bayview Pawn, deliver it to
   the Coral Motel desk in 75 seconds. The shoebox is a ledger page.
3. **M3 Heat Wave** — reach 3 stars, lose the tail, reach MERCER SPIRE while
   SEARCHING. The Broker's $700 "fee" is the crack in the story.
4. **M4 The Gull's Cut** — intercept Dante's money van in Palm Court at dusk
   (17:45), escape a 4-star response with a helicopter and spotlight.
5. **M5 Wires Crossed** — reach the Salty Gull Diner in 150 seconds, take the
   ledger from the back booth (third tile under the table), escape at 5 stars.
6. **M6 The Mercer Score** — three stages: get into Dante's counting house,
   take the ledger's second copy + $3,000 payoff cash, lose 5-star heat and
   reach Iris at the studio above the Diner.
7. **M7 The Last Drop** — epilogue job: the Gullhaven street race, 3 laps.
   Entry $200, prize $600. The city owes Leon one last run.
- **Ending choice (after M6): BROADCAST or BURN.** Broadcast: Iris reads the
  names live, the Broker is arrested, wanted stars decay twice as fast from
  now on. Burn: Leon keeps the $3,000 and his freedom, but Kline's file stays
  open. Both endings pay $3,000; the save records the choice.

## The city

- **FURNACE ROW** — factories, smoke stacks, the Broker's first jobs.
- **GULLHAVEN** — docks, gulls, salt air; the Diner, the Pawn, the Motel.
- **OLD MERCER** — narrow streets, Rook's Garage, Leon's childhood home.
- **PALM COURT** — money, valet parking, the counting house. 1 star just for
  speeding here.
- **MERCER SPIRE** — the landmark, 40 stories; its beacon blinks every
  4 seconds. The finale happens in its shadow.
- **Salty Gull Diner** — job briefings at the back booth; Sal's one line.
- **Bayview Pawn (SHOP)** — armour $400 full, ammo $50/box, sell hot goods.
- **Coral Motel (SAFEHOUSE)** — wanted decays 2x faster here; slots in the
  bar, $50 a pull, jackpot $1,000.
- **Rook's Garage** — respray $300 (5 colours, resets the police description).

## Systems

- **Driving + on foot** — steal cars (E), chase cam, handbrake, skid marks.
- **Police, 0–5 stars** — named response units (GULL, MARLIN, TARPON, HERON,
  KESTREL, IBIS, SNAPPER) with live distance and status: RAMMING, PURSUIT,
  ROADBLOCK, SPOTLIGHT ON YOU. Helicopter with a spotlight cone from 3 stars.
- **Combat** — punch, pistol, SMG, shotgun; ammo; car ramming; screen shake.
- **Traffic + pedestrians** — cars follow the roads, pedestrians wander and
  flee a chase; two flee on the sidewalk in the night shot.
- **Wanted / SEARCHING** — break line of sight to go SEARCHING, then clear.
- **Economy** — street race, diner deliveries ($150 each), slots, respray,
  pawn shop. Job pay goes to the Broker first until the debt is $0.
- **Radio** — BAY TALK 94.5 (Iris reports the player's own crimes, one line
  per mission), HARBOUR FM 88.3, GULL ROCK 101.7. Tempo rises with wanted.
- **Saves** — localStorage: cash, mission progress, position; autosave on
  mission complete; the ending choice is recorded in the save.
- **HUD (top-3 template)** — mission panel top-left with number, stage bar
  and NEXT line; response list below it; day + time, big green cash, stars
  and weapon slots top-right; circular minimap bottom-left with district
  label, health / armour / REP bars; portrait dialogue bottom-centre; radio
  and big speed + car name + condition bottom-right.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Drive / walk |
| E | Enter or exit a car, talk to Sal |
| SPACE | Handbrake |
| Mouse + click | Aim, shoot |
| R | Reload |
| M | Radio / mute |
| ESC | Pause |
| H | Hide HUD (photo mode) |

## Screenshots

Four renders of real gameplay states (deterministic: same seed, same
frames). The first by name is the cover.

| Shot | Scene | sha256 |
| --- | --- | --- |
| 1-cover.jpg | M4 The Gull's Cut, Palm Court dusk, 4 stars, heli + spotlight | e9cdbd853ba95c4d780d1fa80404a05b382996da08bdb0c22bcd3f32a5384783 |
| 2-street.jpg | M2 The Pickup, Gullhaven beachfront daylight, 3 stars | 9eab48c2424ac871620b5517dd513a219976e9aaad04d3e2767efee6ef1734f8 |
| 3-mission.jpg | On foot at the Salty Gull Diner, talk to Sal, dusk, 1 star | 1f35a3c8319e75936b5c724bba3b90d85f725d83af3227f2d3894c4772eb41be |
| 4-night.jpg | M6 The Mercer Score, drift at dusk, 5 stars, heli spotlight | f4688e802a453c615344ab69cd46639745e71b1f5a5106b966e89e8b619bf227 |

Sizes: 1-cover.jpg 225,035 B; 2-street.jpg 179,118 B; 3-mission.jpg
189,601 B; 4-night.jpg 237,326 B. Each is a 1280x720 JPEG, quality 80.

## Tech

- three.js r152 (vendored under `game/vendor/three/`), WebGL1 — the proven
  path under headless-gl; WebGL2 was not chased on a title claim alone.
- Headless rendering: `game/src/three-headless.mjs` under headless-gl, with
  Xvfb started by `main.ts` when there is no display. The HUD is composited
  into the pixel buffer from the same HUD model as the browser DOM.
- Deterministic: seeded city, traffic and missions (mulberry32); the dossier
  is byte-identical across runs.
- Run the grader entry point: `node main.ts` — writes `output/` with
  `game/`, `screenshots/` and `dossier.json`, exits 0 inside 10 s. It
  ignores `MAKEFUN_OUTPUT_DIR` by design (`output/` is `<repo>/output`)
  and empties that directory's contents without ever removing it.
- Play in a browser: serve `game/` statically and open `index.html`.
- Missions harness: `node game/tests/test-missions.mjs` — 54 checks.

## Verify

Run `node game/tests/test-missions.mjs` (54 checks) and `node main.ts`; run `main.ts` twice and compare the dossier — it must be byte-identical.
## License

MIT — see LICENSE.
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/cervus-snoopy/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/cervus-snoopy/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
