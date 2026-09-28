import {createRenderer} from '../../src/render/index.ts';
import {createHeavyProjectiles} from '../../src/effects/heavy-weapons.ts';
import {launchInfantryProjectile,groundedArrow} from '../../src/infantry/projectiles.ts';
import type {Soldier} from '../../src/infantry/model.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';
const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!,slider=document.querySelector<HTMLInputElement>('#progress')!,play=document.querySelector<HTMLButtonElement>('#play')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();device.addEventListener('uncapturederror',e=>{status.textContent='FAIL '+e.error.message;});
 const shared:SharedGPU={capacity:1,particles:device.createBuffer({size:64,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE})};
 const renderer=await createRenderer(device,canvas.getContext('webgpu')!,navigator.gpu.getPreferredCanvasFormat(),shared,canvas);
 const soldiers:Soldier[]=Array.from({length:5},(_,i)=>({id:i+1,home:1,kind:'archer',x:8,y:12+i*.85,health:32,quality:0,angle:0,cooldown:0,flash:0,walk:0,dead:0}));
 const arrows=soldiers.map(s=>launchInfantryProjectile(s,{soldier:s.id,target:0,generation:1,damage:10,x:38,y:s.y},100)!);
 const mortars=createHeavyProjectiles('mortar',[{x:8,y:25}],{x:38,y:25},1),rockets=createHeavyProjectiles('rocket',[{x:8,y:36}],{x:38,y:36},2);
 const scene:RenderScene={map:{id:'projectile-preview',width:48,height:44,spawn:{x:0,y:0,width:1,height:1},goal:{x:46,y:42},goalRadius:1,obstacles:[]},towers:[],count:0,time:0,effects:[],heatmap:false,selection:null,infantry:{nextId:6,buildings:[],soldiers}};
 let running=false,active=true,time=0;play.onclick=()=>{running=!running;play.textContent=running?'Pause':'Play';};slider.oninput=()=>{running=false;play.textContent='Play';};
 function draw(){if(!active)return;time+=1/60;if(running)slider.value=String((Number(slider.value)+.4)%101);const t=Number(slider.value)/100;scene.time=time;
  scene.infantryArrows=t<1?arrows.map(p=>({...p,age:p.life*t})):[];scene.groundedArrows=t===1?arrows.map(groundedArrow):[];
  scene.heavyProjectiles=t<1?[...mortars,...rockets].map(p=>({...p,age:p.delay+p.flight*t})):[];
  scene.heavyExplosions=t===1?[...mortars,...rockets].map(p=>({...p.target,kind:p.kind,age:.15,life:1.4,scale:.8,direction:{x:1,y:0},serial:p.serial})):[];
  const e=device.createCommandEncoder();renderer.encode(e,scene);device.queue.submit([e.finish()]);requestAnimationFrame(draw);
 }draw();await device.queue.onSubmittedWorkDone();status.textContent='READY — actual game renderer; no saved games modified.';
 window.addEventListener('pagehide',()=>{active=false;renderer.destroy();device.destroy();});
}catch(error){status.textContent='FAIL '+String(error);console.error(error);}
