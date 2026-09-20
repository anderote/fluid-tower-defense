import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {DEFAULT_TUNING,P,type HeavyProjectile,type Tower} from '../../src/contracts/index.ts';
import {TOWERS} from '../../src/content/index.ts';
import {advanceHeavyProjectiles,createHeavyProjectiles} from '../../src/effects/heavy-weapons.ts';
const status=document.querySelector('#status')!;
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
try{
 const {device,shared}=await connectGPU(document.querySelector('canvas')!);
 device.pushErrorScope('validation');
 shared.bossState=device.createBuffer({size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
 const combat=await createCombat(device,shared);
 const tower:Tower={id:1,kind:'rocket',x:10,y:10,angle:0,level:0,branch:-1,cooldown:0,spent:0};
 const frame:CombatFrame={dt:1/60,tick:100,count:4,map:{id:'impact-test',width:80,height:40,obstacles:[],spawn:{x:0,y:0,width:1,height:1},goal:{x:30,y:10},goalRadius:0},effects:[],tuning:DEFAULT_TUNING,lab:true,towers:[{tower,definition:{...TOWERS.rocket,cooldown:10}}]};
 const seed=()=>{const data=new Float32Array(64);[10,10-6.6*.48,10+6.6*.48,10].forEach((y,i)=>data.set([i===3?60:30,y,0,0,.4,1,1000,1000,0,0,0,1,0,0,0,1],i*16));device.queue.writeBuffer(shared.particles,0,data);};
 const read=async(buffer:GPUBuffer,size:number)=>{const copy=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyBufferToBuffer(buffer,0,copy,0,size);device.queue.submit([e.finish()]);await copy.mapAsync(GPUMapMode.READ);const data=new Float32Array(copy.getMappedRange()).slice();copy.unmap();copy.destroy();return data;};
 const step=async(tick:number)=>{frame.tick=tick;const e=device.createCommandEncoder();combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);return read(shared.particles,256);};
 let checks=0;
 for(const kind of ['rocket','mortar'] as const){
  combat.reset();seed();tower.kind=kind;frame.towers=[{tower,definition:{...TOWERS[kind],cooldown:10}}];
  let projectiles:HeavyProjectile[]=createHeavyProjectiles(kind,[tower],{x:30,y:10},1).map(p=>({...p,launchTick:100}));
  let before=await step(100);assert(before[P.hp]===1000&&before[16+P.hp]===1000,`${kind} damaged on launch`);checks++;
  const shot=await read(combat.shotState,48);assert(shot[11]===100,'Launch timestamp missing');checks++;
  for(let tick=101;tick<=140;tick++){
   const after=await step(tick),advanced=advanceHeavyProjectiles(projectiles,0,tick);projectiles=advanced.active;
   const changed=[0,1,2].some(i=>after[i*16+P.hp]<before[i*16+P.hp]);
   assert(changed===(advanced.impacts.length>0),`${kind} damage and visible impact disagree on tick ${tick}`);
   assert(after[3*16+P.hp]===1000,'Out-of-range particle damaged');before=after;checks++;
  }
  assert(Math.abs(before[P.hp]-(1000-TOWERS[kind].damage))<.001,'Overlapping salvo damage changed');checks++;
 }
 // Reset must discard an airborne salvo, including the appended GPU queue.
 combat.reset();seed();tower.kind='rocket';frame.towers=[{tower,definition:{...TOWERS.rocket,cooldown:10}}];await step(100);combat.reset();
 const cleared=await read(combat.shotState,combat.shotState.size);assert(cleared.every(v=>v===0),'Reset retained pending rounds');checks++;
 // Boss damage obeys the same flight time.
 seed();frame.map={...frame.map,goal:{x:25,y:10}};device.queue.writeBuffer(shared.bossState,0,new Float32Array([25,10,0,0,1,1,1000,1000,0,0,1,0,1,0,0,0]));
 await step(100);assert((await read(shared.bossState,64))[6]===1000,'Boss damaged at launch');checks++;
 for(let tick=101;tick<=136;tick++)await step(tick);
 assert((await read(shared.bossState,64))[6]<1000,'Boss missed delayed salvo');checks++;
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent=`PASS: ${checks} GPU checks — launch, each impact tick, blast overlap, boss damage and reset.`;
 combat.destroy();device.destroy();
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}
