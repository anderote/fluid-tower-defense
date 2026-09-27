import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COMMAND_UPGRADES} from '../content/index.ts';
import {createRun} from './index.ts';
import {commandUpgradeAvailability,researchCost,researchRank} from './research.ts';

test('each technology prerequisite exists earlier in the registry and cannot be skipped', () => {
  for (const [index, upgrade] of COMMAND_UPGRADES.entries()) {
    if (!upgrade.requires) continue;
    for(const prerequisiteId of upgrade.requires){
      const prerequisite = COMMAND_UPGRADES.findIndex(item => item.id === prerequisiteId);
      assert.ok(prerequisite >= 0 && prerequisite < index, upgrade.id);
    }
    const run = createRun();
    run.model.metal = 100_000;
    const before = run.save();
    const availability = commandUpgradeAvailability(run.model, upgrade.id);
    assert.equal(availability.ok, false);
    assert.deepEqual(run.buyCommandUpgrade(upgrade.id), availability);
    assert.equal(run.save(), before, 'rejected purchases must not spend Metal or mutate the run');
    for(const prerequisite of upgrade.requires) run.model.commandUpgrades.push(...Array(3).fill(prerequisite));
    assert.equal(commandUpgradeAvailability(run.model, upgrade.id).ok, true);
    assert.equal(run.buyCommandUpgrade(upgrade.id).ok, true);
    assert.equal(run.model.metal, 100_000 - researchCost(upgrade,0));
  }
});

test('technology ranks stack, become more expensive, and cap at twenty', () => {
  const run = createRun();
  run.model.metal = 0;
  assert.deepEqual(commandUpgradeAvailability(run.model, 'ballistics'), {ok:false, reason:'Requires 180 more Metal.'});
  assert.equal(run.buyCommandUpgrade('ballistics').ok, false);
  run.model.metal = 180;
  run.startWave();
  assert.equal(commandUpgradeAvailability(run.model, 'ballistics').ok, true);
  assert.equal(run.buyCommandUpgrade('ballistics').ok, true);
  assert.equal(run.model.metal, 0);
  run.model.metal=100_000;
  assert.equal(run.buyCommandUpgrade('ballistics').ok,true);
  assert.equal(researchRank(run.model.commandUpgrades,'ballistics'),2);
  run.model.metal=100_000;
  for(let rank=2;rank<20;rank++)assert.equal(run.buyCommandUpgrade('ballistics').ok,true);
  assert.deepEqual(run.buyCommandUpgrade('ballistics'), {ok:false, reason:'Maximum rank reached.'});
  assert.equal(run.buyCommandUpgrade('unknown').ok, false);
  assert.ok(run.model.metal>0);
});

test('technology ranks survive save/load and three foundation ranks unlock specialists', () => {
  const run = createRun();
  run.model.metal = 100_000;
  for(let rank=0;rank<3;rank++)assert.equal(run.buyCommandUpgrade('ballistics').ok,true);
  assert.equal(run.buyCommandUpgrade('rifle-tech').ok,true);
  assert.equal(researchRank(run.model.commandUpgrades,'rifle-tech'),1);
  const restored = createRun();
  assert.equal(restored.load(run.save()).ok, true);
  assert.equal(researchRank(restored.model.commandUpgrades,'ballistics'),3);
  assert.equal(researchRank(restored.model.commandUpgrades,'rifle-tech'),1);
});

for (const phase of ['preparation','combat','settling','checkpoint'] as const) {
  test(`research purchases are available during ${phase} and apply immediately`,()=>{
    const run=createRun();
    run.model.phase=phase;
    run.model.metal=1000;
    assert.deepEqual(commandUpgradeAvailability(run.model,'ballistics'),{ok:true});
    assert.equal(run.buyCommandUpgrade('ballistics').ok,true);
    assert.equal(run.model.metal,820);
    assert.equal(researchRank(run.researchModifiers(),'ballistics'),1);
    assert.equal(run.model.phase,phase);
    const metal=run.model.metal;
    assert.equal(run.buyCommandUpgrade('rifle-tech').ok,false);
    assert.equal(run.model.metal,metal);
    run.model.metal=0;
    assert.equal(run.buyCommandUpgrade('ballistics').ok,false);
    assert.equal(researchRank(run.researchModifiers(),'ballistics'),1);
  });
}
for (const phase of ['won','lost'] as const) {
  test(`research cannot spend Metal after the run is ${phase}`,()=>{
    const run=createRun();run.model.phase=phase;run.model.metal=1000;
    assert.deepEqual(run.buyCommandUpgrade('ballistics'),{ok:false,reason:'The run is over.'});
    assert.equal(run.model.metal,1000);
    assert.deepEqual(run.model.commandUpgrades,[]);
  });
}
