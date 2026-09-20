import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bossStatus} from './boss-status.ts';

const state = {mode:'game', phase:'combat', boss:{x:50, y:50, health:400, maxHealth:800, phase:0, active:true}} as const;

test('boss readback phases produce tactical status with normalized health', () => {
  for (const [phase, label] of ['ADVANCING','BRACING','CHARGING','RECOVERING','DEFEATED','BREACHED'].entries()) {
    const status = bossStatus({...state, boss:{...state.boss, phase, active:phase < 4}});
    assert.ok(status);
    assert.equal(status.label, label);
    assert.equal(status.percent, 50);
    assert.ok(status.hint.length > 0);
  }
});

test('boss status suppresses stale, uninitialized, invalid and non-game telemetry', () => {
  assert.equal(bossStatus({...state, mode:'lab'}), null);
  assert.equal(bossStatus({...state, phase:'preparation'}), null);
  assert.equal(bossStatus({...state, phase:'won'}), null);
  assert.equal(bossStatus({...state, boss:undefined}), null);
  for (const patch of [{phase:-1}, {phase:99}, {health:NaN}, {maxHealth:0}, {maxHealth:Infinity}, {active:false}]) {
    assert.equal(bossStatus({...state, boss:{...state.boss, ...patch}}), null);
  }
});

test('boss health stays within progress bounds and breaches remain visible on defeat', () => {
  assert.equal(bossStatus({...state, boss:{...state.boss, health:-1}})?.percent, 0);
  assert.equal(bossStatus({...state, boss:{...state.boss, health:900}})?.percent, 100);
  assert.equal(bossStatus({...state, phase:'lost', boss:{...state.boss, phase:5, active:false}})?.label, 'BREACHED');
});
