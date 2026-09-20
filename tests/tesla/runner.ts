import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {createRenderer} from '../../src/render/index.ts';
import {createAudio} from '../../src/audio/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,type RenderScene,type Tower} from '../../src/contracts/index.ts';
import {TOWERS} from '../../src/content/index.ts';
import {TESLA_HEADER_BYTES,TESLA_PARTICLE_BYTES} from '../../src/effects/tesla.ts';

const status=document.querySelector('#status')!;
function assert(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
try{
 const canvas=document.querySelector('canvas')!,gpu=await connectGPU(canvas),{device,shared}=gpu;
 device.addEventListener('uncapturederror',event=>{status.textContent=`FAIL: ${event.error.message}`;});
 device.pushErrorScope('validation');
 const combat=await createCombat(device,shared);shared.shotState=combat.shotState;
 const tower:Tower={id:1,kind:'tesla',x:15,y:16,angle:0,level:0,branch:-1,cooldown:0,spent:0};
 const map={id:'tesla-lab',width:60,height:32,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:30,y:16},goalRadius:0};
 const definition={...TOWERS.tesla,damage:10,cooldown:2.6};
 const frame:CombatFrame={dt:1/60,tick:60,count:8,map,effects:[],tuning:DEFAULT_TUNING,lab:true,towers:[{tower,definition}]};
 const positions=[[30,16],[34,13],[38,16],[42,13],[46,16],[50,13],[54,16],[58,13]];
 const seed=(health=30,generation=1)=>{
  const data=new Float32Array(8*16);positions.forEach(([x,y],i)=>{data.set([x,y,0,0,.4125,1,health,health,0,0,0,1,0,0,0,generation],i*16);});
  device.queue.writeBuffer(shared.particles,0,data);device.queue.writeBuffer(shared.counters,0,new Uint32Array(COUNTER_WORDS));return data;
 };
 const read=async(buffer:GPUBuffer,offset=0,size=buffer.size)=>{
  const copy=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),encoder=device.createCommandEncoder();
  encoder.copyBufferToBuffer(buffer,offset,copy,0,size);device.queue.submit([encoder.finish()]);await copy.mapAsync(GPUMapMode.READ);
  const result=new Float32Array(copy.getMappedRange()).slice();copy.unmap();copy.destroy();return result;
 };
 const step=()=>{const e=device.createCommandEncoder();combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);};
 let checks=0;
 // Actual GPU chain walks away from the primary, rather than a random splash around it.
 seed();step();
 let links=await read(shared.teslaState!,0,6*16),particles=await read(shared.particles,0,8*64);
 assert([0,1,2,3].every((id,i)=>links[i*4+2]===id),'Chain did not walk through four distinct nearest targets');checks++;
 assert(links[18]===-2&&particles[4*16+P.hp]===30,'Base coil exceeded its four-target limit');checks++;
 assert(Math.abs(particles[3*16+P.hp]-(30-10*.52*.82**2))<.001,'Distant chain damage/falloff mismatch');checks++;
 assert(particles[12]>.319&&particles[13]>.7,'Tesla status effects were lost');checks++;
 combat.reset();tower.branch=1;seed();step();links=await read(shared.teslaState!,0,6*16);
 assert([0,1,2,3,4,5].every((id,i)=>links[i*4+2]===id),'Storm Cell did not extend the chain to six targets');checks++;
 // A gap must terminate the chain, and empty slots must never become targets.
 combat.reset();tower.branch=-1;let data=seed();data[P.x]=20;device.queue.writeBuffer(shared.particles,0,data);frame.map={...map,goal:{x:20,y:16}};step();links=await read(shared.teslaState!,0,6*16);
 assert(links[2]===0&&links[6]===-2,'Chain jumped across an out-of-range gap');checks++;frame.map=map;
 combat.reset();seed(1);step();
 particles=await read(shared.particles,0,8*64);let shocks=await read(shared.teslaState!,TESLA_HEADER_BYTES,8*TESLA_PARTICLE_BYTES);
 assert(particles[P.alive]===-1&&shocks[2]===1&&shocks[0]===61,'Lethal hit did not retain electrocution state');checks++;
 const counters=await read(shared.counters,0,COUNTER_WORDS*4);assert(new Uint32Array(counters.buffer)[16]===4,'Chain kills not attributed to coil');checks++;
 const corpse=shocks.slice(4,8);seed(30,2);frame.tick=61;step();shocks=await read(shared.teslaState!,TESLA_HEADER_BYTES,8*TESLA_PARTICLE_BYTES);
 assert(corpse.every((v,i)=>shocks[4+i]===v)&&corpse[3]===61,'Horde slot recycling erased the death animation');checks++;frame.tick=60;
 // Burn/non-Tesla deaths should not become Tesla deaths just because they were shocked earlier.
 combat.reset();seed(30);step();frame.tick=61;data=await read(shared.particles,0,8*64);data[P.hp]=0;device.queue.writeBuffer(shared.particles,0,data);step();shocks=await read(shared.teslaState!,TESLA_HEADER_BYTES,8*TESLA_PARTICLE_BYTES);
 assert(shocks[2]===0,'Unrelated death incorrectly marked as electrocution');checks++;
 // Slot reuse must preserve the distinct generation until the new enemy is actually hit.
 seed(30,2);frame.tick=62;step();shocks=await read(shared.teslaState!,TESLA_HEADER_BYTES,8*TESLA_PARTICLE_BYTES);particles=await read(shared.particles,0,8*64);
 assert(shocks[1]!==particles[P.generation]&&particles[P.hp]===30,'Recycled enemy inherited the previous hit');checks++;
 combat.reset();const reset=await read(shared.teslaState!,0,TESLA_HEADER_BYTES+8*TESLA_PARTICLE_BYTES);assert(reset.every(v=>v===0),'Reset retained electrical effects');checks++;
 // Keep a real production hit frozen for inspection at arbitrary animation ages.
 frame.tick=60;tower.branch=-1;seed(1);step();const shot=await read(combat.shotState,0,48);
 const renderer=await createRenderer(device,gpu.context,gpu.format,shared,canvas);
 const scene:RenderScene={count:8,time:1,map:{...map,goal:{x:100,y:100}},towers:[tower],effects:[],heatmap:false,selection:null};
 const audio=createAudio();document.querySelector('#sound')!.addEventListener('click',()=>{audio.arm();audio.fire('tesla',80,1);});
 const start=performance.now();let raf=0;
 const draw=()=>{const selected=(document.querySelector('#age') as HTMLSelectElement).value;const age=selected==='auto'?((performance.now()-start)/1000)%2.8:Number(selected);
  scene.time=1+age;shot[0]=Math.max(0,definition.cooldown-age);device.queue.writeBuffer(combat.shotState,0,shot);
  const e=device.createCommandEncoder();renderer.encode(e,scene);device.queue.submit([e.finish()]);raf=requestAnimationFrame(draw);
 };draw();await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent=`PASS: ${checks} GPU combat checks; original skeleton sequence and renderer validated.`;
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);audio.destroy();renderer.destroy();combat.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}
