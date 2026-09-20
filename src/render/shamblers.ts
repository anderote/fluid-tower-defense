import {PARTICLE_WGSL,type RenderScene,type SharedGPU} from '../contracts/index.ts';
import {createShamblerAtlas,SHAMBLER_PIVOT} from './shambler-art.ts';
import {SHAMBLER_ANIMATION_WGSL,SHAMBLER_STATE_BYTES,SHAMBLER_STATE_WGSL} from './shambler-animation.ts';

export async function createShamblers(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,shared:SharedGPU){
  const atlas=createShamblerAtlas();
  const texture=device.createTexture({label:'Original shambler sprite sheet',size:[atlas.width,atlas.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:atlas},{texture},[atlas.width,atlas.height]);
  const state=device.createBuffer({label:'Shambler visual state',size:shared.capacity*SHAMBLER_STATE_BYTES,usage:GPUBufferUsage.STORAGE});
  const clock=device.createBuffer({label:'Shambler animation clock',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const update=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({label:'Shambler animation',code:SHAMBLER_ANIMATION_WGSL}),entryPoint:'update'}});
  const updateBindings=device.createBindGroup({layout:update.getBindGroupLayout(0),entries:[shared.particles,state,clock].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const shader=device.createShaderModule({label:'Shambler sprites',code:`${PARTICLE_WGSL}${SHAMBLER_STATE_WGSL}
struct Camera { viewport:vec4<f32>, world:vec4<f32>, time:vec4<f32> };
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> animation:array<Animation>;
@group(0) @binding(3) var atlas:texture_2d<f32>;
struct Out { @builtin(position) pos:vec4<f32>, @location(0) uv:vec2<f32>, @location(1) tint:vec4<f32>, @location(2) pressure:f32 };
fn clip(p:vec2<f32>)->vec2<f32>{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let worldAspect=camera.world.z/camera.world.w;return vec2((((p.x-camera.world.x)/camera.world.z)*2.-1.)*min(1.,worldAspect/aspect),(1.-((p.y-camera.world.y)/camera.world.w)*2.)*min(1.,aspect/worldAspect));}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let corners=array<vec2<f32>,6>(vec2(0.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(1.,0.),vec2(1.,1.));
 let q=corners[vi];let p=particles[i];let a=animation[i];var o:Out;o.pos=vec4(2.,2.,0.,1.);o.tint=vec4(0.);o.uv=vec2(0.);o.pressure=0.;
 let dead=p.state.w<-.5;let deathAge=max(0.,camera.time.x+p.body.w/60.);
 if(p.state.z>.5||abs(p.state.w)<.5||(dead&&deathAge>4.)){return o;}
 let facing=f32((i32(round(a.pose.x/0.7853981634))+16)%8);
 var frame=0.;if(a.pose.w>.5){frame=1.+floor(a.pose.y*8.);}if(a.pose.w>1.5){frame=9.;}
 if(dead){frame=10.+floor(min(5.,deathAge/.09));}
 // A 32-pixel tile covers 2.64 world units; the feet keep the collision pivot.
 let size=p.body.x*6.4;let offset=(q-vec2(${SHAMBLER_PIVOT.x/32},${SHAMBLER_PIVOT.y/32}))*size;
 // Constant depth across each cutout sorts by feet, independent of slot order.
 let depth=clamp(.95-(p.pos.y-camera.world.y)/camera.world.w*.8,.01,.99);
 o.pos=vec4(clip(p.pos.xy+offset),select(depth,.995,dead),1.);
 o.uv=(vec2(frame,facing)+q)*32.;
 let variation=.88+fract(f32(i)*.381966)*.18;let hp=select(clamp(p.body.z/max(.001,p.body.w),0.,1.),.5,dead);
 o.tint=vec4(vec3(variation*(.7+.3*hp)),select(1.,1.-smoothstep(2.5,4.,deathAge),dead));
 o.pressure=select(0.,clamp(log2(1.+max(0.,p.state.y))/7.,0.,1.),camera.time.y>.5&&!dead);return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{
 let texel=textureLoad(atlas,vec2<i32>(floor(i.uv)),0);if(texel.a<.5||i.tint.a<.01){discard;}
 var color=texel.rgb*i.tint.rgb;
 if(i.pressure>.001){let warm=mix(vec3(.02,.88,1.),vec3(1.,.9,.08),clamp(i.pressure*2.,0.,1.));let hot=mix(vec3(1.,.3,.015),vec3(.92,.015,.08),clamp((i.pressure-.8)*5.,0.,1.));color=mix(color,mix(warm,hot,smoothstep(.5,.8,i.pressure)),.35+.55*i.pressure);}
 return vec4(color,i.tint.a);
}`});
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shader,entryPoint:'vs'},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'}});
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:{buffer:shared.particles}},{binding:2,resource:{buffer:state}},{binding:3,resource:texture.createView()}]});
  let depth:GPUTexture|undefined,width=0,height=0,lastTime=-1;
  return {
    prepare(encoder:GPUCommandEncoder,scene:RenderScene){
      const reset=lastTime<0||scene.time<lastTime;const dt=reset?0:Math.min(.1,scene.time-lastTime);lastTime=scene.time;
      device.queue.writeBuffer(clock,0,new Float32Array([scene.time,dt,Math.min(scene.count,shared.capacity),reset?1:0]));
      if(!scene.count){lastTime=-1;return;}
      const pass=encoder.beginComputePass({label:'Animate shamblers'});pass.setPipeline(update);pass.setBindGroup(0,updateBindings);pass.dispatchWorkgroups(Math.ceil(Math.min(scene.count,shared.capacity)/128));pass.end();
    },
    draw(encoder:GPUCommandEncoder,target:GPUTextureView,w:number,h:number,count:number){
      if(!count)return;
      if(w!==width||h!==height){depth?.destroy();width=w;height=h;depth=device.createTexture({label:'Shambler overlap depth',size:[w,h],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});}
      const pass=encoder.beginRenderPass({label:'Shambler sprites',colorAttachments:[{view:target,loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:depth!.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
      pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.draw(6,Math.min(count,shared.capacity));pass.end();
    },
    destroy(){texture.destroy();state.destroy();clock.destroy();depth?.destroy();}
  };
}
