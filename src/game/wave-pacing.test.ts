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
  const duration=wave.rampSeconds;
  for(const batch of wave.spawns){assert.equal(batch.start,0);assert.equal(batch.burst,1);assert.ok(Math.abs(batch.count/batch.rate!-duration)<1e-6);}
 }
});

test('larger waves feed continuously through the physical inlet until the full quota is emitted',()=>{
 for(let wave=1;wave<=5;wave++){
  const run=createRun(),front=new HordeFront();run.model.wave=wave-1;run.startWave();
  let elapsed=0,emitted=0,lastEmission=0;
  while(run.model.pending.length&&elapsed<3000){
   const positions=front.advance(1/60,DEFAULT_MAP,wave,1,run.model.pending,run.spawnPressure);
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

test('physical arrivals retain recovery windows and the strongest late surge across wave rhythms',()=>{
 for(const wave of [1,2,3]){
  const run=createRun(),front=new HordeFront();run.model.wave=wave-1;run.startWave();
  const total=waveFor(1,wave).total,bins=Array.from({length:10},()=>({count:0,seconds:0}));
  let ticks=0;
  while(run.model.pending.length&&ticks++<180_000){
   const progress=1-run.waveProgress.queued/total,bin=bins[Math.min(9,Math.floor(progress*10))];
   const positions=front.advance(1/60,DEFAULT_MAP,wave,1,run.model.pending,run.spawnPressure);
   bin.count+=run.takeSpawns(positions.length,1/60).reduce((sum,b)=>sum+b.count,0);bin.seconds+=1/60;
  }
  assert.equal(run.waveProgress.queued,0);
  const rates=bins.map(bin=>bin.count/bin.seconds);
  const recovery=Math.min(...rates.slice(2,8)),climax=rates[8];
  assert.ok(climax>recovery*2,`wave ${wave} needs a clear recovery and climax: ${rates}`);
  assert.ok(climax>Math.max(...rates.slice(0,7)),`wave ${wave} should culminate late: ${rates}`);
  assert.equal(bins.reduce((sum,bin)=>sum+bin.count,0),total);
 }
});

test('blocked entrances preserve the current beat and restarting restores its opening',()=>{
 const run=createRun();run.startWave();const opening=run.spawnPressure;
 run.takeSpawns(0,600);assert.equal(run.spawnPressure,opening);
 run.takeSpawns(2_500);assert.notEqual(run.spawnPressure,opening);
 run.restartWave();assert.equal(run.spawnPressure,opening);
 assert.ok(run.takeSpawns(65_536,1/60).reduce((sum,b)=>sum+b.count,0)<10,'restart must clear stored arrival credit');
});
