import {createRenderer} from '../../src/render/index.ts';
import {INFANTRY,infantryStats,freshInfantry,type InfantryKind} from '../../src/infantry/model.ts';
import {COUNTER_WORDS,type RenderScene,type SharedGPU} from '../../src/contracts/index.ts';
const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
 const device=await adapter.requestDevice(),context=canvas.getContext('webgpu')!,format=navigator.gpu.getPreferredCanvasFormat();
 const errors:string[]=[];device.addEventListener('uncapturederror',e=>{if(!errors.length){errors.push(e.error.message);status.textContent=errors[0];}});
 const shared:SharedGPU={capacity:1,particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE})};
 const renderer=await createRenderer(device,context,format,shared,canvas),infantry=freshInfantry();
 for(const [row,kind] of (['rifle','rocket','flame','dog'] as InfantryKind[]).entries()){
  infantry.buildings.push({id:infantry.nextId++,kind,x:8,y:8+row*8,rally:{x:15,y:8+row*8},production:0,training:0,progress:0,spent:INFANTRY[kind].cost});
  for(let i=0;i<10;i++)infantry.soldiers.push({id:infantry.nextId++,home:infantry.buildings.at(-1)!.id,kind,x:18+i*5,y:8+row*8,quality:0,health:i===9?0:infantryStats(kind).health,cooldown:0,angle:i*Math.PI/4,flash:0,walk:0,dead:0,moving:true});
 }
 const add=(count:number)=>{for(let i=0;i<count;i++)infantry.soldiers.push({id:infantry.nextId++,home:1,kind:i%4===0?'dog':'rifle',x:5+((i*1.37)%62),y:39+((i*.73)%10),quality:0,health:40,cooldown:0,angle:Math.PI,flash:0,walk:0,dead:0,moving:true});};
 const positions=new Map<number,number>();
 add(256);let attack=false;document.querySelector('#motion')!.addEventListener('click',()=>{attack=!attack;});document.querySelector('#mass')!.addEventListener('click',()=>add(1000));
 const scene:RenderScene={count:0,time:0,heatmap:false,selection:null,effects:[],towers:[],infantry,map:{id:'infantry-art',width:72,height:54,obstacles:[],spawn:{x:0,y:0,width:1,height:1},goal:{x:70,y:52},goalRadius:0}};
 let active=true,last=performance.now(),total=0,frames=0;
 function draw(now:number){if(!active)return;const dt=(now-last)/1000;last=now;scene.time+=Math.min(.05,dt);for(const s of infantry.soldiers){if(!positions.has(s.id))positions.set(s.id,s.x);s.x=positions.get(s.id)!+(attack?0:Math.sin(scene.time*2)*.65);s.walk+=dt*10;s.moving=!attack;const cadence=infantryStats(s.kind).cooldown,age=scene.time%cadence;s.cooldown=attack?cadence-age:0;s.flash=attack?Math.max(0,.1-age):0;if(s.health<=0)s.dead=scene.time%2.9;}
  const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);total+=dt;frames++;
  if(total>.5){if(!errors.length)status.textContent=infantry.soldiers.length+' troops · '+Math.round(frames/total)+' FPS · no GPU errors';total=0;frames=0;}
  requestAnimationFrame(draw);
 }requestAnimationFrame(draw);
 window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=String(error);}
