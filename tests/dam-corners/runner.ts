import {createCombat} from '../../src/sim/combat/index.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {damMap,DAM_GATES} from '../../src/content/dam.ts';
import {buildNavigation} from '../../src/navigation/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,type SharedGPU} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU');const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}});
 const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const shared:SharedGPU={capacity:1,particles:device.createBuffer({size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})};
 const combat=await createCombat(device,shared);const physics=await createPhysics(device,shared),readback=device.createBuffer({size:64,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 const map=damMap();map.obstacles.push(...DAM_GATES);const navigation=buildNavigation(map);
 status.textContent='';let failures=0;
 for(const kind of ['shambler','runner','husk','brute','rager','softbody'] as const){
 for(const pos of [{x:31.6,y:31.6},{x:31.2,y:31.2},{x:31.6,y:32.2}]){
 physics.reset();const initial=encodeHorde([{kind,count:1,seed:5}],[pos]);device.queue.writeBuffer(shared.particles,0,initial);let final=initial;
 for(let tick=1;tick<=1800;tick++){
  const e=device.createCommandEncoder();physics.encode(e,{dt:1/60,tick,count:1,map,navigation,effects:[],tuning:DEFAULT_TUNING,lab:false});
  if(tick%60===0)e.copyBufferToBuffer(shared.particles,0,readback,0,64);device.queue.submit([e.finish()]);
  if(tick%60===0){await readback.mapAsync(GPUMapMode.READ);final=new Float32Array(readback.getMappedRange()).slice();readback.unmap();}
 }
 const escaped=final[P.y]>40||final[P.x]>40;
 if(!escaped)failures++;
 status.textContent+=`${escaped?'PASS':'FAIL'} ${kind} ${JSON.stringify(pos)} -> ${final[P.x].toFixed(3)},${final[P.y].toFixed(3)} velocity ${final[P.vx].toFixed(3)},${final[P.vy].toFixed(3)}\n`;
 }}
 physics.destroy();combat.destroy();readback.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();if(errors.length)throw Error(errors.join('\n'));status.textContent+=failures?`${failures} failed routes`:'ALL PASSED';
}catch(error){status.textContent+='\nFAIL '+String(error);}
