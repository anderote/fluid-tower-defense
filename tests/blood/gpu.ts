import {createAftermathEvents,AFTERMATH_BATCH} from '../../src/effects/aftermath.ts';
import {createBloodRenderer} from '../../src/render/blood.ts';
import {TESLA_HEADER_BYTES,TESLA_PARTICLE_BYTES} from '../../src/effects/tesla.ts';
import type {SharedGPU,RenderScene} from '../../src/contracts/index.ts';
const out=document.querySelector('#results')!,assert=(ok:boolean,name:string)=>{if(!ok)throw Error(name);out.textContent+='\nPASS '+name;};
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}}),errors:string[]=[];
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const buffer=(size:number)=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
 const count=700,shared:SharedGPU={capacity:count,particles:buffer(count*64),counters:buffer(512)};
 const uniforms=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const events=await createAftermathEvents(device,shared,{uniforms,towers:buffer(48),states:buffer(48),owners:buffer(count*4),effects:buffer(48),tesla:buffer(TESLA_HEADER_BYTES+count*TESLA_PARTICLE_BYTES)});
 const camera=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const canvas=document.querySelector('canvas')!,context=canvas.getContext('webgpu')!,format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format});
 const blood=await createBloodRenderer(device,format,camera,shared);
 const wall={x:20,y:8,width:3,height:22,health:100,maxHealth:100};
 const scene:RenderScene={time:1,count:0,map:{id:'blood-check',width:45,height:35,spawn:{x:0,y:0,width:2,height:4},goal:{x:40,y:17},goalRadius:2,obstacles:[wall]},towers:[],effects:[],walls:[wall],heatmap:false,selection:null};
 const setTime=(t:number)=>{scene.time=t;device.queue.writeBuffer(camera,0,new Float32Array([900,550,0,0,22.5,17.5,45,35,t,0,0,0,0,0,0,0]));};
 // Renderer camera.world.xy is the view origin, not its center.
 const render=(t:number)=>{setTime(t);device.queue.writeBuffer(camera,16,new Float32Array([0,0,45,35]));const e=device.createCommandEncoder();blood.prepare(e,scene);const pass=e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.16,g:.2,b:.14,a:1},loadOp:'clear',storeOp:'store'}]});blood.ground(pass);blood.walls(pass);blood.spray(pass);pass.end();device.queue.submit([e.finish()]);};
 async function read(b:GPUBuffer,offset:number,size:number){const staging=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyBufferToBuffer(b,offset,staging,0,size);device.queue.submit([e.finish()]);await staging.mapAsync(GPUMapMode.READ);const data=staging.getMappedRange().slice(0);staging.unmap();staging.destroy();return data;}
 render(1);
 const alive=new Float32Array(count*16),dead=new Float32Array(count*16);
 for(let i=0;i<count;i++){alive.set([19.6,10+(i%18),1,0,.5,1,20,20,1,20,0,1,0,0,0,1],i*16);}
 dead.set(alive);for(let i=0;i<count;i++){dead[i*16+6]=0;dead[i*16+11]=-1;}
 device.queue.writeBuffer(shared.particles,0,alive);
 device.queue.writeBuffer(uniforms,0,new Float32Array([1/60,60,count,0,40,17,2,0,0,0,0,0,0,0,0,0]));
 const deathData=buffer(dead.byteLength);device.queue.writeBuffer(deathData,0,dead);
 const e=device.createCommandEncoder();events.before(e,count);e.copyBufferToBuffer(deathData,0,shared.particles,0,dead.byteLength);events.after(e,count);device.queue.submit([e.finish()]);
 const heads=new Uint32Array(await read(shared.aftermath!,0,32));
 assert(heads[2]===AFTERMATH_BATCH,'visual event budget caps a simultaneous burst');
 const kills=new Uint32Array(await read(shared.bloodWalls!,32,16));
 assert(kills.reduce((a,b)=>a+b,0)===700,'all 700 wall crush assists count despite the 512-event visual cap');
 render(2);const first=new Uint32Array(await read(blood.storage.cells,0,blood.storage.cells.size));
 assert(first.some((v,i)=>i%2===0&&v>0),'GPU droplets deposit persistent pools');
 const splashCounts=new Uint32Array(await read(shared.bloodWalls!,48,16));assert(splashCounts.reduce((a,b)=>a+b,0)>5600,'wall impacts accumulate additional GPU blood splashes even with zero-direction pressure deaths');
 render(2.1);const second=new Uint32Array(await read(blood.storage.cells,0,blood.storage.cells.size));
 assert(first.every((v,i)=>i%2===1||v===second[i]),'repeated render frames do not duplicate landed droplets');
 events.reset();render(2.15);const retained=new Uint32Array(await read(blood.storage.cells,0,blood.storage.cells.size));assert(second.every((v,i)=>i%2===1||v===retained[i]),'blood pools survive event-ring clearing between waves');
 scene.map={...scene.map,obstacles:[]};scene.walls=[];render(2.2);
 assert(new Uint32Array(await read(shared.bloodWalls!,64,16))[0]===0,'demolished walls stop colliding with droplets');
 assert(new Uint32Array(await read(shared.bloodWalls!,32,16))[0]===700,'demolition preserves wall blood history');
 blood.reset();render(2.3);
 assert(new Uint32Array(await read(shared.bloodWalls!,0,16))[0]===0,'battlefield reset clears wall history');
 assert(errors.length===0,'no WebGPU validation errors');
 out.textContent+='\nALL CHECKS PASSED';
 // Repeatable visual review using the exact production shaders.
 const preview=document.createElement('button');preview.textContent='Replay explosion droplets';out.after(preview);
 let previewTime=0,previousTime=0;
 const replay=()=>{blood.reset();events.reset();scene.map={...scene.map,obstacles:[wall]};scene.walls=[wall];previewTime=0;previousTime=0;
  const records=new Float32Array(12*5);for(let i=0;i<5;i++)records.set([10+i*1.5,13+i*3,.8,0,1,0,0,i===0?0:1,0,3+i*7,25,1],i*12);
  device.queue.writeBuffer(shared.aftermath!,32,records);
 };preview.onclick=replay;replay();
 const animate=(now:number)=>{if(previousTime)previewTime+=Math.min(.05,(now-previousTime)/1000);previousTime=now;render(previewTime);requestAnimationFrame(animate);};requestAnimationFrame(animate);
}catch(error){out.textContent+='\nFAIL '+String(error);console.error(error);}
