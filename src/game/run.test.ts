import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun} from './index.ts';

test('cumulative settlements pay only newly reported totals',()=>{
  const run=createRun(); run.startWave(); run.takeSpawns(200);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,656); assert.equal(run.model.baseHealth,19);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,656);
  run.applySettlement({epoch:1,tick:4,kills:3,crushKills:1,leaks:1,earned:9,live:0,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,659);
});
test('branches lock and preparation saves restore',()=>{
  const run=createRun(), result=run.place('repulsor',{x:84,y:50}); assert.ok(result.ok && result.tower); const tower=result.tower;
  assert.equal(run.upgrade(tower.id,0).ok,true); assert.equal(run.upgrade(tower.id,1).ok,false);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true); assert.equal(restored.model.towers[0].branch,0);
  assert.equal(restored.sell(tower.id).ok,true);
});
test('tower and wall Metal spending remains available during combat',()=>{
  const run=createRun(); assert.equal(run.startWave().ok,true);
  assert.equal(run.place('repulsor',{x:84,y:50}).ok,true);
  assert.equal(run.spendMetal(60).ok,true);
});
test('placing a tower leaves the inspector closed',()=>{
  const run=createRun();
  assert.equal(run.place('repulsor',{x:84,y:50}).ok,true);
  assert.equal(run.model.selected,null);
});
test('restarting a wave restores its enemy queue and base while retaining defenses',()=>{
  const run=createRun();const placed=run.place('repulsor',{x:84,y:50});assert.ok(placed.ok);
  assert.equal(run.startWave().ok,true);run.takeSpawns(50);
  run.applySettlement({epoch:run.epoch,tick:1,kills:0,crushKills:0,leaks:3,earned:0,live:47,invalid:0,maxPacking:0});
  const previousEpoch=run.epoch;assert.equal(run.restartWave().ok,true);
  assert.equal(run.model.phase,'combat');assert.equal(run.model.baseHealth,20);assert.equal(run.model.towers.length,1);
  assert.equal(run.model.pending.reduce((sum,batch)=>sum+batch.count,0),28_000);assert.equal(run.epoch,previousEpoch+1);
});
test('difficulty multiplier scales continuous zombie production and clamps to 1–40',()=>{
  const baseline=createRun(), intense=createRun();
  baseline.startWave(); intense.startWave();
  baseline.setSpawnMultiplier(1); intense.setSpawnMultiplier(1000);
  const normal=baseline.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  const boosted=intense.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  assert.equal(normal,66); assert.equal(boosted,2_666);
  assert.equal(intense.setSpawnMultiplier(0),1);
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
  assert.equal(run.model.metal,662);
  assert.equal(run.finishSettling().ok,false); assert.equal(run.model.phase,'combat');
});
test('clearing a wave returns directly to preparation without a run-bonus gate',()=>{
  const run=createRun();
  const finish=(tick:number)=>{
    assert.equal(run.startWave().ok,true); run.takeSpawns(65_536);
    run.applySettlement({epoch:1,tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
    assert.equal(run.finishSettling().ok,true);
  };
  finish(1); finish(2);
  assert.deepEqual(run.model.bonusChoices,[]);
  assert.equal(run.startWave().ok,true);
  run.takeSpawns(65_536);
  run.applySettlement({epoch:1,tick:3,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
  assert.equal(run.finishSettling().ok,true);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true);
});
