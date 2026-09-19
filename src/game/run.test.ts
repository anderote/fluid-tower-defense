import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun} from './index.ts';

test('cumulative settlements pay only newly reported totals',()=>{
  const run=createRun(); run.startWave(); run.takeSpawns(200);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.scrap,456); assert.equal(run.model.baseHealth,19);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.scrap,456);
  run.applySettlement({epoch:1,tick:4,kills:3,crushKills:1,leaks:1,earned:9,live:0,invalid:0,maxPacking:0});
  assert.equal(run.model.scrap,459);
});
test('branches lock and preparation saves restore',()=>{
  const run=createRun(), result=run.place('repulsor',{x:84,y:50}); assert.ok(result.ok && result.tower); const tower=result.tower;
  assert.equal(run.upgrade(tower.id,0).ok,true); assert.equal(run.upgrade(tower.id,1).ok,false);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true); assert.equal(restored.model.towers[0].branch,0);
  assert.equal(restored.sell(tower.id).ok,true);
});

test('invalid saves are rejected without mutating the current run',()=>{
  const run=createRun(); const placed=run.place('repulsor',{x:84,y:50}); assert.ok(placed.ok);
  const before=run.save(); const invalid=JSON.parse(before) as Record<string,unknown>;
  (invalid.model as {towers:{kind:string}[]}).towers[0].kind='not-a-tower';
  assert.equal(run.load(JSON.stringify(invalid)).ok,false);
  assert.equal(run.save(),before);
  invalid.contentVersion='old-content'; assert.equal(run.load(JSON.stringify(invalid)).ok,false);
});
test('counter rollback is ignored and settling keeps combat running while enemies live',()=>{
  const run=createRun(); run.startWave(); run.takeSpawns(200);
  run.applySettlement({epoch:1,tick:1,kills:4,crushKills:0,leaks:0,earned:12,live:2,invalid:0,maxPacking:0});
  run.applySettlement({epoch:1,tick:2,kills:1,crushKills:0,leaks:0,earned:3,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.scrap,462);
  assert.equal(run.finishSettling().ok,false); assert.equal(run.model.phase,'combat');
});
test('salvage can be selected at both authored milestones and remains saveable',()=>{
  const run=createRun();
  const finish=(tick:number)=>{
    assert.equal(run.startWave().ok,true); run.takeSpawns(65_536);
    run.applySettlement({epoch:1,tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
    assert.equal(run.finishSettling().ok,true);
  };
  finish(1); finish(2);
  assert.deepEqual(run.model.bonusChoices.map(choice=>choice.id),['salvage-contract']);
  assert.equal(run.chooseBonus('salvage-contract').ok,true);
  finish(3); finish(4);
  assert.deepEqual(run.model.bonusChoices.map(choice=>choice.id),['salvage-contract']);
  assert.equal(run.chooseBonus('salvage-contract').ok,true);
  assert.deepEqual(run.model.bonuses,[]);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true);
});
