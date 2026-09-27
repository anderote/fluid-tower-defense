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

test('early completion rewards the wave once without awarding kills or salvage for stragglers',()=>{
 const run=createRun();run.startWave();const total=waveFor(1,1).total;
 run.takeSpawns(total);
 run.applySettlement({epoch:run.epoch,tick:1,kills:Math.ceil(total*.95),crushKills:0,leaks:0,earned:0,live:Math.floor(total*.05),invalid:0,maxPacking:0});
 const metal=run.model.metal;
 assert.equal(run.finishWaveEarly().ok,true);
 assert.equal(run.model.metal,metal+waveFor(1,1).payment);
 assert.deepEqual(run.waveProgress,{total,queued:0,live:0});
 assert.equal(run.finishWaveEarly().ok,false);
 assert.equal(run.model.metal,metal+waveFor(1,1).payment);
 assert.equal(run.startWave().ok,true);assert.equal(run.model.wave,2);
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
