import assert from 'node:assert/strict';
import test from 'node:test';
import {waveEnemyStrength} from './enemy-strength.ts';
import {createRun,waveFor} from './index.ts';
import {encodeHorde} from '../sim/horde/model.ts';
import {ENEMIES,enemyCrushResistanceForScale,enemySpeedForScale} from '../content/index.ts';
import {P,PARTICLE_FLOATS,type SpawnBatch} from '../contracts/index.ts';

test('wave strength ramps smoothly from baseline to 80 percent tougher',()=>{
 assert.equal(waveEnemyStrength(0),1);assert.equal(waveEnemyStrength(.5),1.4);assert.equal(waveEnemyStrength(1),1.8);
 assert.equal(waveEnemyStrength(-1),1);assert.equal(waveEnemyStrength(2),1.8);assert.equal(waveEnemyStrength(NaN),1);
 let previous=1;for(let i=0;i<=100;i++){const current=waveEnemyStrength(i/100);assert.ok(current>=previous);previous=current;}
});

const encode=(batches:SpawnBatch[])=>encodeHorde(batches,Array.from({length:batches.reduce((sum,b)=>sum+b.count,0)},(_,i)=>({x:-10,y:i})));
const averageStrength=(data:Float32Array)=>{
 let total=0;for(let i=0;i<data.length;i+=PARTICLE_FLOATS){const enemy=Object.values(ENEMIES).find(e=>e.index===data[i+P.kind])!;total+=data[i+P.maxHp]/enemy.health;}
 return total/(data.length/PARTICLE_FLOATS);
};

test('late arrivals are tougher and faster within the same wave without changing existing bodies',()=>{
 const run=createRun();run.startWave();const early=encode(run.takeSpawns(500));const original=early.slice();
 run.takeSpawns(waveFor(1,1).total-1000);const late=encode(run.takeSpawns(500));
 assert.ok(averageStrength(late)>averageStrength(early)*1.65);
 const earlyStrength=averageStrength(early),lateStrength=averageStrength(late);
 assert.ok(enemySpeedForScale('shambler',lateStrength)>enemySpeedForScale('shambler',earlyStrength));
 assert.ok(enemyCrushResistanceForScale('shambler',lateStrength)>enemyCrushResistanceForScale('shambler',earlyStrength));
 assert.deepEqual(early,original);
 run.restartWave();assert.deepEqual(encode(run.takeSpawns(500)),early,'restart reproduces birth stats');
});

test('per-body strength is independent of emission packet size',()=>{
 const batch:SpawnBatch={kind:'shambler',count:100,seed:123,healthScale:1,initialCount:100};
 const together=encode([batch]);
 const first=encode([{...batch,count:40,spawnOffset:0}]);
 const rest=encode([{...batch,count:60,seed:163,spawnOffset:40}]);
 for(let i=0;i<100;i++){
  const part=i<40?first:rest,offset=(i<40?i:i-40)*PARTICLE_FLOATS;
  assert.equal(together[i*PARTICLE_FLOATS+P.maxHp],part[offset+P.maxHp]);
  assert.equal(together[i*PARTICLE_FLOATS+P.vx],part[offset+P.vx]);
 }
});

test('carried batches keep their original wave strength progress when a new wave starts',()=>{
 const run=createRun();run.startWave();const total=waveFor(1,1).total;run.takeSpawns(total-100);
 run.applySettlement({epoch:run.epoch,tick:1,kills:total-100,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0});
 const offsets=new Map(run.model.pending.map(batch=>[batch.seed,batch.initialCount!-batch.count]));
 assert.equal(run.finishWaveEarly().ok,true);run.startWave();
 const next=run.takeSpawns(500);
 const old=next.filter(batch=>offsets.has(batch.seed));assert.ok(old.length);
 assert.ok(old.every(batch=>batch.spawnOffset===offsets.get(batch.seed)));
 assert.ok(next.filter(batch=>!offsets.has(batch.seed)).every(batch=>batch.spawnOffset===0));
});
