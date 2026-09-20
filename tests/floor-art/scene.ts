import {createRenderer} from '../../src/render/index.ts';
import type {RenderScene,Renderer,SharedGPU,TowerKind} from '../../src/contracts/index.ts';
import type {FloorArtStyle} from '../../src/render/red-alert.ts';
const status=document.querySelector('#status')!;
try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice(),format=navigator.gpu.getPreferredCanvasFormat();
  let gpuError=false;device.addEventListener('uncapturederror',event=>{gpuError=true;status.textContent=event.error.message;});
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1};
  const renderers:Renderer[]=[];
  for(const style of ['panels','grating'] as FloorArtStyle[]){
    const canvas=document.querySelector<HTMLCanvasElement>(`#${style}`)!;
    renderers.push(await createRenderer(device,canvas.getContext('webgpu')!,format,shared,canvas,{floorArt:style}));
  }
  const wires=[...[8,12,16,20].map(x=>({x,y:28,width:4,height:4,health:100,maxHealth:100,breached:false})),{x:20,y:32,width:4,height:4,health:100,maxHealth:100,breached:false},...[36,40,44,48].map((x,i)=>({x,y:28,width:4,height:4,health:[100,55,0,20][i],maxHealth:100,breached:i===2}))];
  const kinds:TowerKind[]=['autocannon','mortar','tesla','rocket','railgun','incinerator'];
  const scene:RenderScene={count:0,time:0,heatmap:false,selection:null,effects:[],wires,towers:kinds.map((kind,i)=>({id:i,kind,x:10+i*8,y:11,angle:-Math.PI/4,level:1,branch:0,cooldown:0,spent:0})),map:{id:'floor-study',width:64,height:44,obstacles:[{x:0,y:0,width:64,height:4},{x:0,y:0,width:4,height:44},{x:60,y:0,width:4,height:44},{x:0,y:40,width:64,height:4},{x:4,y:18,width:20,height:4},{x:32,y:18,width:28,height:4},...wires.filter(w=>!w.breached)],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:100},goalRadius:0}};
  let closeUp=true;document.querySelector('#scale')!.addEventListener('click',()=>{closeUp=!closeUp;scene.map.width=closeUp?64:100;scene.map.height=closeUp?44:68.75;});
  document.querySelector('#rotate')!.addEventListener('click',()=>{for(const tower of scene.towers)tower.angle+=Math.PI/4;});
  let active=true;function draw(time=0){if(!active)return;scene.time=time/1000;const encoder=device.createCommandEncoder();for(const renderer of renderers)renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);requestAnimationFrame(draw);}draw();
  await device.queue.onSubmittedWorkDone();if(!gpuError)status.textContent='Rendering both original floors · no gameplay or default changes';
  window.addEventListener('pagehide',()=>{active=false;for(const renderer of renderers)renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=String(error);}
