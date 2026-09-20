# Battlefield aftermath

Run the development server and open `/tests/aftermath/`. The fixture uses real GPU combat, reads back the bounded aftermath buffers, and exercises bullet/blast/crush deaths, slot recycling, directional nonlethal hits, lethal and nonlethal Tesla exclusion, leaks, overflow, and reset. The timeline controls allow inspection of spray, flight, landing, drying blood and corpse fading. `Reuse dead slots` demonstrates that living replacements do not erase casualties.

The effect observer never writes simulation particles, damage, attribution or Tesla state. It retains at most 2,048 death records and 1,024 hit records, with a maximum 512 writes to each ring per tick; overflow is intentionally dropped. Four original pixel fragments are derived per explosive casualty. Their altitude, tumble, bounce and slide are visual animation, not colliding rigid bodies.

Blood dries and fades over 100 simulation seconds (18 for small hit stains), corpses over 45 seconds, fragments over 38, and scorch marks over 100. Normal wave transitions keep the aftermath; restarting a wave or resetting/loading a world clears it. The editor hides it. Nothing is serialized into saves.

Custom Tesla rendering remains unchanged and owns electrical deaths. Check `/tests/tesla/` for its existing regression suite. Heavy projectile damage still follows the existing combat schedule; this pass changes visual explosions, not projectile travel or damage timing.
