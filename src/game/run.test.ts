import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
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
test('player-built walls support one centered tower and preserve it in saves',()=>{
  const mount={x:32,y:20,width:4,height:4},map={...DEFAULT_MAP,id:'wall-mount-test',obstacles:[...DEFAULT_MAP.obstacles,mount]};
  const run=createRun(map);run.setBuildMounts([mount]);
  const placed=run.place('repulsor',{x:34,y:22});
  assert.ok(placed.ok&&placed.tower);assert.deepEqual({x:placed.tower.x,y:placed.tower.y},{x:34,y:22});
  assert.equal(run.place('cryo',{x:34,y:22}).ok,false);
  const restored=createRun(map);restored.setBuildMounts([mount]);
  assert.equal(restored.load(run.save()).ok,true);assert.deepEqual({x:restored.model.towers[0].x,y:restored.model.towers[0].y},{x:34,y:22});
});
test('difficulty multiplier scales continuous zombie production and clamps to 1–40',()=>{
  const baseline=createRun(), intense=createRun();
  baseline.startWave(); intense.startWave();
  baseline.setSpawnMultiplier(1); intense.setSpawnMultiplier(1000);
  const normal=baseline.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  const boosted=intense.takeSpawns(65_536,1).reduce((sum,batch)=>sum+batch.count,0);
  assert.equal(normal,51); assert.equal(boosted,1_500);
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
test('every level has ten escalating procedural waves without bonus-wave interruptions',()=>{
  const run=createRun();
  const finish=(tick:number)=>{
    assert.equal(run.startWave().ok,true); run.takeSpawns(65_536);
    run.applySettlement({epoch:1,tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
    assert.equal(run.finishSettling().ok,true);
  };
  assert.equal(WAVES_PER_LEVEL,10);
  assert.ok(waveFor(1,10).spawns.reduce((sum,batch)=>sum+batch.count,0)>waveFor(1,1).spawns.reduce((sum,batch)=>sum+batch.count,0));
  assert.ok(waveFor(2,1).spawns.reduce((sum,batch)=>sum+batch.count,0)>waveFor(1,10).spawns.reduce((sum,batch)=>sum+batch.count,0));
  finish(1); finish(2);
  assert.deepEqual(run.model.bonusChoices,[]);
  for(let wave=3;wave<=WAVES_PER_LEVEL;wave++){
    if(wave===WAVES_PER_LEVEL)assert.equal(run.place('repulsor',{x:84,y:50}).ok,true);
    finish(wave);
  }
  assert.equal(run.model.level,2); assert.equal(run.model.wave,0);
  assert.equal(run.model.towers.length,0);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true);
});
