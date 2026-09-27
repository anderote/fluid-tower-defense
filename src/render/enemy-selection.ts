import {PARTICLE_WGSL,type Rect,type SharedGPU,type Vec2} from '../contracts/index.ts';

/** Selection is a snapshot of visible individuals, keyed by spawn generation. */
export async function createEnemySelection(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,shared:SharedGPU){
 const selected=device.createBuffer({label:'Selected enemy generations',size:shared.capacity*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
 const picked=device.createBuffer({label:'Nearest clicked enemy',size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const query=device.createBuffer({label:'Enemy selection query',size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const module=device.createShaderModule({label:'Visible enemy type selection',code:`${PARTICLE_WGSL}
struct Query {point:vec4f,view:vec4f,limits:vec4u};
@group(0) @binding(0) var<storage,read> particles:array<Particle>;
@group(0) @binding(1) var<storage,read_write> selected:array<f32>;
@group(0) @binding(2) var<storage,read_write> picked:atomic<u32>;
@group(0) @binding(3) var<uniform> query:Query;
fn visible(p:Particle)->bool{
 return p.state.w>.5&&p.body.z>0.&&p.pos.x>=query.view.x&&p.pos.y>=query.view.y&&p.pos.x<=query.view.z&&p.pos.y<=query.view.w;
}
@compute @workgroup_size(128) fn pick(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=query.limits.x){return;}let p=particles[i];if(!visible(p)){return;}
 // Match the raised sprite body, while accepting clicks at its feet as well.
 let center=p.pos.xy-vec2(0.,p.body.x*1.5);
 let delta=query.point.xy-center;
 let radius=max(query.point.z,p.body.x*1.8);
 let score=length(delta/vec2(radius,radius*1.35));
 if(score>1.){return;}
 // Distance occupies the high 16 bits; slot breaks ties deterministically.
 atomicMin(&picked,(u32(score*65534.)<<16u)|i);
}
@compute @workgroup_size(128) fn selectType(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=query.limits.x){return;}let hit=atomicLoad(&picked);if(hit==0xffffffffu){return;}
 let p=particles[i];let clicked=particles[hit&65535u];
 if(visible(p)&&round(p.state.z)==round(clicked.state.z)){selected[i]=p.status.w+1.;}
}
`});
 const diagnostics=await module.getCompilationInfo();
 const errors=diagnostics.messages.filter(message=>message.type==='error');
 if(errors.length)throw Error(errors.map(message=>`${message.lineNum}: ${message.message}`).join('\n'));
 const layout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
  {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
 ]});
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
 const [pick,selectType]=await Promise.all(['pick','selectType'].map(entryPoint=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
 const bind=device.createBindGroup({layout,entries:[shared.particles,selected,picked,query].map((buffer,binding)=>({binding,resource:{buffer}}))});
 const renderModule=device.createShaderModule({label:'Enemy selection brackets',code:`${PARTICLE_WGSL}
struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> selected:array<f32>;
struct Out {@builtin(position) position:vec4f,@location(0) local:vec2f};
fn clip(p:vec2f)->vec2f{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let ratio=camera.world.z/camera.world.w;return vec2((2.*(p.x-camera.world.x)/camera.world.z-1.)*min(1.,ratio/aspect),(1.-2.*(p.y-camera.world.y)/camera.world.w)*min(1.,aspect/ratio));}
@vertex fn vs(@builtin(vertex_index) vertex:u32,@builtin(instance_index) i:u32)->Out{
 let corners=array<vec2f,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
 let p=particles[i];var out:Out;out.local=corners[vertex];
 if(selected[i]==0.||selected[i]!=p.status.w+1.||p.state.w<.5||p.body.z<=0.){out.position=vec4(2.,2.,0.,1.);return out;}
 let radius=max(.45,p.body.x*1.65);let center=p.pos.xy-vec2(0.,radius*.85);
 out.position=vec4(clip(center+out.local*vec2(radius,radius*1.8)),0.,1.);return out;
}
@fragment fn fs(input:Out)->@location(0) vec4f{
 let edge=abs(input.local);let thickness=max(fwidth(input.local)*1.5,vec2(.025));
 let horizontal=edge.y>1.-thickness.y&&edge.x>.52;let vertical=edge.x>1.-thickness.x&&edge.y>.62;
 if(!horizontal&&!vertical){discard;}return vec4(1.,.36,.2,.95);
}
`});
 const render=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:renderModule,entryPoint:'vs'},fragment:{module:renderModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
 const renderBind=device.createBindGroup({layout:render.getBindGroupLayout(0),entries:[camera,shared.particles,selected].map((buffer,binding)=>({binding,resource:{buffer}}))});
 let pending:{point:Vec2;view:Rect;tolerance:number}|undefined,clear=false,active=false;
 return {
  selected,
  request(point:Vec2,view:Rect,tolerance:number){pending={point,view,tolerance};active=true;},
  clear(){pending=undefined;clear=true;active=false;},
  encode(encoder:GPUCommandEncoder,count:number){
   if(clear||pending){encoder.clearBuffer(selected);clear=false;}
   if(!pending)return;const {point,view,tolerance}=pending;pending=undefined;
   const limit=Math.min(count,shared.capacity,65536);if(!limit)return;
   const data=new ArrayBuffer(48);new Float32Array(data).set([point.x,point.y,tolerance,0,view.x,view.y,view.x+view.width,view.y+view.height]);new Uint32Array(data)[8]=limit;
   device.queue.writeBuffer(query,0,data);device.queue.writeBuffer(picked,0,new Uint32Array([0xffffffff]));
   for(const pipeline of [pick,selectType]){const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(limit/128));pass.end();}
  },
  draw(pass:GPURenderPassEncoder,count:number){if(!active)return;pass.setPipeline(render);pass.setBindGroup(0,renderBind);pass.draw(6,Math.min(count,shared.capacity));},
  destroy(){selected.destroy();picked.destroy();query.destroy();},
 };
}
