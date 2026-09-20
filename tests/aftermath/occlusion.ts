import {connectGPU} from '../../src/runtime/gpu.ts';
import {createRenderer} from '../../src/render/index.ts';
import {AFTERMATH_BYTES,AFTERMATH_HEADER_BYTES} from '../../src/effects/aftermath.ts';
import type {RenderScene} from '../../src/contracts/index.ts';

const status=document.querySelector('#status')!;
try{
 const canvas=document.querySelector('canvas')!,gpu=await connectGPU(canvas),{device,shared}=gpu;
 device.pushErrorScope('validation');device.addEventListener('uncapturederror',e=>{status.textContent=`FAIL: ${e.error.message}`;});
 shared.aftermath=device.createBuffer({size:AFTERMATH_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 // Keep the production renderer; only enable framebuffer readback in this fixture.
 const context={configure(config:GPUCanvasConfiguration){gpu.context.configure({...config,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});},getCurrentTexture(){return gpu.context.getCurrentTexture();}} as GPUCanvasContext;
 const renderer=await createRenderer(device,context,gpu.format,shared,canvas);
 const scene:RenderScene={count:0,time:1,map:{id:'occlusion',width:48,height:30,obstacles:[{x:30,y:10,width:4,height:12}],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:100},goalRadius:0},towers:[{id:1,kind:'autocannon',x:14,y:16,angle:0,level:0,branch:-1,cooldown:0,spent:0}],effects:[],heatmap:false,selection:null};
 function seed(cause:number){
  const events=new Float32Array(AFTERMATH_BYTES/4);let i=0;
  for(const cx of [14,32])for(let y=11;y<=20;y+=.65)for(let x=cx-4;x<=cx+4;x+=.65){
   events.set([x,y,.65,2,1,0,0,cause,1,i*.73,100,1],AFTERMATH_HEADER_BYTES/4+i++*12);
  }
  device.queue.writeBuffer(shared.aftermath!,0,events);
 }
 async function capture(visible:boolean){
  scene.aftermathVisible=visible;const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);
  const stride=Math.ceil(canvas.width*4/256)*256,copy=device.createBuffer({size:stride*canvas.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  encoder.copyTextureToBuffer({texture:context.getCurrentTexture()},{buffer:copy,bytesPerRow:stride},{width:canvas.width,height:canvas.height});device.queue.submit([encoder.finish()]);
  await copy.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(copy.getMappedRange()).slice();copy.unmap();copy.destroy();return {bytes,stride};
 }
 function pixel(x:number,y:number,stride:number){const p=renderer.worldToScreen(x,y),bounds=canvas.getBoundingClientRect();return Math.floor((p.y-bounds.top)*canvas.height/bounds.height)*stride+Math.floor((p.x-bounds.left)*canvas.width/bounds.width)*4;}
 let checks=0;
 // After the short foreground hit spray, fragments are still airborne at 400ms.
 for(const cause of [0,1])for(const age of [.4,2]){
  seed(cause);scene.time=1+age;const baseline=await capture(false),debris=await capture(true);
  for(const [name,x,y] of [['wall',32,16],['turret',14,16]] as const){
   const offset=pixel(x,y,baseline.stride);for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++)for(let c=0;c<3;c++){
    const j=offset+row*baseline.stride+col*4+c;if(baseline.bytes[j]!==debris.bytes[j])throw Error(`${name} covered by cause ${cause} at ${age}s`);
   }checks++;
  }
  let changed=0;for(let i=0;i<baseline.bytes.length;i+=4)if(baseline.bytes[i]!==debris.bytes[i])changed++;
  if(changed<100)throw Error('Debris disappeared instead of drawing below defenses');checks++;
 }
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent=`PASS: ${checks} pixel checks · wall and turret unchanged during flight, landing, and corpse collapse; debris still visible on the floor.`;
 seed(1);let start=performance.now(),raf=0;document.querySelector('#replay')!.addEventListener('click',()=>{start=performance.now();});
 function draw(){scene.time=1+Math.min(8,(performance.now()-start)/1000);scene.aftermathVisible=true;const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);raf=requestAnimationFrame(draw);}draw();
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer.destroy();shared.aftermath?.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}
