import {connectGPU} from '../../src/runtime/gpu.ts';
import {createHorde} from '../../src/sim/horde/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {DEFAULT_MAP} from '../../src/content/index.ts';
import {DEFAULT_TUNING,HORDE_PRESSURE_COUNTER,P,PARTICLE_BYTES,PARTICLE_FLOATS,type PhysicsFrame} from '../../src/contracts/index.ts';
const results=document.querySelector('#results')!,status=document.querySelector('#status')!;
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
try{
 const gpu=await connectGPU(document.querySelector('canvas')!);gpu.shared.capacity=16;
 const errors:string[]=[];gpu.device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
 const horde=await createHorde(gpu.device,gpu.shared),physics=await createPhysics(gpu.device,gpu.shared),combat=await createCombat(gpu.device,gpu.shared);
 async function read(){const buffer=gpu.device.createBuffer({size:16*PARTICLE_BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const encoder=gpu.device.createCommandEncoder();encoder.copyBufferToBuffer(gpu.shared.particles,0,buffer,0,buffer.size);gpu.device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);const data=new Float32Array(buffer.getMappedRange()).slice();buffer.unmap();buffer.destroy();return data;}
 let tick=0;
 function step(data:Float32Array=new Float32Array(0),kill=false){
  const frame:PhysicsFrame={dt:1/60,tick:++tick,count:16,map:{...DEFAULT_MAP,obstacles:[]},effects:kill?[{kind:'shot',x:-12,y:50,radius:100,strength:0,damage:1000,direction:{x:0,y:0},cone:0,duration:0,source:0}]:[],tuning:DEFAULT_TUNING,lab:false};
  const encoder=gpu.device.createCommandEncoder();horde.encode(encoder,data,16);combat.encodeBefore(encoder,{...frame,towers:[]});physics.encode(encoder,frame);combat.encodeAfter(encoder,{...frame,towers:[]});gpu.device.queue.submit([encoder.finish()]);
 }
 const points=Array.from({length:16},(_,i)=>({x:-14+(i%4)*1.2,y:44+Math.floor(i/4)*1.2}));
 const arrivals=encodeHorde([{kind:'shambler',count:16,seed:1}],points);
 horde.reset();step(arrivals);let data=await read();
 for(let i=0;i<16;i++){assert(data[i*16+P.x]<-10,'offscreen entry teleported to the battlefield');assert(data[i*16+P.x]>-14,'horde did not move forward');assert(data[i*16+P.pressure]<.1,'loose entry gained artificial boundary pressure');}
 results.textContent+='PASS: offscreen movement, no teleport, no false edge pressure\n';
 for(let i=0;i<300;i++)step();data=await read();assert(data[P.x]>0,'horde never crossed onto battlefield');assert(data.every(Number.isFinite),'non-finite physics');results.textContent+='PASS: continuous crossing onto battlefield\n';
 // Repeated actual combat deaths and allocation through a deliberately tiny pool.
 for(let cycle=0;cycle<64;cycle++){step(undefined,true);step(arrivals);}
 data=await read();
 for(let i=0;i<16;i++){assert(data[i*PARTICLE_FLOATS+P.alive]===1,'recycled slot missing');assert(data[i*PARTICLE_FLOATS+P.generation]===65,'slot was overwritten or not recycled');assert(data[i*PARTICLE_FLOATS+P.hp]===30,'recycled zombie inherited damage');}
 results.textContent+='PASS: 1,024 replacements through 16 slots with fresh health and generations\n';
 // Attempts at a full pool cannot replace survivors.
 step(arrivals);data=await read();assert(data[P.generation]===65,'live slot overwritten');results.textContent+='PASS: live slots protected\n';
 step(undefined,true);step(encodeHorde([{kind:'shambler',count:16,seed:1}],Array.from({length:16},()=>({x:-13,y:50}))));
 const telemetry=gpu.device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=gpu.device.createCommandEncoder();
 encoder.copyBufferToBuffer(gpu.shared.counters,HORDE_PRESSURE_COUNTER*4,telemetry,0,4);gpu.device.queue.submit([encoder.finish()]);await telemetry.mapAsync(GPUMapMode.READ);
 assert(new Uint32Array(telemetry.getMappedRange())[0]===1,'congested approach failed to signal backpressure');telemetry.unmap();telemetry.destroy();
 results.textContent+='PASS: congested approach signals backpressure\n';
 await gpu.device.queue.onSubmittedWorkDone();assert(!errors.length,errors.join('\n'));
 status.textContent=`5/5 passed · ${gpu.adapter} · GPU errors ${errors.length}`;
 horde.destroy();physics.destroy();combat.destroy();gpu.shared.particles.destroy();gpu.shared.counters.destroy();gpu.device.destroy();
}catch(error){status.textContent='FAILED';results.textContent+='\n'+String(error);}
