import {createCombat} from '../../src/sim/combat/index.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {buildNavigation} from '../../src/navigation/index.ts';
import {barrierSegments} from '../../src/game/barrier-path.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,PARTICLE_BYTES,PARTICLE_FLOATS,type SharedGPU,type WorldMap} from '../../src/contracts/index.ts';
import {ENEMIES} from '../../src/content/index.ts';
const status=document.querySelector('#status')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}});
 const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const shared:SharedGPU={capacity:1,particles:device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})};
 const combat=await createCombat(device,shared);
 const physics=await createPhysics(device,shared,{indexedObstacles:true}),readback=device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const cases=[
  {name:'fractional tree edge',obstacles:[{x:8.25,y:3.25,width:2,height:2}],start:{x:4,y:4.9}},
  {name:'angled chain-link',obstacles:barrierSegments('fence',1,[{x:12,y:2},{x:16,y:14}]),start:{x:5,y:7.9}},
  {name:'fence endpoint',obstacles:barrierSegments('fence',1,[{x:12,y:2},{x:12,y:14}]),start:{x:10.5,y:13.1}},
  {name:'displaced tree margin',obstacles:[{x:8.25,y:3.25,width:2,height:2}],start:{x:7.55,y:4.8}},
 ];
 status.textContent='';
 try{for(const entry of cases)for(const kind of ['shambler','brute'] as const){
  const enemy=ENEMIES[kind],map:WorldMap={id:entry.name,width:32,height:20,obstacles:entry.obstacles,spawn:{x:0,y:2,width:1,height:16},goal:{x:29,y:10},goalRadius:1},navigation=buildNavigation(map);
  physics.reset();const initial=new Float32Array(PARTICLE_FLOATS);initial[P.x]=entry.start.x;initial[P.y]=entry.start.y;initial[P.radius]=enemy.radius;initial[P.mass]=enemy.mass;initial[P.hp]=initial[P.maxHp]=enemy.health;initial[P.kind]=enemy.index;initial[P.alive]=1;
  device.queue.writeBuffer(shared.particles,0,initial);device.queue.writeBuffer(shared.counters,0,new Uint32Array(COUNTER_WORDS));let reached=false;
  for(let batch=0;batch<100;batch++){
   const encoder=device.createCommandEncoder();
   for(let step=0;step<12;step++)physics.encode(encoder,{dt:1/30,tick:batch*12+step,count:1,map,navigation,effects:[],tuning:DEFAULT_TUNING,lab:false});
   encoder.copyBufferToBuffer(shared.particles,0,readback,0,PARTICLE_BYTES);device.queue.submit([encoder.finish()]);await readback.mapAsync(GPUMapMode.READ);const values=new Float32Array(readback.getMappedRange()).slice();readback.unmap();
   const x=values[P.x],y=values[P.y];if(!Number.isFinite(x+y))throw Error(`${entry.name}: invalid body`);
   if(map.obstacles.some(r=>x>r.x-enemy.radius+.01&&x<r.x+r.width+enemy.radius-.01&&y>r.y-enemy.radius+.01&&y<r.y+r.height+enemy.radius-.01))throw Error(`${entry.name}/${kind}: crossed solid terrain at ${x},${y}`);
   if(Math.hypot(x-map.goal.x,y-map.goal.y)<1.5){reached=true;break;}
  }
  if(!reached)throw Error(`${entry.name}/${kind}: failed to make progress to goal`);
  status.textContent+=`PASS: ${entry.name} / ${kind} reaches goal without crossing obstacles\n`;
 }}finally{physics.destroy();combat.destroy();readback.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();}
 if(errors.length)throw Error(errors.join('\n'));status.textContent+='PASS: all eight live GPU movement checks';
}catch(error){status.textContent+='\nFAIL: '+String(error);console.error(error);}
