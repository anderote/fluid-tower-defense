# Infantry barracks

Build **Infantry Barracks** from Infantry Command for 600 Metal, then click the
building to set its rally point or upgrade it. Recruitment advances only during
combat: one rifleman every eight seconds, with a maximum of eight living troops
per building and eight barracks per map. Recruits have no additional Metal cost.
Blocked exits hold the completed recruit until a route becomes available.

Production and training each have five independent levels. Production multiplies
the recruitment interval by 0.82 per level, preserving current percentage progress.
Training affects new recruits only: 40 + 12 × rank health, 9 + 3 × rank damage,
and a firing interval of 0.8 / (1 + 0.08 × rank) seconds. Upgrade prices start at
200 Metal and rise by 150 per level. Rifle range is 14 world units.

Riflemen navigate around structures toward a rally area, fire at visible nearby
zombies, and retreat from close threats within a six-unit rally boundary. They
never block allies, zombies, or tower fire. Zombie contact and local pressure
hurt them; casualties free a recruitment slot. Soldiers have walking, muzzle
flash, health, rank, and fading corpse visuals. Barracks use a solid 4 × 4
foundation. Selling one recovers half its investment and dismisses its squad.

Buildings, recruitment progress, and surviving soldiers persist in between-wave
saves. Older saves load with no infantry. Level relocation refunds the full
building investment and clears the squad; restarting a level clears both.

The CPU owns recruitment, friendly health, and obstacle-aware rally fields.
The GPU senses nearby enemies at up to 10 Hz; bounded asynchronous results carry
particle generations. CPU rifle commands are revalidated for generation, range,
and line of sight on the GPU before damage. Standard combat settlement awards
kills and salvage exactly once, without assigning rifle kills to a tower.
Riflemen currently target the ordinary zombie swarm, not the separate boss body.

Validation: `npm test`, `npm run build`, and `/tests/infantry/` for actual WebGPU
targeting, obstruction, recycled-slot protection, and kill settlement. Browser
playtesting covers building, upgrades, rally placement, recruitment, and firing.
