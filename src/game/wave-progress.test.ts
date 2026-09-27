import assert from 'node:assert/strict';
import test from 'node:test';
import {canFinishWaveEarly} from './wave-progress.ts';
import {createRun,waveFor} from './index.ts';

test('advance unlocks at exactly 95%, including queued enemies and excluding active bosses',()=>{
 assert.equal(canFinishWaveEarly({total:1000,queued:0,live:51},'combat'),false);
 assert.equal(canFinishWaveEarly({total:1000,queued:10,live:40},'combat'),true);
 assert.equal(canFinishWaveEarly({total:1000,queued:50,live:1},'combat'),false);
 assert.equal(canFinishWaveEarly({total:1000,queued:0,live:1},'combat',true),false);
 for(const phase of ['preparation','checkpoint','lost','won'] as const)assert.equal(canFinishWaveEarly({total:1000,queued:0,live:0},phase),false);
 assert.equal(canFinishWaveEarly({total:0,queued:0,live:0},'combat'),false);
});

test('early advancement rewards the wave once and keeps surviving enemies live',()=>{
 const run=createRun();run.startWave();const total=waveFor(1,1).total;
 run.takeSpawns(total);
 run.applySettlement({epoch:run.epoch,tick:1,kills:Math.ceil(total*.95),crushKills:0,leaks:0,earned:0,live:Math.floor(total*.05),invalid:0,maxPacking:0});
 const metal=run.model.metal;
 assert.equal(run.finishWaveEarly().ok,true);
 assert.equal(run.model.metal,metal+waveFor(1,1).payment);
 assert.deepEqual(run.waveProgress,{total,queued:0,live:Math.floor(total*.05)});
 assert.equal(run.finishWaveEarly().ok,false);
 assert.equal(run.model.metal,metal+waveFor(1,1).payment);
 assert.equal(run.startWave().ok,true);assert.equal(run.model.wave,2);
 assert.equal(run.waveProgress.live,Math.floor(total*.05));
 assert.equal(run.waveProgress.queued,waveFor(1,2).total);
 assert.equal(run.waveProgress.total,waveFor(1,2).total+Math.floor(total*.05));
 // The old survivors still grant normal salvage and can damage the base.
 const beforeHealth=run.model.baseHealth;
 run.applySettlement({epoch:run.epoch,tick:2,kills:Math.ceil(total*.95)+10,crushKills:0,leaks:1,earned:2,live:Math.floor(total*.05)-11,invalid:0,maxPacking:0});
 assert.equal(run.model.metal,metal+waveFor(1,1).payment+2);
 assert.equal(run.model.baseHealth,beforeHealth-1);
});

test('early completion cannot skip most of a wave or bypass boons and extraction',()=>{
 const run=createRun();run.startWave();assert.equal(run.finishWaveEarly().ok,false);
 for(const wave of [3,10]){
  const run=createRun();run.model.wave=wave-1;run.startWave();const total=waveFor(1,wave).total;run.takeSpawns(total);
  run.applySettlement({epoch:run.epoch,tick:1,kills:total-1,crushKills:0,leaks:0,earned:0,live:1,invalid:0,maxPacking:0});
  if(wave===10)assert.equal(run.finishWaveEarly().ok,false);
  assert.equal(run.finishWaveEarly(false).ok,true);
  assert.equal(run.startWave().ok,false);
  assert.equal(run.model.phase,wave===10?'checkpoint':'preparation');
  if(wave===3)assert.ok(run.model.bonusChoices.length);
 }
});

test('early advancement carries unspawned enemies alongside the next wave and restart clears carryover',()=>{
 const run=createRun();run.startWave();const total=waveFor(1,1).total;
 run.takeSpawns(total-20);
 run.applySettlement({epoch:run.epoch,tick:1,kills:total-50,crushKills:0,leaks:0,earned:0,live:30,invalid:0,maxPacking:0});
 assert.equal(run.finishWaveEarly().ok,true);
 assert.equal(run.waveProgress.queued,20);assert.equal(run.waveProgress.live,30);
 assert.equal(run.startWave().ok,true);
 assert.equal(run.waveProgress.queued,waveFor(1,2).total+20);
 assert.equal(run.waveProgress.total,waveFor(1,2).total+50);
 run.restartWave();assert.deepEqual(run.waveProgress,{total:waveFor(1,2).total,queued:waveFor(1,2).total,live:0});
});

test('old enemies keep spawning while choosing boons and relocation waits for survivors',()=>{
 const run=createRun();run.model.wave=2;run.startWave();const total=waveFor(1,3).total;
 run.takeSpawns(total-10);run.applySettlement({epoch:run.epoch,tick:1,kills:total-10,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
 assert.equal(run.finishWaveEarly().ok,true);assert.ok(run.model.bonusChoices.length);
 assert.equal(run.takeSpawns(10).reduce((sum,b)=>sum+b.count,0),10);
 assert.equal(run.waveProgress.live,10);
 run.model.phase='checkpoint';assert.equal(run.continueRun({id:'next',width:20,height:20,goal:{x:18,y:10},goalRadius:1,spawn:{x:0,y:0,width:1,height:20},obstacles:[]}).ok,false);
});
