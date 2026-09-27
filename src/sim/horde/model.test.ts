import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP,ENEMIES,enemyCrushResistanceForScale,enemyPressureLimitForScale,enemySpeedForScale,enemyTierForHealthScale} from '../../content/index.ts';
import {P,PARTICLE_FLOATS} from '../../contracts/index.ts';
import {createRun,waveFor} from '../../game/index.ts';
import {HordeCapacity,HordeFront,encodeHorde,hordeHealthScale} from './model.ts';

function sample(wave:number,difficulty:number,width=60){
 const front=new HordeFront(),map={...DEFAULT_MAP,spawn:{...DEFAULT_MAP.spawn,height:width}},batches=waveFor(1,wave).spawns;
 let count=0;const sizes:number[]=[];
 for(let tick=0;tick<1800;tick++){
  const points=front.advance(1/60,map,wave,difficulty,batches);count+=points.length;if(points.length)sizes.push(points.length);
  for(const point of points){assert.ok(point.x<0&&point.x>-16);assert.ok(point.y>0&&point.y<map.height);}
  const particles=encodeHorde([{...batches[0],count:points.length}],points);
  for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=2*particles[i*PARTICLE_FLOATS+P.radius]);
 }
 return {count,sizes};
}
test('offscreen front varies packing and scales with intensity, wave and frontage',()=>{
 const low=sample(1,1),high=sample(1,40),later=sample(11,40);
 assert.ok(high.count>low.count*1.5);assert.ok(later.count>0);assert.ok(new Set(low.sizes).size>8);
 assert.ok(sample(1,1,100).count>low.count);assert.ok(sample(10,1,1).count>0,'brutes fit even at minimum width');
 assert.deepEqual(sample(1,1),low,'formation is deterministic');
});
test('late-wave enemy tiers strengthen only newly spawned units',()=>{
 const early=waveFor(1,1).spawns[0],late=waveFor(1,30).spawns[0];
 assert.equal(enemyTierForHealthScale(waveFor(1,1).healthScale),0);
 assert.ok(enemyTierForHealthScale(late.healthScale!)>0);
 const earlyData=encodeHorde([{...early,count:1}], [{x:-1,y:10}]);
 const lateData=encodeHorde([{...late,count:1}], [{x:-1,y:10}]);
 assert.equal(earlyData[P.maxHp],Math.fround(ENEMIES[early.kind].health*hordeHealthScale(early.seed,0,early.healthScale!)));
 assert.equal(lateData[P.maxHp],Math.fround(ENEMIES[late.kind].health*hordeHealthScale(late.seed,0,late.healthScale!)));
 assert.ok(lateData[P.vx]>earlyData[P.vx]);
 assert.ok(enemyPressureLimitForScale(late.kind,late.healthScale!)>ENEMIES[late.kind].pressureLimit);
 assert.ok(enemyCrushResistanceForScale(late.kind,late.healthScale!)>ENEMIES[late.kind].crushResistance);
 assert.ok(Math.abs(earlyData[P.vx]-enemySpeedForScale(early.kind,hordeHealthScale(early.seed,0,early.healthScale)))<1e-5);
});
test('full pool resumes conservatively with delayed readback',()=>{
 const pool=new HordeCapacity();pool.add(1,10);assert.equal(pool.available(10),0);
 pool.settle(1,6);assert.equal(pool.available(10),4);pool.add(2,4);
 pool.settle(1,6);assert.equal(pool.available(10),0,'stale readback cannot free pending arrivals');
 pool.settle(2,8);assert.equal(pool.available(10),2);pool.reset();assert.equal(pool.available(10),10);
});
test('narrow front retains mixed species and never spends unavailable arrivals',()=>{
 const run=createRun();run.startWave();run.model.pending=waveFor(1,9).spawns.map(batch=>({...batch}));
 run.takeSpawns(0,1); // Fill bounded arrival credit before testing capacity allocation.
 const kinds=new Set<string>();let total=0;
 for(let tick=0;tick<120;tick++)for(const batch of run.takeSpawns(tick%20===0?20:0,1/60)){kinds.add(batch.kind);total+=batch.count;}
 assert.equal(kinds.size,6);assert.equal(total,120);
 const front=new HordeFront();const positions=front.advance(1/60,DEFAULT_MAP,1,1,waveFor(1,1).spawns);
 const data=encodeHorde([{kind:'runner',count:positions.length,seed:0}],positions);
 assert.ok(Math.abs(data[P.vx]-enemySpeedForScale('runner',hordeHealthScale(0,0)))<1e-6);
});

 test('single-file arrivals do not starve minority enemy types',()=>{
  const run=createRun();run.startWave();run.model.pending=waveFor(1,9).spawns.map(batch=>({...batch}));const kinds=new Set<string>();
  for(let tick=0;tick<1000;tick++)for(const batch of run.takeSpawns(1,1/60))kinds.add(batch.kind);
  assert.equal(kinds.size,6);
 });

test('interleaved bodies vary health and speed deterministically within their species',()=>{
 const positions=Array.from({length:100},(_,i)=>({x:-1,y:i}));
 const batches=[{kind:'shambler' as const,count:70,seed:123},{kind:'runner' as const,count:30,seed:456}];
 const data=encodeHorde(batches,positions);
 assert.deepEqual(data,encodeHorde(batches,positions));
 const health=new Set<number>(),speed=new Set<number>();let changes=0;
 for(let i=0;i<100;i++){
  const offset=i*PARTICLE_FLOATS,kind=data[offset+P.kind]===0?'shambler':'runner';
  const scale=data[offset+P.maxHp]/ENEMIES[kind].health;
  assert.ok(scale>=.8999&&scale<=1.4001);
  assert.ok(Math.abs(data[offset+P.vx]-enemySpeedForScale(kind,scale))<1e-5);
  if(kind==='shambler'){health.add(data[offset+P.maxHp]);speed.add(data[offset+P.vx]);}
  if(i&&data[offset+P.kind]!==data[offset-PARTICLE_FLOATS+P.kind])changes++;
 }
 assert.ok(health.size>50);assert.ok(speed.size>1);assert.ok(changes>40,'species should be woven through the front');
});
