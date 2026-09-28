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
  assert.equal(active[8], -1);
  assert.equal(active[10], 1);
  assert.equal(active[11], 0);
  assert.equal(active[12], 7);
  assert.equal(active[15], 0);

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

test('saved bosses keep damaged health and defeated status without initializing again',async()=>{
  const {restoreBossState}=await import('./model.ts');
  const live=restoreBossState({x:50,y:30,health:240,maxHealth:800,phase:2,active:true})!;
  assert.equal(live[6],240);assert.equal(live[8],2);assert.equal(live[10],1);
  const dead=restoreBossState({x:50,y:30,health:0,maxHealth:800,phase:4,active:false})!;
  assert.equal(dead[10],0);assert.equal(dead[11],1);
  assert.equal(restoreBossState({health:-2}),undefined);
});
