# Pressure surge

Crowd compression now increases desired forward speed smoothly from 12 to
80 kPa, capped at +65%. Pressure separation/release strength increases up to
75%. Pairwise release uses the same average pressure for both bodies.
Forward overspeed up to 65% of base speed gets reduced braking (0.9/s plus
existing 0.12/s drag); sideways motion and larger impulses retain normal
braking. Slowing effects disable this carry-through. No additional particle
state, GPU passes, neighbor searches, or buffers are added. Existing force,
speed, displacement and terrain collision limits remain in effect.

The pressure boost is an active zombie behavior, not a passive-fluid law.
Ordinary uncrowded walking keeps its original target speed.

## Reproduce

On a feature Vite server, run:

- /tests/performance/?autorun&scenario=dense&population=10000&frames=180&only=physics&compare=surge
- /tests/performance/?autorun&scenario=jam&population=10000&frames=180&only=physics&compare=surge
- /tests/performance/?autorun&scenario=breach&population=10000&frames=600&only=physics&compare=surge&continuous
- /tests/performance/checks.html

Each comparison runs reference/on/on/reference, with fresh devices and eight
warmup frames per trial. Reference disables the feature at shader compilation.
Dense/jam restore the initial particles each frame. Breach evolves a compressed
crowd behind a six-unit gap, recycling dead slots through the existing horde
allocator. Its metric is living bodies beyond x=105.5 at the final read, not
cumulative crossings. Use continuous mode for this fixture.

## Local results

Apple WebGPU in Chrome; raw reports: pressure-surge-10000.json.
All trials had zero invalid particle values and zero GPU errors.

| Scenario | Reference | Surge |
| --- | ---: | ---: |
| Dense, sum of median physics substeps | 0.393 ms | 0.393 ms |
| Jam, sum of median physics substeps | 0.918–1.049 ms | 1.049 ms |
| Breach, sum of median physics substeps | 0.655–0.786 ms | 0.655–0.852 ms |
| Breach, median encode-through-completion | 2.3–2.4 ms | 2.4–2.5 ms |
| Breach, released living bodies | 1,227–1,230 | 2,292–2,304 |
| Breach, mean released speed | 3.03–3.04 | 3.77–3.80 |

That is approximately 87% more released bodies and 25% greater released speed
after 600 measured steps plus eight warmup steps. Jam sums of per-pass p95
were 1.97–2.03 ms reference and 2.10 ms enabled. These sums are not frame p95.
Timestamp quantization and uncontrolled concurrent GPU activity limit precision;
this does not establish performance on other hardware or full gameplay FPS.

All nine GPU correctness checks passed, including wall collisions, exact/hybrid
invariants, blast impulses, slowing, accounting and all-weapon parity.
