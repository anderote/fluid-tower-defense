export const BOSS_FLOATS = 16;
export const BOSS_BYTES = BOSS_FLOATS * 4;
export const BOSS_RADIUS = 2.5;
export const BOSS_MASS = 30;
export const BOSS_HEALTH = 800;
export const BOSS_REWARD = 200;
export const BOSS_LEAK = 10;

export const BOSS_PHASE = {
  advance: 0,
  brace: 1,
  charge: 2,
  recover: 3,
  dead: 4,
  leaked: 5,
} as const;

export const BOSS_PHASE_SECONDS = {
  advance: 5,
  brace: 1.4,
  charge: 1.8,
  recover: 2.4,
} as const;

export function initialBossState(active: boolean, generation: number): Float32Array {
  const state = new Float32Array(BOSS_FLOATS);
  state.set([BOSS_RADIUS, BOSS_MASS, BOSS_HEALTH, BOSS_HEALTH], 4);
  // Phase -1 is the one-shot GPU initialization sentinel. Flag.w is reserved for slow duration.
  state.set([-1, 0, active ? 1 : 0, active ? 0 : 1], 8);
  state.set([generation, BOSS_REWARD, BOSS_LEAK, 0], 12);
  return state;
}

export function nextBossPhase(phase: number, elapsed: number): { phase: number; elapsed: number } {
  const durations = [
    BOSS_PHASE_SECONDS.advance,
    BOSS_PHASE_SECONDS.brace,
    BOSS_PHASE_SECONDS.charge,
    BOSS_PHASE_SECONDS.recover,
  ];
  if (phase < BOSS_PHASE.advance || phase > BOSS_PHASE.recover) return { phase, elapsed };
  if (elapsed < durations[phase]) return { phase, elapsed };
  return { phase: (phase + 1) % 4, elapsed: elapsed - durations[phase] };
}
