import {createPhysics} from '../../src/sim/physics/index.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,type SharedGPU,type WorldMap} from '../../src/contracts/index.ts';
import {ENEMIES,ENEMY_BOUNTY_DIVISOR} from '../../src/content/index.ts';

export async function checkHybrid(device:GPUDevice){
 const read=async(buffer:GPUBuffer)=>{const s=device.createBuffer({size:buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyBufferToBuffer(buffer,0,s,0,s.size);device.queue.submit([e.finish()]);await s.mapAsync(GPUMapMode.READ);const data=s.getMappedRange().slice(0);s.unmap();s.destroy();return data;};
 const map:WorldMap={id:'hybrid-check',width:160,height:100,spawn:{x:0,y:0,width:10,height:100},goal:{x:150,y:50},goalRadius:2,obstacles:[{x:47,y:0,width:.1,height:100}]};
 async function run(mode:'exact'|'hybrid',dense:boolean){
  const count=dense?512:32,points=Array.from({length:count},(_,i)=>dense?{x:40+(i%32)*.18,y:40+Math.floor(i/32)*.18}:{x:10+(i%4)*3,y:10+Math.floor(i/4)*3});
  const initial=encodeHorde([{kind:'shambler',count,seed:5}],points),shared:SharedGPU={capacity:count,particles:device.createBuffer({size:initial.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})};
  const physics=await createPhysics(device,shared,{crowdMode:mode}),combat=await createCombat(device,shared);
  device.queue.writeBuffer(shared.particles,0,initial);
  try{
   for(let tick=1;tick<=180;tick++){
    const effects=tick===80?[{kind:'push' as const,x:43,y:42,radius:10,strength:15,damage:0,direction:{x:1,y:0},cone:0,duration:0,source:0}]:[];
    const frame={dt:1/60,tick,count,map,effects,tuning:DEFAULT_TUNING,lab:true,towers:[]},e=device.createCommandEncoder();combat.encodeBefore(e,frame);physics.encode(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);
    if(tick%15===0)await device.queue.onSubmittedWorkDone();
   }
   const particles=new Float32Array(await read(shared.particles)),counters=new Uint32Array(await read(shared.counters));
   if(!particles.every(Number.isFinite))throw Error('hybrid non-finite particle');
   let live=0;for(let i=0;i<count;i++){if(particles[i*16+P.alive]>.5)live++;if(particles[i*16+P.x]>47-particles[i*16+P.radius]+.002)throw Error('hybrid wall tunneling');}
   if(live+counters[0]!==count||live!==counters[4])throw Error('hybrid population conservation');
   if(counters[3]!==Math.floor(counters[0]*ENEMIES.shambler.bounty/ENEMY_BOUNTY_DIVISOR))throw Error('hybrid reward accounting');
   if(counters[5]!==0)throw Error('hybrid invalid state counter');
   return {particles,live,kills:counters[0],earned:counters[3]};
  }finally{physics.destroy();combat.destroy();shared.particles.destroy();shared.counters.destroy();}
 }
 const sparseExact=await run('exact',false),sparseHybrid=await run('hybrid',false);
 let maxSparseDifference=0;for(let i=0;i<sparseExact.particles.length;i++)maxSparseDifference=Math.max(maxSparseDifference,Math.abs(sparseExact.particles[i]-sparseHybrid.particles[i]));
 if(maxSparseDifference>.0001)throw Error(`sparse hybrid changed exact solver: ${maxSparseDifference}`);
 const denseExact=await run('exact',true),denseHybrid=await run('hybrid',true);
 return {maxSparseDifference,denseExact:{live:denseExact.live,kills:denseExact.kills},denseHybrid:{live:denseHybrid.live,kills:denseHybrid.kills},note:'Dense behavior is approximate; accounting and wall collision checks are exact.'};
}
