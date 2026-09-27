import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun,waveFor} from './index.ts';
import {HordeFront} from '../sim/horde/model.ts';
import {DEFAULT_MAP} from '../content/index.ts';
import {previewNextWave} from './wave-preview.ts';

test('opening quotas match the requested progression and keep every species in a continuous stream',()=>{
 for(const [index,total] of [5000,10000,15000,25000,50000].entries()){
  const wave=waveFor(1,index+1);
  assert.equal(wave.total,total);
  assert.equal(wave.spawns.reduce((sum,b)=>sum+b.count,0),total);
  assert.equal(new Set(wave.spawns.map(b=>b.kind)).size,6);
  const duration=wave.total/wave.peakRate;
  for(const batch of wave.spawns){assert.equal(batch.start,0);assert.equal(batch.burst,1);assert.ok(Math.abs(batch.count/batch.rate!-duration)<1e-6);}
 }
});

test('larger waves feed continuously through the physical inlet until the full quota is emitted',()=>{
 for(let wave=1;wave<=5;wave++){
  const run=createRun(),front=new HordeFront();run.model.wave=wave-1;run.startWave();
  let elapsed=0,emitted=0,lastEmission=0;
  while(run.model.pending.length&&elapsed<3000){
   const positions=front.advance(1/60,DEFAULT_MAP,wave,1,run.model.pending);
   const added=run.takeSpawns(positions.length,1/60).reduce((sum,batch)=>sum+batch.count,0);
   emitted+=added;elapsed+=1/60;
   if(added)lastEmission=elapsed;
   assert.ok(elapsed-lastEmission<3,'continuous stream stalled');
  }
  assert.equal(run.waveProgress.queued,0,`wave ${wave} did not exhaust its quota`);
  assert.equal(emitted,waveFor(1,wave).total);
 }
});

test('wave forecast stays constant across stream widths and restart restores progress',()=>{
 for(const streamWidth of [1,60,100])assert.equal(previewNextWave({mode:'game',phase:'preparation',level:1,wave:0,difficulty:1,streamWidth})!.total,5000);
 const run=createRun();run.startWave();run.takeSpawns(20,1);
 assert.equal(run.waveProgress.queued+run.waveProgress.live,waveFor(1,1).total);
 run.restartWave();assert.deepEqual(run.waveProgress,{total:5000,queued:5000,live:0});
 run.reset();assert.deepEqual(run.waveProgress,{total:0,queued:0,live:0});
});
