import {createInfantryGPU} from '../../src/infantry/gpu.ts';
import {launchInfantryProjectile,advanceInfantryProjectiles} from '../../src/infantry/projectiles.ts';
import type {Soldier} from '../../src/infantry/model.ts';
import type {SharedGPU,WorldMap,InfantryProjectile} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!;
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();device.pushErrorScope('validation');
 const shared:SharedGPU={capacity:4,particles:device.createBuffer({size:4*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),damageOwners:device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})};
 const gpu=await createInfantryGPU(device,shared);
 const map:WorldMap={id:'projectile-test',width:60,height:40,spawn:{x:0,y:0,width:1,height:1},goal:{x:58,y:20},goalRadius:1,obstacles:[]};
 const archer:Soldier={id:2,home:1,kind:'archer',x:5,y:20,health:32,quality:0,angle:0,cooldown:0,flash:0,walk:0,dead:0};
 const arrow=launchInfantryProjectile(archer,{soldier:2,target:0,generation:1,damage:10,x:20,y:20},100)!;
 let checks=0;
 const seed=(positions:{x:number;y:number}[])=>{const values=new Float32Array(64);positions.forEach((p,i)=>values.set([p.x,p.y,0,0,.5,1,100,100,0,0,0,1,0,0,0,1],i*16));device.queue.writeBuffer(shared.particles,0,values);};
 const step=async(impacts:InfantryProjectile[],soldiers:Soldier[]=[],obstacles=map.obstacles)=>{
  const hit:boolean[]=[],feedback=impacts.length?new Promise<void>(resolve=>{report=(_p,h)=>{hit.push(h);if(hit.length===impacts.length)resolve();};}):Promise.resolve();
  const e=device.createCommandEncoder(),finish=gpu.encode(e,soldiers,[],{...map,obstacles},4,false,[],1/60,{...map,obstacles},impacts,report);device.queue.submit([e.finish()]);finish?.();await feedback;
  const read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),copy=device.createCommandEncoder();copy.copyBufferToBuffer(shared.particles,0,read,0,256);device.queue.submit([copy.finish()]);await read.mapAsync(GPUMapMode.READ);const values=new Float32Array(read.getMappedRange()).slice();read.unmap();read.destroy();return {hp:[values[6],values[22],values[38]],hit};
 };
 let report:((p:InfantryProjectile,hit:boolean)=>void)|undefined;
 seed([arrow.target]);let result=await step([], [archer]);assert(result.hp[0]===100,'Arrow damaged at launch');checks++;
 assert(advanceInfantryProjectiles([arrow],100+Math.ceil(arrow.life*60)-1).impacts.length===0,'Arrow landed early');checks++;
 // Landing is resolved without a surviving shooter, and damages only one body.
 seed([arrow.target,{x:arrow.target.x+.2,y:arrow.target.y}]);result=await step([arrow]);assert(result.hp[0]===90&&result.hp[1]===100&&result.hit[0],'Arrow must hit exactly one body at landing after shooter dies');checks++;
 seed([{x:arrow.target.x+3,y:arrow.target.y}]);result=await step([arrow]);assert(result.hp[0]===100&&!result.hit[0],'Moving target must escape and produce a ground miss');checks++;
 seed([{x:arrow.target.x+.2,y:arrow.target.y}]);result=await step([arrow],[],[{x:arrow.target.x+.1,y:0,width:.05,height:40}]);assert(result.hp[0]===100&&!result.hit[0],'Arrow cannot hit through cover at its landing point');checks++;
 const rocket=launchInfantryProjectile({...archer,kind:'rocket'},{soldier:2,target:0,generation:1,damage:22,x:20,y:20},100)!;
 seed([{x:20,y:20},{x:22,y:20},{x:28,y:20}]);result=await step([rocket]);assert(result.hp[0]===78&&result.hp[1]===78&&result.hp[2]===100,'Orphaned rocket must damage only its landing blast radius');checks++;
 seed([arrow.target]);result=await step([arrow,{...arrow,serial:arrow.serial+1}]);assert(result.hp[0]===80&&result.hit.every(Boolean),'Overlapping arrows must each apply damage once');checks++;
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent=`PASS: ${checks} GPU checks — no launch damage, landing hits, moving-target misses, cover, dead shooters, rocket splash, overlapping arrows.`;
 gpu.destroy();device.destroy();
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}
