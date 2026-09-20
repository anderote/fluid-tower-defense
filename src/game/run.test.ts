import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP, MAX_TOWER_LEVEL, TOWERS, towerUpgradeCost} from '../content/index.ts';
import {createRun, STARTING_METAL, WAVES_PER_LEVEL, waveFor} from './index.ts';
import {wallMountCells} from './terrain.ts';

test('fresh runs start with 3,000 Metal',()=>{
  assert.equal(STARTING_METAL,3_000);
  assert.equal(createRun().model.metal,3_000);
});

test('cumulative settlements pay only newly reported totals',()=>{
  const run=createRun(); run.startWave(); run.takeSpawns(200);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,STARTING_METAL+6); assert.equal(run.model.baseHealth,19);
  run.applySettlement({epoch:1,tick:3,kills:2,crushKills:1,leaks:1,earned:6,live:1,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,STARTING_METAL+6);
  run.applySettlement({epoch:1,tick:4,kills:3,crushKills:1,leaks:1,earned:9,live:0,invalid:0,maxPacking:0});
  assert.equal(run.model.metal,STARTING_METAL+9);
});
test('tower records use reported GPU kill attribution rather than estimated damage output',()=>{
  const run=createRun();
  const first=run.place('repulsor',{x:84,y:50}), second=run.place('autocannon',{x:80,y:42});
  assert.ok(first.ok&&second.ok); run.startWave();
  run.applySettlement({epoch:1,tick:1,kills:7,crushKills:0,leaks:0,earned:21,live:1,invalid:0,maxPacking:0,towerKills:[2,5]});
  assert.equal(run.model.towers[0].kills,2); assert.equal(run.model.towers[1].kills,5);
  run.applySettlement({epoch:1,tick:2,kills:10,crushKills:0,leaks:0,earned:30,live:1,invalid:0,maxPacking:0,towerKills:[3,7]});
  assert.equal(run.model.towers[0].kills,3); assert.equal(run.model.towers[1].kills,7);
});
test('all weapons start unlocked while stat research spends run Metal and resets with the run',()=>{
  const run=createRun();
  const towerKinds=Object.keys(TOWERS) as (keyof typeof TOWERS)[];
  assert.deepEqual(run.towerUnlocks().filter(unlock=>unlock.unlocked).map(unlock=>unlock.kind),towerKinds);
  assert.ok(towerKinds.every(kind=>run.isTowerUnlocked(kind)));
  assert.equal(run.unlockTower('mortar').ok,false);
  run.model.metal=75;
  assert.equal(run.buyStatUpgrade('damage').ok,true);
  assert.equal(run.model.metal,0);
  assert.deepEqual(run.statModifiers(),['damage']);
  assert.equal(run.buyStatUpgrade('damage').ok,false);
  const restored=createRun();
  assert.equal(restored.load(run.serialize()).ok,true);
  assert.equal(restored.isTowerUnlocked('mortar'),true);
  assert.deepEqual(restored.statModifiers(),['damage']);
  assert.equal(restored.model.metal,0);
  restored.reset();
  assert.ok(towerKinds.every(kind=>restored.isTowerUnlocked(kind)));
  assert.deepEqual(restored.statModifiers(),[]);
  assert.equal(restored.model.metal,STARTING_METAL);
});
test('Metal research is allowed during combat, capped, and blocked after defeat',()=>{
  const run=createRun();
  run.model.metal=100_000;
  run.startWave();
  assert.equal(run.isTowerUnlocked('cryo'),true);
  for(let rank=0;rank<10;rank++)assert.equal(run.buyStatUpgrade('force').ok,true);
  const metal=run.model.metal;
  assert.equal(run.buyStatUpgrade('force').ok,false);
  assert.equal(run.buyStatUpgrade('unknown').ok,false);
  assert.equal(run.model.metal,metal);
  assert.equal(run.restartWave().ok,true);
  assert.equal(run.isTowerUnlocked('cryo'),true);
  assert.equal(run.statUpgrades().find(upgrade=>upgrade.id==='force')?.rank,10);
  run.model.phase='lost';
  assert.equal(run.unlockTower('mortar').ok,false);
  assert.equal(run.buyStatUpgrade('damage').ok,false);
  assert.equal(run.model.metal,metal);
});
test('branches lock and preparation saves restore',()=>{
  const run=createRun(), result=run.place('repulsor',{x:84,y:50}); assert.ok(result.ok && result.tower); const tower=result.tower;
  assert.equal(run.upgrade(tower.id,0).ok,true); assert.equal(run.upgrade(tower.id,1).ok,false);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true); assert.equal(restored.model.towers[0].branch,0);
  assert.equal(restored.sell(tower.id).ok,true);
});
test('common towers support fifty upgrade levels and persist at the cap',()=>{
  assert.equal(MAX_TOWER_LEVEL,50);
  for(const kind of Object.keys(TOWERS) as (keyof typeof TOWERS)[]){
    const run=createRun(); run.model.metal=100_000; if(!run.isTowerUnlocked(kind))assert.equal(run.unlockTower(kind).ok,true);
    const result=run.place(kind,{x:84,y:50}); assert.ok(result.ok && result.tower); const tower=result.tower;
    run.model.metal=100_000;
    for(let level=0;level<MAX_TOWER_LEVEL;level++) assert.equal(run.upgrade(tower.id,0).ok,true,`${kind} upgrade ${level+1}`);
    assert.equal(tower.level,50);
    assert.equal(tower.spent,TOWERS[kind].cost+Array.from({length:50},(_,level)=>towerUpgradeCost(level)).reduce((sum,cost)=>sum+cost,0));
    assert.equal(run.upgrade(tower.id,0).ok,false);
    assert.equal(run.upgrade(tower.id,1).ok,false);
    const restored=createRun(); assert.equal(restored.load(run.save()).ok,true); assert.equal(restored.model.towers[0].level,50);
  }
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
  assert.equal(run.place('autocannon',{x:34,y:22}).ok,false);
  const restored=createRun(map);restored.setBuildMounts([mount]);
  assert.equal(restored.load(run.save()).ok,true);assert.deepEqual({x:restored.model.towers[0].x,y:restored.model.towers[0].y},{x:34,y:22});
});
test('starting indestructible walls support mounted towers and preserve them in saves',()=>{
  const mounts=wallMountCells(DEFAULT_MAP.obstacles),run=createRun();run.setBuildMounts(mounts);
  const placed=run.place('repulsor',{x:50.7,y:21.4});
  assert.ok(placed.ok&&placed.tower);assert.deepEqual({x:placed.tower.x,y:placed.tower.y},{x:50,y:22});
  const restored=createRun();restored.setBuildMounts(mounts);
  assert.equal(restored.load(run.save()).ok,true);assert.deepEqual({x:restored.model.towers[0].x,y:restored.model.towers[0].y},{x:50,y:22});
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
  assert.equal(run.model.metal,STARTING_METAL+12);
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
  assert.equal(run.continueRun().ok,true);assert.equal(run.model.level,2);
  finish(11);assert.equal(run.model.wave,11);assert.equal(run.model.phase,'checkpoint');assert.equal(run.model.towers.length,1);
  const restored=createRun(); assert.equal(restored.load(run.save()).ok,true);
});

test('wave director uses a shared continuous inlet and introduces every enemy by wave ten',()=>{
  const kinds=new Set(Array.from({length:10},(_,index)=>waveFor(1,index+1).spawns).flat().map(batch=>batch.kind));
  assert.deepEqual([...kinds].sort(),['brute','husk','rager','runner','shambler','softbody']);
  const mixed=waveFor(1,9);assert.ok(mixed.spawns.every(batch=>(batch.start??0)===0));assert.ok(mixed.spawns.every(batch=>batch.band==='inlet'));
  assert.ok(waveFor(1,30).healthScale>waveFor(1,10).healthScale);
});

test('wave director streams until its large horde quota is defeated',()=>{
  const wave=waveFor(1,10);
  assert.ok(wave.total>waveFor(1,1).total);
  assert.ok(wave.spawns.some(batch=>(batch.burst??Infinity)<=10));
  for(let second=4;second<=62;second+=2){
    assert.ok(wave.spawns.some(batch=>{const start=batch.start??0, end=start+batch.count/(batch.rate??1);return start<=second&&end>=second;}),`expected an active stream at ${second}s`);
  }
  const opening=waveFor(1,1).spawns[0], late=waveFor(3,10).spawns[0];
  assert.ok(opening.count/(opening.rate??1)>=40);
  assert.ok(late.count/(late.rate??1)>opening.count/(opening.rate??1));
});

test('horde quota is slider × 100,000 × global wave to the 1.67 power',()=>{
  const slider=7,globalWave=4;
  assert.equal(waveFor(1,globalWave,slider).total,Math.round(slider*100_000*Math.pow(globalWave,1.67)));
  assert.equal(waveFor(2,1,slider).total,Math.round(slider*100_000*Math.pow(11,1.67)));
});

test('continuous horde arrival pauses at capacity and resumes when space opens',()=>{
  const run=createRun();run.setHordeScale(1);assert.equal(run.startWave().ok,true);
  const first=run.takeSpawns(100,1).reduce((sum,batch)=>sum+batch.count,0);
  assert.equal(first,100);
  assert.equal(run.takeSpawns(0,1).length,0);
  const resumed=run.takeSpawns(100,1).reduce((sum,batch)=>sum+batch.count,0);
  assert.equal(resumed,100);
});

test('opening waves are a larger continuous stream, never an initial packet dump',()=>{
  const wave=waveFor(1,1),run=createRun();
  assert.ok(wave.total>=12_000,'opening population should be substantially larger');
  assert.ok(wave.spawns.every(batch=>(batch.burst??0)===1));
  assert.equal(run.startWave().ok,true);
  const firstTick=run.takeSpawns(65_536,1/60).reduce((sum,batch)=>sum+batch.count,0);
  const firstSecond=firstTick+Array.from({length:59},()=>run.takeSpawns(65_536,1/60).reduce((sum,batch)=>sum+batch.count,0)).reduce((sum,count)=>sum+count,0);
  assert.ok(firstTick<wave.total*.02);
  assert.ok(firstSecond<wave.total*.05);
  assert.ok(firstSecond>0);
});

test('extracting after the checkpoint ends the run',()=>{
  const run=createRun();
  for(let wave=1;wave<=10;wave++){
    assert.equal(run.startWave().ok,true);run.takeSpawns(65_536);run.applySettlement({epoch:1,tick:wave,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});assert.equal(run.finishSettling().ok,true);
    if(run.model.bonusChoices.length)run.chooseBonus(run.model.bonusChoices[0].id);
  }
  const result=run.finishRun();assert.ok(result.ok);assert.equal(run.model.phase,'won');
});

test('corrupt tower combat records reject atomically while legacy optional fields still load',()=>{
  const run=createRun();assert.equal(run.place('repulsor',{x:22,y:22}).ok,true);
  const before=run.save();
  for(const [field,values] of Object.entries({kills:[-1,1.5,'oops',null],veterancy:[-1,1000,1.5,'oops',null],veterancyXp:[-1,'oops',null]})){
    for(const value of values){
      const saved=JSON.parse(before);saved.model.towers[0][field]=value;
      assert.equal(run.load(JSON.stringify(saved)).ok,false,`${field}=${value} should reject`);
      assert.equal(run.save(),before,'Rejected load changed current defenses');
    }
  }
  const legacy=JSON.parse(before);delete legacy.model.towers[0].kills;delete legacy.model.towers[0].veterancy;delete legacy.model.towers[0].veterancyXp;
  assert.equal(createRun().load(JSON.stringify(legacy)).ok,true);
});
