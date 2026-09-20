import {createInfantryGPU} from '../../src/infantry/gpu.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,type SharedGPU,type WorldMap} from '../../src/contracts/index.ts';
import type {Soldier} from '../../src/infantry/model.ts';
const output=document.querySelector('#results')!,checks:string[]=[];
const assert=(ok:boolean,name:string)=>{if(!ok)throw Error(name);checks.push('PASS '+name);output.textContent=checks.join('\n');};
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}});const gpuErrors:string[]=[];device.addEventListener('uncapturederror',e=>gpuErrors.push(e.error.message));
 const shared:SharedGPU={capacity:4,particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})};
 const combat=await createCombat(device,shared),infantry=await createInfantryGPU(device,shared);
 const map:WorldMap={id:'gpu-test',width:40,height:40,spawn:{x:0,y:10,width:3,height:10},goal:{x:38,y:20},goalRadius:2,obstacles:[]};
 const soldier:Soldier={id:1,home:1,x:10,y:10,quality:0,health:40,cooldown:0,angle:0,flash:0,walk:0,dead:0};
 const writeEnemy=(generation=7)=>device.queue.writeBuffer(shared.particles,0,new Float32Array([12,10,0,0,.5,1,20,20,1,0,0,1,0,0,0,generation]));
 async function read(buffer:GPUBuffer,size:number){const staging=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyBufferToBuffer(buffer,0,staging,0,size);device.queue.submit([e.finish()]);await staging.mapAsync(GPUMapMode.READ);const result=staging.getMappedRange().slice(0);staging.unmap();staging.destroy();return result;}
 async function shoot(generation:number,obstacles=map.obstacles,damage=9){const e=device.createCommandEncoder();infantry.encode(e,[soldier],[{soldier:1,target:0,generation,damage,x:12,y:10}],{...map,obstacles},1,false);device.queue.submit([e.finish()]);return new Float32Array(await read(shared.particles,64));}
 writeEnemy();assert((await shoot(7))[6]===11,'rifle shot damages its live target');
 writeEnemy(8);assert((await shoot(7))[6]===20,'recycled zombie slots reject stale shot generations');
 writeEnemy();assert((await shoot(7,[{x:11,y:9,width:.5,height:2}]))[6]===20,'solid walls block rifle shots');
 writeEnemy();const e=device.createCommandEncoder();const finish=infantry.encode(e,[soldier],[],map,1,true);device.queue.submit([e.finish()]);finish?.();
 await device.queue.onSubmittedWorkDone();for(let i=0;i<100&&!infantry.threats.has(1);i++)await new Promise(r=>setTimeout(r,10));assert(infantry.threats.get(1)?.generation===7,'GPU sensing returns a live generation-stamped target');
 infantry.reset();assert(infantry.threats.size===0,'reset discards old sensing state');
 writeEnemy();await shoot(7,[],100);const settle=device.createCommandEncoder();combat.encodeBefore(settle,{dt:1/60,tick:1,count:1,map,effects:[],tuning:DEFAULT_TUNING,lab:false,towers:[]});combat.encodeAfter(settle,{dt:1/60,tick:1,count:1,map,effects:[],tuning:DEFAULT_TUNING,lab:false,towers:[]});device.queue.submit([settle.finish()]);const counters=new Uint32Array(await read(shared.counters,COUNTER_WORDS*4));assert(counters[0]===1,'rifle kills enter global kill and salvage settlement');assert(counters.slice(16,80).every(v=>v===0),'rifle kills do not grant turret veterancy');assert(counters[80]===1,'rifle kill is attributed to its infantry XP slot');
 for(const kind of ['rocket','flame','samurai'] as const){
  soldier.kind=kind;
  device.queue.writeBuffer(shared.particles,0,new Float32Array([
   12,10,0,0,.5,1,100,100,1,0,0,1,0,0,0,7,
   12,11,0,0,.5,1,100,100,1,0,0,1,0,0,0,8,
   8,10,0,0,.5,1,100,100,1,0,0,1,0,0,0,9,
   19,10,0,0,.5,1,100,100,1,0,0,1,0,0,0,10]));
  const blast=device.createCommandEncoder();infantry.encode(blast,[soldier],[{soldier:1,target:0,generation:7,damage:20,x:12,y:10}],map,4,false);device.queue.submit([blast.finish()]);
  const result=new Float32Array(await read(shared.particles,256));
  assert(result[6]===80&&result[22]===80,kind+' hits multiple zombies in its attack footprint');
  assert(result[38]===100&&result[54]===100,kind+' spares zombies outside its attack footprint');
  writeEnemy();assert((await shoot(7,[{x:11,y:9,width:.5,height:3}]))[6]===20,kind+' cannot attack through a wall');
 }
 assert(gpuErrors.length===0,'no GPU validation errors');infantry.destroy();combat.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();output.textContent+='\nALL CHECKS PASSED';
}catch(error){output.textContent+='\nFAIL '+String(error);console.error(error);}
