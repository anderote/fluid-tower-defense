# Infantry eras

Classical is available from the start. Each upgrade is purchased once per run, in order, with Metal. Earlier troops remain buildable. Unlocks survive saves and battlefield relocation; a new run resets them. Legacy saves retain access through their most advanced existing infantry building. Dogs remain a separate utility building.

| Era | Unlock cost | Four units |
| --- | ---: | --- |
| Classical | Free | Samurai, Phalanx Troopers, Archers, Slingers |
| Napoleonic | 2,500 | Musketeers, Grenadiers, Riflemen (skirmishers), Light infantry |
| WW1 | 6,000 | Bolt-action infantry, Machine gunners, Flamethrowers, Trench raiders |
| WW2 | 12,000 | Rifle squad, Assault infantry, Bazooka teams, Paratroopers |
| Modern Infantry | 24,000 | Commandos, Support gunners, Marksmen, Rocket troops |

Costs are incremental: reaching Modern costs 44,500 Metal. Individual buildings and their upgrades cost extra. These are initial balance values; troop roles and squad capacity differ rather than every later unit replacing every earlier unit. Classical is a broad pre-gunpowder gameplay grouping that includes samurai.

Musketeers and grenadiers automatically form two ranks toward the enemy approach and settle before firing. Phalanxes form three ranks and gain frontal protection from neighboring braced hoplites. All infantry can receive Total War-style manual drag formations: draw the front line to set width and facing, with remaining troops filling as many ranks as needed behind it. Narrow drags create deep blocks, wide drags create shallow lines; reversing the drag reverses facing. A full block outline previews its footprint. Both automatic formations close casualty gaps.

Zombie contact displaces infantry independently of their walking velocity. Formation recovery slows under pressure, so dense crowds push ranks backward instead of having their force erased by movement normalization. Fully braced hoplites reduce displacement by 65%; they can still yield. Push speed is capped at 2.5 world units/second, and displacement respects obstacles. When pressure eases, troops return to their ordered slots.

Artwork provenance and reproduction: `public/assets/red-alert/infantry/NOTICE.md`. Troop/building pixels follow the existing original-art pipeline; no new external assets are imported.

## Infantry veterancy

One credited kill grants one XP. Infantry uses role-specific thresholds: total XP for rank N is the first-rank cost × N², capped at rank 100. These are initial balance values based on single-target kill rate, exposure, and crowd-clearing ability, not era or purchase price. Stat bonuses per rank remain unchanged. Tower progression remains 64.8 × N².

| Units | First rank | Rank 5 total | Rank 10 total |
| --- | ---: | ---: | ---: |
| Archers, slingers | 2 | 50 | 200 |
| Musketeers, light infantry, phalanxes, dogs | 3 | 75 | 300 |
| Bolt-action infantry, riflemen, grenadiers, marksmen, samurai | 4 | 100 | 400 |
| Rifle squads, paratroopers | 5 | 125 | 500 |
| Assault infantry, commandos, trench raiders | 6 | 150 | 600 |
| Machine gunners, support gunners | 8 | 200 | 800 |
| Flamethrowers, bazooka teams, rocket troops | 10 | 250 | 1,000 |
| Towers (comparison) | 65 | 1,620 | 6,480 |

Existing infantry recalculates ranks from stored XP when loading; older records without XP use their kill count. Earned ranks are never removed, and promotions do not heal wounds. The unit inspector's experience tooltip uses the same role-specific threshold to show kills remaining to the next rank.
