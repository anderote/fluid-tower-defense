# Wave pacing

Each wave keeps its existing total, species mix, health scaling and reward. Three deterministic pressure arcs rotate by global wave number: two assaults and a final push, an early surge with a long recovery, and escalating attacks separated by recovery windows. The strongest push spans roughly 82–96% of arrivals, then eases for the last stragglers.

`src/game/wave-rhythm.ts` defines smooth pressure curves over the fraction of the quota already emitted. Opening pressure is 0.5–0.65 times the base rate, recovery troughs are 0.3–0.4, and the climax reaches 2.0. Both arrival credit and physical inlet density use that pressure. Physical spacing and the density ceiling still limit peak throughput; narrow fronts take longer. Pressure follows arrivals rather than a timer, so a blocked inlet cannot silently consume the recovery or climax.

Waves remain continuous rather than releasing packets. Arrival credit stays bounded to half a second at the current rate, and restarting clears credit and returns to the opening beat. Existing difficulty multipliers still apply. `peakRate` describes maximum scheduled demand; the legacy `rampSeconds` field remains the nominal quota/base-rate duration, not a promise of actual completion time. Recovery windows can increase overall wave length.

The wave-pacing tests run the actual inlet and spawn allocator through all three arcs, verifying full quotas, substantially quieter recovery windows, the strongest late surge, and restart/blockage behavior. Combat pressure will lag arrival pressure while enemies travel and existing crowds clear; the curves do not change enemies already on the field.
