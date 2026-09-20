import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun,waveFor} from './index.ts';
import {HordeFront} from '../sim/horde/model.ts';
import {DEFAULT_MAP} from '../content/index.ts';
import {previewNextWave} from './wave-preview.ts';

test('default physical horde feed exhausts the opening queue within 45 seconds',()=>{
 const run=createRun(),front=new HordeFront();run.startWave();let emitted=0,elapsed=0;
 while(run.model.pending.length&&elapsed<45){
  const positions=front.advance(1/60,DEFAULT_MAP,1,1,run.model.pending);
  emitted+=run.takeSpawns(positions.length,1/60).reduce((sum,batch)=>sum+batch.count,0);elapsed+=1/60;
 }
 assert.equal(emitted,1200);assert.equal(run.waveProgress.queued,0);
 assert.equal(run.waveProgress.live,1200);assert.equal(run.finishSettling().ok,false);
 run.applySettlement({epoch:run.epoch,tick:3000,kills:1200,crushKills:0,leaks:0,earned:1200,live:0,invalid:0,maxPacking:0});
 assert.equal(run.waveProgress.live,0);assert.equal(run.finishSettling().ok,true);
 assert.equal(run.model.phase,'preparation');
});
test('wave forecast stays constant across stream widths and restart restores progress',()=>{
 for(const streamWidth of [1,60,100])assert.equal(previewNextWave({mode:'game',phase:'preparation',level:1,wave:0,difficulty:1,streamWidth})!.total,1200);
 const run=createRun();run.startWave();run.takeSpawns(20,1);
 assert.equal(run.waveProgress.queued+run.waveProgress.live,waveFor(1,1).total);
 run.restartWave();assert.deepEqual(run.waveProgress,{total:1200,queued:1200,live:0});
 run.reset();assert.deepEqual(run.waveProgress,{total:0,queued:0,live:0});
});
