import {campaignMap} from '../../src/content/levels.ts';
import {createRenderer} from '../../src/render/index.ts';
import {buildNavigation} from '../../src/navigation/index.ts';
import type {Effect,RenderScene,SharedGPU} from '../../src/contracts/index.ts';
const level=Math.max(1,Math.min(3,Number(new URLSearchParams(location.search).get('level'))||1)),map=campaignMap(level),canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!;
document.querySelector('h1')!.textContent=`0${level} / ${map.scenery!.title}`;document.querySelector('#briefing')!.textContent=map.scenery!.briefing;document.querySelector<HTMLAnchorElement>('#play')!.href=`/?map=${level}`;
try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice(),format=navigator.gpu.getPreferredCanvasFormat();
  let failed=false;device.addEventListener('uncapturederror',event=>{failed=true;status.textContent=event.error.message;});
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1};
  const renderer=await createRenderer(device,canvas.getContext('webgpu')!,format,shared,canvas),field=buildNavigation(map);
  const routes:Effect[]=[];
  for(const startY of [26,50,74]){let x=1,y=startY;for(let i=0;i<550;i++){
    const at=y*field.width+x;if(!Number.isFinite(field.distances[at])||field.distances[at]<3)break;
    if(i%5===0)routes.push({x:x+.5,y:y+.5,kind:'slow',radius:.26,strength:0,damage:0,direction:{x:0,y:0},cone:0,duration:1,source:0});
    x+=field.vectors[at*2];y+=field.vectors[at*2+1];
  }}
  const scene:RenderScene={count:0,time:0,map,towers:[],effects:[],heatmap:false,selection:null};
  document.querySelector('#paths')!.addEventListener('click',()=>{scene.effects=scene.effects.length?[]:routes;});
  let active=true;function draw(time=0){if(!active)return;scene.time=time/1000;const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);requestAnimationFrame(draw);}draw();await device.queue.onSubmittedWorkDone();if(!failed)status.textContent=`Rendering · ${map.obstacles.length} authored blocking footprints · route preview available`;
  window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=String(error);}
