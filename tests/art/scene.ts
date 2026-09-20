import {createRenderer} from '../../src/render/index.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';
const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!;
try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice(),context=canvas.getContext('webgpu')!,format=navigator.gpu.getPreferredCanvasFormat();
  device.addEventListener('uncapturederror',event=>{status.textContent=event.error.message;});
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1};
  const renderer=await createRenderer(device,context,format,shared,canvas,{turretArt:'red-alert'});
  const bridge={x:24,y:8,width:4,height:12};
  const scene:RenderScene={count:0,time:0,heatmap:false,selection:null,effects:[],map:{id:'art-room',width:64,height:36,obstacles:[{x:0,y:0,width:64,height:4},{x:0,y:0,width:4,height:36},{x:60,y:0,width:4,height:36},{x:0,y:32,width:64,height:4},{x:24,y:4,width:4,height:4},bridge,{x:24,y:20,width:16,height:4}],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:100},goalRadius:0},walls:[{...bridge,health:100,maxHealth:100}],towers:[...Array.from({length:8},(_,i)=>({id:i,kind:'autocannon' as const,x:9+(i%4)*4,y:11+Math.floor(i/4)*9,angle:i*Math.PI/4,level:1,branch:0,cooldown:0,spent:0})),{id:8,kind:'tesla',x:44,y:16,angle:0,level:1,branch:0,cooldown:0,spent:0},{id:9,kind:'incinerator',x:53,y:16,angle:0,level:1,branch:0,cooldown:0,spent:0}]};
  document.querySelector('#rotate')!.addEventListener('click',()=>{for(const t of scene.towers)t.angle+=Math.PI/4;});
  document.querySelector('#damage')!.addEventListener('click',()=>{scene.walls![0].health=scene.walls![0].health===100?20:100;});
  document.querySelector('#remove')!.addEventListener('click',()=>{const i=scene.map.obstacles.indexOf(bridge);if(i>=0){scene.map.obstacles.splice(i,1);scene.walls=[];}else{scene.map.obstacles.push(bridge);scene.walls=[{...bridge,health:100,maxHealth:100}];}});
  let active=true;function draw(){if(!active)return;const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);requestAnimationFrame(draw);}draw();
  await device.queue.onSubmittedWorkDone();status.textContent='Rendering';
  window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=String(error);}
