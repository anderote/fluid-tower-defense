import {campaignMap} from '../../src/content/levels.ts';
import {createBoss} from '../../src/sim/bosses/index.ts';
import {BOSS_BYTES,BOSS_RADIUS,BOSS_PHASE} from '../../src/sim/bosses/model.ts';
import {COUNTER_WORDS,PARTICLE_BYTES,type SharedGPU} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();
 const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const shared:SharedGPU={particles:device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),capacity:1};
 const boss=await createBoss(device,shared),readback=device.createBuffer({size:BOSS_BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 status.textContent='';
 try{for(const level of [1,2,3]){
   const map=campaignMap(level);boss.reset(true);let reached=false,tick=0;
   for(let batch=0;batch<240;batch++){
     const encoder=device.createCommandEncoder();
     for(let step=0;step<12;step++){const frame={map,dt:.1,tick:++tick,count:0,active:true};boss.encode(encoder,frame);boss.encodeResolve(encoder,frame);}
     encoder.copyBufferToBuffer(boss.buffer,0,readback,0,BOSS_BYTES);device.queue.submit([encoder.finish()]);await readback.mapAsync(GPUMapMode.READ);
     const values=new Float32Array(readback.getMappedRange()).slice();readback.unmap();const [x,y]=values;
     if(!Number.isFinite(x+y))throw Error(`Level ${level}: invalid boss position`);
     if(map.obstacles.some(r=>Math.hypot(x-Math.max(r.x,Math.min(x,r.x+r.width)),y-Math.max(r.y,Math.min(y,r.y+r.height)))<BOSS_RADIUS-.1))throw Error(`Level ${level}: boss intersects terrain at ${x.toFixed(2)},${y.toFixed(2)}`);
     if(values[8]===BOSS_PHASE.leaked){reached=true;break;}
   }
   if(!reached)throw Error(`Level ${level}: boss failed to reach goal`);
   status.textContent+=`PASS: ${map.scenery!.title} — boss reaches goal without crossing scenery (${tick} ticks)\n`;
 }}finally{boss.destroy();readback.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();}
 if(errors.length)throw Error(errors.join('\n'));status.textContent+='PASS: all three live GPU routes';
}catch(error){status.textContent+='\nFAIL: '+String(error);console.error(error);}
