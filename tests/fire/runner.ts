import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {createRenderer} from '../../src/render/index.ts';
import {DEFAULT_TUNING,P,type RenderScene,type Tower} from '../../src/contracts/index.ts';
import {TOWERS} from '../../src/content/index.ts';

const status=document.querySelector('#status')!;
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
try{
 const canvas=document.querySelector('canvas')!,gpu=await connectGPU(canvas),{device,shared}=gpu;
 device.addEventListener('uncapturederror',event=>{status.textContent='FAIL: '+event.error.message;});
 device.pushErrorScope('validation');
 const combat=await createCombat(device,shared);shared.shotState=combat.shotState;
 const tower:Tower={id:1,kind:'incinerator',x:6,y:9,angle:0,level:0,branch:-1,cooldown:0,spent:0};
 const map={id:'fire-lab',width:36,height:22,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:40,y:9},goalRadius:0};
 const frame:CombatFrame={dt:1/60,tick:60,count:4,map,effects:[],tuning:DEFAULT_TUNING,lab:true,towers:[{tower,definition:TOWERS.incinerator}]};
 const seed=new Float32Array(4*16);
 [[14,9],[17,10],[28,9],[13,19]].forEach(([x,y],i)=>seed.set([x,y,1,0,.42,1,50,50,0,0,i,1,0,0,0,1],i*16));
 const read=async(buffer:GPUBuffer,size:number)=>{
  const copy=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),encoder=device.createCommandEncoder();
  encoder.copyBufferToBuffer(buffer,0,copy,0,size);device.queue.submit([encoder.finish()]);await copy.mapAsync(GPUMapMode.READ);
  const result=new Float32Array(copy.getMappedRange()).slice();copy.unmap();copy.destroy();return result;
 };
 const step=()=>{const e=device.createCommandEncoder();combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);frame.tick++;};
 device.queue.writeBuffer(shared.particles,0,seed);step();
 let heat=await read(shared.heatState!,64);
 assert(heat[0]>1&&heat[4]>1,'In-cone enemies did not ignite');
 assert(heat[8]===0&&heat[12]===0,'Out-of-range or out-of-cone enemies ignited');
 frame.towers=[];step();
 let particles=await read(shared.particles,256);
 assert(particles[P.hp]<50,'Burn did not deal damage over time');
 assert(Math.hypot(particles[P.vx]-1,particles[P.vy])>.01,'Burning enemy did not panic');
 const replacement=seed.slice(0,16);replacement[P.generation]=2;
 device.queue.writeBuffer(shared.particles,0,replacement);step();
 particles=await read(shared.particles,256);heat=await read(shared.heatState!,64);
 assert(particles[P.hp]===50&&heat[0]===0,'Recycled enemy inherited old burn');
 frame.dt=0;const before=particles[16+P.hp];step();particles=await read(shared.particles,256);
 assert(particles[16+P.hp]===before,'Paused burn changed health');
 // Verify panic goes through real physics, including obstacle collision.
 frame.dt=1/60;frame.count=1;frame.map={...map,obstacles:[{x:16,y:0,width:2,height:22}]};
 const physics=await createPhysics(device,shared);
 device.queue.writeBuffer(shared.particles,0,new Float32Array([14,9,3,0,.42,1,50,50,0,0,0,1,0,0,0,3]));
 device.queue.writeBuffer(shared.heatState!,0,new Float32Array([1.5,1,3,61]));
 for(let tick=0;tick<45;tick++){
  const e=device.createCommandEncoder();combat.encodeBefore(e,frame);physics.encode(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);frame.tick++;
 }
 particles=await read(shared.particles,64);
 assert(particles.every(Number.isFinite),'Panic physics produced non-finite state');
 assert(particles[P.x]>14&&particles[P.x]<16,'Panic did not move or crossed a solid wall');
 physics.destroy();
 combat.reset();heat=await read(shared.heatState!,64);assert(heat.every(v=>v===0),'Reset retained burn state');
 const renderer=await createRenderer(device,gpu.context,gpu.format,shared,canvas);
 const scene:RenderScene={count:8,time:1,map,towers:[tower],effects:[],heatmap:false,selection:null};
 const demo=new Float32Array(8*16),burns=new Float32Array(8*4);
 const start=performance.now();let raf=0;
 const draw=()=>{
  const selected=(document.querySelector('#playback') as HTMLSelectElement).value;
  const age=selected==='loop'?((performance.now()-start)/1000)%1.65:Number(selected);
  scene.time=1+age;
  for(let i=0;i<8;i++){
   const x=14+(i%4)*4+Math.sin(age*4+i)*.65,y=9+Math.floor(i/4)*8+Math.cos(age*5+i)*.45;
   demo.set([x,y,2+Math.cos(age*4+i),Math.sin(age*5+i),.42,1,35,50,0,0,[0,1,2,4][i%4],1,0,0,0,1],i*16);
   burns.set([Math.max(0,1.5-age),8,1,61],i*4);
  }
  device.queue.writeBuffer(shared.particles,0,demo);device.queue.writeBuffer(shared.heatState!,0,burns);
  device.queue.writeBuffer(combat.shotState,0,new Float32Array([Math.max(0,.55-age),.55,20,9,1,0,1,0,1,1,0,0]));
  const e=device.createCommandEncoder();renderer.encode(e,scene);device.queue.submit([e.finish()]);raf=requestAnimationFrame(draw);
 };
 draw();await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent='PASS: ignition cone, burn damage, panic motion, recycled generations, pause, wall collision, reset, and GPU rendering.';
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer.destroy();combat.destroy();device.destroy();});
}catch(error){status.textContent='FAIL: '+String(error);console.error(error);}
