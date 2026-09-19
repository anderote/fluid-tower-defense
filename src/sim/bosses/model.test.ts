import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_FLOATS,
  BOSS_HEALTH,
  BOSS_PHASE,
  BOSS_PHASE_SECONDS,
  initialBossState,
  nextBossPhase,
} from './model.ts';

test('boss state occupies four vec4s and reset does not pre-settle an active boss', () => {
  const active = initialBossState(true, 7);
  assert.equal(active.length, BOSS_FLOATS);
  assert.equal(active[6], BOSS_HEALTH);
  assert.equal(active[8], BOSS_PHASE.advance);
  assert.equal(active[10], 1);
  assert.equal(active[11], 0);
  assert.equal(active[12], 7);

  const inactive = initialBossState(false, 8);
  assert.equal(inactive[10], 0);
  assert.equal(inactive[11], 1);
});

test('boss phase transitions preserve overshoot and cycle after recovery', () => {
  assert.deepEqual(nextBossPhase(BOSS_PHASE.advance, BOSS_PHASE_SECONDS.advance - 0.01), {
    phase: BOSS_PHASE.advance,
    elapsed: BOSS_PHASE_SECONDS.advance - 0.01,
  });
  assert.deepEqual(nextBossPhase(BOSS_PHASE.advance, BOSS_PHASE_SECONDS.advance + 0.25), {
    phase: BOSS_PHASE.brace,
    elapsed: 0.25,
  });
  assert.deepEqual(nextBossPhase(BOSS_PHASE.recover, BOSS_PHASE_SECONDS.recover), {
    phase: BOSS_PHASE.advance,
    elapsed: 0,
  });
});

