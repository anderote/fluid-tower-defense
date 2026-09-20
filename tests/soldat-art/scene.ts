import {createRenderer} from '../../src/render/index.ts';
import {SOLDAT_KINDS,SOLDAT_UPGRADE_LEVELS} from '../../src/render/soldat-art.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';

const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!;
try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice();
  device.addEventListener('uncapturederror',event=>{status.textContent=`FAIL: ${event.error.message}`;});
  device.pushErrorScope('validation');
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1};
  const renderer=await createRenderer(device,canvas.getContext('webgpu')!,navigator.gpu.getPreferredCanvasFormat(),shared,canvas);
  const scene:RenderScene={count:0,time:0,heatmap:false,selection:null,effects:[],map:{id:'turret-upgrades',width:96,height:54,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:200,y:200},goalRadius:0},towers:SOLDAT_UPGRADE_LEVELS.flatMap((level,row)=>SOLDAT_KINDS.map((kind,col)=>({id:row*8+col+1,kind,level,branch:level?0:-1,x:7+col*11.7,y:6+row*10.4,angle:0,cooldown:0,spent:0})))};
  const draw=()=>{const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);};
  const checkedDraw=async()=>{device.pushErrorScope('validation');draw();await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();status.textContent=error?`FAIL: ${error.message}`:'PASS: all 40 turrets rendered; live facing and upgrade changes validated.';};
  document.querySelector('#rotate')!.addEventListener('click',()=>{scene.towers.forEach(t=>t.angle+=Math.PI/4);void checkedDraw();});
  document.querySelector('#upgrade')!.addEventListener('click',()=>{scene.towers.forEach(t=>t.level=SOLDAT_UPGRADE_LEVELS[(SOLDAT_UPGRADE_LEVELS.indexOf(t.level as typeof SOLDAT_UPGRADE_LEVELS[number])+1)%5]);void checkedDraw();});
  draw();await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
  status.textContent='PASS: all 40 turrets rendered with the production WebGPU renderer.';
  window.addEventListener('pagehide',()=>{renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;}
