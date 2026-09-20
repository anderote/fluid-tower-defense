import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun, WAVES_PER_LEVEL, waveFor} from './index.ts';
import {previewNextWave} from './wave-preview.ts';

test('forecast matches queued enemies, completion payout, and boss at every level transition', () => {
  const run = createRun();
  for (let tick = 1; tick <= WAVES_PER_LEVEL * 2 + 1; tick++) {
    if (run.model.phase === 'checkpoint') assert.equal(run.continueRun().ok, true);
    if (run.model.bonusChoices.length) assert.equal(run.chooseBonus(run.model.bonusChoices[0].id).ok, true);
    const before = run.save();
    const preview = previewNextWave({...run.model, mode:'game', difficulty:1});
    assert.ok(preview);
    assert.equal(run.save(), before, 'forecast must not mutate or advance the run');
    assert.equal(preview.level, run.model.level);
    assert.equal(preview.wave, run.model.wave + 1);
    assert.equal(run.startWave().ok, true);
    assert.deepEqual(preview.enemies.map(({kind, count}) => ({kind, count})),
      run.model.pending.map(({kind, count}) => ({kind, count})));
    assert.equal(preview.boss, run.isBossWave);
    const spawned = run.takeSpawns(65_536);
    assert.equal(preview.total, spawned.reduce((sum, batch) => sum + batch.count, 0));
    const metal = run.model.metal;
    run.applySettlement({epoch:run.epoch, tick, kills:0, crushKills:0, leaks:0, earned:0, live:0, invalid:0, maxPacking:0});
    assert.equal(run.finishSettling().ok, true);
    if (!preview.boss) assert.equal(run.model.metal, metal + preview.payment);
    else assert.equal(run.model.phase, 'checkpoint');
  }
});

test('flow multiplier affects forecast rate but not enemy counts or rewards', () => {
  const state = {mode:'game', phase:'preparation', level:1, wave:3, difficulty:1} as const;
  const normal = previewNextWave(state)!;
  const fast = previewNextWave({...state, difficulty:40})!;
  assert.equal(fast.peakRate, normal.peakRate * 40);
  assert.equal(normal.peakRate, waveFor(1,4).peakRate);
  assert.equal(fast.rampSeconds, normal.rampSeconds);
  assert.deepEqual(fast.enemies, normal.enemies);
  assert.equal(fast.payment, normal.payment);
  assert.deepEqual(normal.enemies.map(enemy => enemy.kind), ['shambler','runner','brute']);
});

test('forecast is absent outside game preparation and survives a saved-run restore', () => {
  const run = createRun();
  const state = {...run.model, mode:'game', difficulty:1} as const;
  for (const phase of ['combat','settling','lost','won'] as const) {
    assert.equal(previewNextWave({...state, phase}), null);
  }
  assert.equal(previewNextWave({...state, mode:'lab'}), null);
  const restored = createRun();
  assert.equal(restored.load(run.save()).ok, true);
  assert.deepEqual(previewNextWave({...restored.model, mode:'game', difficulty:1}), previewNextWave(state));
});
