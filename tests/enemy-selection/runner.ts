import {connectGPU} from '../../src/runtime/gpu.ts';
import {createEnemySelection} from '../../src/render/enemy-selection.ts';
import {createRenderer} from '../../src/render/index.ts';
import type {RenderScene} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!,canvas=document.querySelector('canvas')!;
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
try{
 const {device,context,format,shared}=await connectGPU(canvas);
 device.addEventListener('uncapturederror',event=>{status.textContent=`FAIL: ${event.error.message}`;});device.pushErrorScope('validation');
 const camera=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const selection=await createEnemySelection(device,format,camera,shared);
 // Two visible shamblers, a runner, an offscreen shambler, a corpse and a dead slot.
 const data=new Float32Array(6*16);
 [[8,10,0,1,50,2],[14,10,0,1,50,3],[20,10,1,1,50,4],[48,10,0,1,50,5],[26,10,0,-1,0,6],[30,10,0,0,0,7]].forEach(([x,y,kind,alive,hp,generation],i)=>data.set([x,y,0,0,.5,1,hp,50,0,0,kind,alive,0,0,0,generation],i*16));
 device.queue.writeBuffer(shared.particles,0,data);
 const read=device.createBuffer({size:24,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const result=async()=>{const e=device.createCommandEncoder();selection.encode(e,6);e.copyBufferToBuffer(selection.selected,0,read,0,24);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return values;};
 selection.request({x:8,y:9.3},{x:0,y:0,width:36,height:22},.5);
 assert(JSON.stringify(await result())==='[3,4,0,0,0,0]','Matching type / viewport / corpse filtering failed');
 selection.request({x:20,y:9.3},{x:0,y:0,width:36,height:22},.5);
 assert(JSON.stringify(await result())==='[0,0,5,0,0,0]','New type must replace the previous selection');
 selection.request({x:2,y:2},{x:0,y:0,width:36,height:22},.5);
 assert((await result()).every(value=>value===0),'Empty-ground double-click retained selection');
 selection.request({x:14,y:9.3},{x:10,y:0,width:26,height:22},.5);
 assert(JSON.stringify(await result())==='[0,4,0,0,0,0]','Camera-clipped selection included offscreen enemies');
 selection.clear();assert((await result()).every(value=>value===0),'Clear retained selected enemies');
 selection.destroy();read.destroy();camera.destroy();
 const renderer=await createRenderer(device,context,format,shared,canvas);
 const scene:RenderScene={count:6,time:0,map:{id:'selection-test',width:36,height:22,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:35,y:20},goalRadius:0},towers:[],effects:[],heatmap:false,selection:null};
 canvas.addEventListener('pointerdown',()=>renderer.clearEnemySelection?.());
 canvas.addEventListener('dblclick',event=>renderer.selectEnemies?.(renderer.screenToWorld(event.clientX,event.clientY)));
 window.addEventListener('keydown',event=>{if(event.key==='Escape')renderer.clearEnemySelection?.();});
 let frame=0;const draw=()=>{const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);frame=requestAnimationFrame(draw);};draw();
 await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent='PASS: matching types, viewport bounds, dead enemies, empty clicks, replacement and clearing. Double-click to try it.';
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);renderer.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}
