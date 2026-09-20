import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COMMAND_UPGRADES} from '../content/index.ts';
import {createRun} from './index.ts';
import {commandUpgradeAvailability} from './research.ts';

test('each research prerequisite exists earlier in the registry and chains cannot be skipped', () => {
  for (const [index, upgrade] of COMMAND_UPGRADES.entries()) {
    if (!upgrade.requires) continue;
    const prerequisite = COMMAND_UPGRADES.findIndex(item => item.id === upgrade.requires);
    assert.ok(prerequisite >= 0 && prerequisite < index, upgrade.id);
    const run = createRun();
    run.model.metal = 100_000;
    const before = run.save();
    const availability = commandUpgradeAvailability(run.model, upgrade.id);
    assert.equal(availability.ok, false);
    assert.deepEqual(run.buyCommandUpgrade(upgrade.id), availability);
    assert.equal(run.save(), before, 'rejected purchases must not spend Metal or mutate the run');
    run.model.commandUpgrades.push(upgrade.requires);
    assert.equal(commandUpgradeAvailability(run.model, upgrade.id).ok, true);
    assert.equal(run.buyCommandUpgrade(upgrade.id).ok, true);
    assert.equal(run.model.metal, 100_000 - upgrade.cost);
  }
});

test('availability and purchases agree for insufficient funds, combat, installed, and unknown research', () => {
  const run = createRun();
  run.model.metal = 0;
  assert.deepEqual(commandUpgradeAvailability(run.model, 'targeting-grid'), {ok:false, reason:'Requires 260 more Metal.'});
  assert.equal(run.buyCommandUpgrade('targeting-grid').ok, false);
  run.model.metal = 260;
  run.startWave();
  assert.deepEqual(run.buyCommandUpgrade('targeting-grid'), commandUpgradeAvailability(run.model, 'targeting-grid'));
  assert.equal(run.model.metal, 260);
  run.model.phase = 'preparation';
  assert.equal(run.buyCommandUpgrade('targeting-grid').ok, true);
  assert.deepEqual(run.buyCommandUpgrade('targeting-grid'), {ok:false, reason:'Installed.'});
  assert.equal(run.buyCommandUpgrade('unknown').ok, false);
  assert.equal(run.model.metal, 0);
});

test('sequential research purchases survive save/load and preserve bulkhead effect', () => {
  const run = createRun();
  run.model.metal = 100_000;
  for (const upgrade of COMMAND_UPGRADES) assert.equal(run.buyCommandUpgrade(upgrade.id).ok, true, upgrade.id);
  assert.equal(run.model.baseHealth, 25);
  const restored = createRun();
  assert.equal(restored.load(run.save()).ok, true);
  for (const upgrade of COMMAND_UPGRADES) assert.deepEqual(commandUpgradeAvailability(restored.model, upgrade.id), {ok:false, reason:'Installed.'});
});
