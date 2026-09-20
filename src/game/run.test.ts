import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CommandProgression, createRun, WAVES_PER_LEVEL, waveFor} from './index.ts';

test('cumulative settlements pay only newly reported totals',()=>{
  const run=createRun(); run.startWave(); run.takeSpawns(200);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,656); assert.equal(run.model.baseHealth,19);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,656);
  run.applySettlement({epoch:1,tick:4,kills:3,crushKills:1,leaks:1,earned:9,live:0,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,659);
});
test('tower records use reported GPU kill attribution rather than estimated damage output',()=>{
  const run=createRun();
  const first=run.place('repulsor',{x:84,y:50}), second=run.place('mortar',{x:80,y:42});
  assert.ok(first.ok&&second.ok); run.startWave();
  run.applySettlement({epoch:1,tick:1,kills:7,crushKills:0,leaks:0,earned:21,live:1,invalid:0,maxPacking:0,towerKills:[2,5]});
  assert.equal(run.model.towers[0].kills,2); assert.equal(run.model.towers[1].kills,5);
  run.applySettlement({epoch:1,tick:2,kills:10,crushKills:0,leaks:0,earned:30,live:1,invalid:0,maxPacking:0,towerKills:[3,7]});
  assert.equal(run.model.towers[0].kills,3); assert.equal(run.model.towers[1].kills,7);
});
test('Command XP permanently purchases base stat upgrades and unlocks a new tier after ten levels',()=>{
  const profile=new CommandProgression(); profile.award(100);
  assert.equal(profile.buy('damage').ok,true);
  assert.equal(profile.ranks().filter(id=>id==='damage').length,1);
  assert.equal(profile.unlockForLevel(10),false);
  assert.equal(profile.unlockForLevel(11),true);
  assert.equal(profile.unlockedTier,2);
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
  assert.equal(run.model.pending.reduce((sum,batch)=>sum+batch.count,0),waveFor(1,1).spawns.reduce((sum,batch)=>sum+batch.count,0));assert.equal(run.epoch,previousEpoch+1);
});
test('difficulty multiplier scales continuous zombie production and clamps to 1–40',()=>{
  const baseline=createRun(), intense=createRun();
  baseline.startWave(); intense.startWave();
  baseline.setSpawnMultiplier(1); intense.setSpawnMultiplier(1000);
  const normal=baseline.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  const boosted=intense.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  assert.ok(normal>0); assert.ok(boosted>normal);
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
test('ten waves unlock extraction while endless continuation retains the defense',()=>{
  const run=createRun();
  const finish=(tick:number)=>{
    assert.equal(run.startWave().ok,true); run.takeSpawns(65_536);
    run.applySettlement({epoch:1,tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
    assert.equal(run.finishSettling().ok,true);
    if(run.model.bonusChoices.length)assert.equal(run.chooseBonus(run.model.bonusChoices[0].id).ok,true);
  };
  assert.equal(WAVES_PER_LEVEL,10);
  assert.ok(waveFor(1,10).spawns.reduce((sum,batch)=>sum+batch.count,0)>waveFor(1,1).spawns.reduce((sum,batch)=>sum+batch.count,0));
  assert.ok(waveFor(2,1).spawns.reduce((sum,batch)=>sum+batch.count,0)>waveFor(1,10).spawns.reduce((sum,batch)=>sum+batch.count,0));
  assert.equal(run.place('repulsor',{x:84,y:50}).ok,true);
  for(let wave=1;wave<=WAVES_PER_LEVEL;wave++)finish(wave);
  assert.equal(run.model.phase,'checkpoint');assert.equal(run.model.wave,10);assert.equal(run.model.towers.length,1);
  assert.ok(run.extractionXp>0);assert.equal(run.continueRun().ok,true);assert.equal(run.model.level,2);
  finish(11);assert.equal(run.model.wave,11);assert.equal(run.model.phase,'checkpoint');assert.equal(run.model.towers.length,1);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true);
});

test('wave director uses overlapping timed bands and introduces every enemy by wave ten',()=>{
  const kinds=new Set(Array.from({length:10},(_,index)=>waveFor(1,index+1).spawns).flat().map(batch=>batch.kind));
  assert.deepEqual([...kinds].sort(),['brute','husk','rager','runner','shambler','softbody']);
  const mixed=waveFor(1,9);assert.ok(mixed.spawns.some(batch=>(batch.start??0)>0));assert.ok(new Set(mixed.spawns.map(batch=>batch.band)).size>1);
  assert.ok(waveFor(1,30).healthScale>waveFor(1,10).healthScale);
});

test('extracting after the checkpoint ends the run and returns a milestone payout',()=>{
  const run=createRun();
  for(let wave=1;wave<=10;wave++){
    assert.equal(run.startWave().ok,true);run.takeSpawns(65_536);run.applySettlement({epoch:1,tick:wave,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});assert.equal(run.finishSettling().ok,true);
    if(run.model.bonusChoices.length)run.chooseBonus(run.model.bonusChoices[0].id);
  }
  const reward=run.extractionXp,result=run.finishRun();assert.ok(result.ok);if(result.ok)assert.equal(result.xp,reward);assert.equal(run.model.phase,'won');
});
