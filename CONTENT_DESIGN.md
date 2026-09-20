# Initial content direction

Companion to [GAMEPLAY_ARCHITECTURE.md](GAMEPLAY_ARCHITECTURE.md). This is an example roster to exercise the architecture, not a promise to build every item in the first release. Values and exact names remain tunable.

## Towers

| Tower | Base behavior | Specialization A | Specialization B | Main tradeoff |
| --- | --- | --- | --- | --- |
| Repulsor | Directional pulses shove the front line into obstacles/crowds | Ram: narrow, high impulse bursts | Wave: broad, frequent crowd shaping | Weak in open space; heavies resist displacement |
| Mortar | Arcing shells apply blast damage and radial impulse | Siege: heavy single impacts | Cluster: several bounded smaller impacts | Can disperse a useful pileup when poorly aimed |
| Autocannon | Rapid kinetic shots remove runners and stragglers | Piercer: limited penetration | Suppressor: wider coverage and short drive reduction | Less efficient against a huge packed wave |
| Cryo emitter | Cone reduces drive speed and eventually applies brittle | Deep Freeze: stronger local control | Cold Front: wider, longer coverage | Little direct damage; frozen bodies still move |
| Attractor | Persistent field biases navigation toward a chosen region | Lure: larger reachable attraction zone | Vortex: physical inward/tangential force, requiring a new unlocked delivery mode | Can create a dangerous concentrated breach |
| Arc coil | Bounded electric chains strike nearby targets | Conductor: chains favor conductive enemies | Capacitor: slower, stronger short chains | Chain target count and revisit rules are explicit |
| Incinerator | Applies burn in a cone/area | Furnace: sustained local heat | Wildfire: bounded contact-based spread | Spread adds simulation work and needs its own tested primitive |
| Rail lance | Long, narrow kinetic line attack | Executioner: boss/armored-target focus | Skewer: limited multi-hit piercing | Poor coverage outside its firing lane |
| Crusher | Telegraphed mechanical sweep squeezes a local pocket | Press: stronger, slower crush cycle | Roller: repeated smaller sweeps | Needs dynamic collider support and clear escape/clearance rules |
| Field station | Buffs nearby eligible towers through the modifier system | Logistics: firing/reload support | Overcharge: stronger effects with an explicit drawback | Occupies build space without attacking |

First playable roster: **repulsor, mortar, autocannon, cryo emitter**. This covers directional impulse, area impulse, precise damage, and crowd control without requiring every advanced delivery mode.

## Example upgrade tree: repulsor

1. Common improvement: better range/aim control.
2. Choose an exclusive branch: Ram or Wave.
3. Choose a branch upgrade that changes pulse width, impulse, or cadence.
4. Buy a capstone: Ram creates a telegraphed charged shove; Wave alternates pulse directions to gather then redirect crowds.

The alternating capstone requires a supported firing pattern, not a special case hidden in damage code. A branch locks on purchase; selling and rebuilding can be the initial respec mechanism, with a visible refund rate.

## Zombie kinds

| Kind | Physical/behavioral identity | Strategic answer |
| --- | --- | --- |
| Shambler | Baseline body, low armor, ordinary crush tolerance | Establishes the core crowd behavior |
| Runner | Fast drive, low mass, low health | Precision coverage catches dispersed runners; slows create pileups |
| Brute | Larger occupied area, high mass, strong drive, higher crush tolerance | Weakens displacement strategies but can transmit pressure into weaker neighbors |
| Rager | Ordinary body with unusually strong forward drive | Kill or redirect it before it compresses the crowd ahead |
| Softbody | Large occupied area, low mass, and a high pressure limit | Direct damage clears a pressure-resistant obstruction |
| Husk | Small pale body with a very low pressure limit | Deliberately jam it to trigger cascading crush kills |
| Plated | Kinetic armor, ordinary or only modestly increased crush tolerance | Crush and non-kinetic damage exploit its specialization |
| Bloater | Limited, telegraphed death burst with explicit team damage rules | Timing its death can disrupt or damage a crowd; chain depth is bounded |
| Gelatinous | High contact compliance and crush tolerance, low heat resistance | Tests damage diversity without simply inflating health |
| Screamer | Local aura increases nearby drive strength | Priority targeting prevents sudden pressure surges |
| Regenerator | Capped recovery after a damage-free interval | Sustained damage counters recovery; cannot create extra bounties |
| Brood carrier | Releases a fixed reserve of small enemies | Tests target saturation; children inherit explicit reward budgets |

First playable enemy roster: **shambler, runner, brute, rager, softbody, and husk**. Hue communicates role while radius, mass, drive, health, pressure-damage onset, and crush resistance remain independent authored stats.

Enemy traits such as plated or conductive can later appear on compatible kinds, but combinations are curated. Spawn visuals and previews should identify the combination. An unconstrained random trait generator would create unreadable or unwinnable waves.

## Bosses

**The Bulldozer — first boss.** A slow, broad threat with a charge phase that drives a wave of zombies ahead of it. A visible brace exposes a vulnerable interval before the charge. The encounter rewards clearing space, slowing its escort, and exploiting its recovery. It has crush resistance rather than complete pressure immunity. Initial implementation uses one bounded collision shape and a short list of authored attacks.

**The Brood Engine.** Carries a finite reinforcement reserve and periodically changes which lanes receive its children. Destroying exposed spawn organs pauses a spawn pattern. It tests area coverage and reserve planning. Weak-point targeting and spawn caps must exist before this boss is added.

**The Bellwether.** Switches between visible auras that accelerate, brace, or redirect nearby zombies. It tests whether the defense can tolerate different crowd properties. Aura stacking and navigation changes must have clear limits. Killing it removes the aura on the next defined simulation boundary.

Boss difficulty should come from an altered tactical situation, predictable dangerous attacks, and escort composition. Health multipliers alone are insufficient.

## Run bonuses

| Bonus | Rule | Choice it creates |
| --- | --- | --- |
| Hydraulic advantage | Repulsor-family impulse increases; firing interval also increases | Strong shoves versus steady control |
| Cold fracture | Brittle enemies take additional crush damage | Commits toward cryo/pressure combinations |
| Conductive residue | Selected status makes enemies eligible for improved electric chains | Connects two weapon families without universal damage inflation |
| Salvage contract | Larger guaranteed next-wave payment; smaller immediate payment | Future growth versus immediate survival |
| Emergency capacitor | Limited player-triggered pulse with a visible recharge/charge count | Timing and positioning rather than passive damage |
| Clean finish | Bonus on completing a wave without base damage | Rewards reliable defenses without paying per-particle extras |

Offer a small selection only at announced milestones. Filter out bonuses with no usable target unless the choice explicitly provides access to the required tower. Show stacking limits and current affected towers. Do not silently reroll a committed choice after loading a save.

## Combinations to demonstrate

- **Cryo + repulsor + wall:** slow the front, allow the rear to accumulate, then compress the pack.
- **Attractor + mortar:** group enemies, then choose whether the blast should hit the center for damage or the edge to push the pack into an obstacle.
- **Brutes + shamblers:** a heavy front can resist pushes while the crowd behind keeps driving; killing the brute opens a sudden release path.
- **Autocannon + mortar:** precise coverage catches enemies that survive and scatter after an explosion.

These are hypotheses to playtest. Compare each against a plain damage-focused defense at equal cost. A visually dramatic interaction only earns its place if the player can predict it, influence it, and understand the result.

## Wave composition

Author introductions and boss encounters. Describe ordinary waves as overlapping groups with kind/traits, count, inlet band, onset, cadence, burst size, and reward allocation. A threat budget is a tuning aid, not a substitute for playtesting interacting compositions.

Introduce one new pressure problem at a time: an open shambler flow, runners around the edge, a dense surge, then heavies embedded in the crowd. Preview enemy roles and lanes before preparation ends. Later mixed waves should test an established response before adding another mechanic.

Do not spawn all enemies in an overlapping point. Use lane entry regions with valid spacing and controlled inflow; queue excess arrivals. Spawn-caused numerical compression must not grant free kills or produce an unannounced difficulty spike.
