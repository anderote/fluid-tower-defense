import {PARTICLE_WGSL,type SharedGPU} from '../contracts/index.ts';
import {FIRE_STATE_WGSL} from '../effects/fire.ts';

const PREAMBLE=`${PARTICLE_WGSL}${FIRE_STATE_WGSL}
struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
struct Shot {timing:vec4f,shot:vec4f,flags:vec4f};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> heat:array<Heat>;
@group(0) @binding(3) var<storage,read> shots:array<Shot>;
@group(0) @binding(4) var<storage,read> towers:array<vec4f>;
@group(0) @binding(5) var<storage,read> burning:array<u32>;
struct Out {@builtin(position) pos:vec4f,@location(0) local:vec2f,@location(1) life:f32,@location(2) seed:f32,@location(3) smoke:f32};
fn clip(p:vec2f)->vec2f{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let ratio=camera.world.z/camera.world.w;return vec2((2.*(p.x-camera.world.x)/camera.world.z-1.)*min(1.,ratio/aspect),(1.-2.*(p.y-camera.world.y)/camera.world.w)*min(1.,aspect/ratio));}
fn corner(vi:u32)->vec2f{let corners=array<vec2f,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));return corners[vi%6u];}
fn output(p:vec2f,q:vec2f,life:f32,seed:f32,smoke:f32)->Out{var o:Out;o.pos=vec4(clip(p),0.,1.);o.local=q;o.life=life;o.seed=seed;o.smoke=smoke;return o;}
fn hidden()->Out{return output(vec2(1e6),vec2(0.),0.,0.,0.);}
@fragment fn fs(i:Out)->@location(0) vec4f{
 if(i.life<=0.){discard;}
 // Deliberately tiny, hard-edged sprite cells.  The low resolution and
 // frame-stepped wobble make each quad read like a Red Alert fire sprite,
 // rather than a translucent modern particle.
 let clock=floor(camera.time.x*12.);let victimFlame=i.smoke < -.5;
 let grid=select(vec2(3.,4.),vec2(2.,3.),victimFlame);let rows=grid.y*2.;
 let cell=floor((i.local+1.)*grid);let q=select((cell+.5)/grid-1.,(cell+.5)/grid*2.-1.,victimFlame);
 if(i.smoke==0.){
  // Narrow bright fuel core inside a ragged orange tongue, aligned with flight.
  let edge=.22+.62*(1.-q.x)*.5;
  if(abs(q.y)>edge||abs(q.x)>1.){discard;}
  let core=abs(q.y)/edge;var color=vec3(1.,.19,.012);
  if(core<.62){color=vec3(1.,.51,.025);}
  if(core<.24){color=vec3(1.,.91,.38);}
  return vec4(color,i.life*.9);
 }
 let row=clamp(cell.y,0.,rows-1.);let flicker=select(-.22,.22,(u32(clock+i.seed*7.+row)&1u)==1u);
 let width=.18+row*.76/(rows-1.);let shape=max(abs(q.x+flicker*(1.-row/rows))/width,abs(q.y));
 if(shape>1.){discard;}
 if(i.smoke>1.5){return vec4(1.,.54,.035,i.life);}
 if(i.smoke>.5){
  let checker=f32((u32(cell.x+cell.y+clock+i.seed)&1u));
  let shade=.105+checker*.055;
  return vec4(vec3(shade,shade*.9,shade*.76),i.life*.34);
 }
 let hot=1.-clamp(abs(q.x)*1.1+(1.-q.y)*.2,0.,1.);
 var color=vec3(.73,.055,.008);
 if(hot>.2){color=vec3(1.,.2,.008);}
 if(hot>.48){color=vec3(1.,.53,.018);}
 if(hot>.72){color=vec3(1.,.88,.24);}
 return vec4(color,i.life);
}
`;

export async function createFireEffects(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,shared:SharedGPU,towers:GPUBuffer,emptyShots:GPUBuffer){
  const code=PREAMBLE+`
@vertex fn jet(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let t=towers[i];if(round(fract(t.w)*100.)!=7.){return hidden();}
 let s=shots[i];
 // Keep fuel flowing throughout the firing cycle. The simulation clears the
 // countdown when no target can be acquired; never leave a stale jet running.
 if(s.flags.y<1.||s.timing.x<=0.||abs(s.flags.x-t.z)>.5){return hidden();}
 let q=corner(vi);let shard=vi/6u;let smoke=shard>=48u;let k=f32(shard%48u);
 // Global simulation time keeps the plume moving across reload boundaries.
 let age=fract(k/48.+camera.time.x*2.4);let seed=f32(i)*2.399+k*1.71;
 let angle=s.shot.w;let f=vec2(cos(angle),sin(angle));let side=vec2(-f.y,f.x);
 let muzzle=t.xy+f*1.18-vec2(0.,1.02);
 let reach=max(1.,length(s.timing.zw-t.xy)-1.18);
 let spread=sin(seed+camera.time.x*17.-age*8.)*(.06+age*age*.72);
 let size=(.2+age*.82)*select(1.,1.2,smoke);
 let center=muzzle+f*age*reach+side*spread-vec2(0.,select(age*.18,age*1.3,smoke));
 let position=center+f*q.x*size*1.9+side*q.y*size;
 let fade=(1.-smoothstep(.82,1.,age))*select(1.,.42,smoke);
 return output(position,q,fade,seed,select(0.,1.,smoke));
}
@vertex fn victim(@builtin(vertex_index) vi:u32,@builtin(instance_index) instance:u32)->Out{
 let i=burning[instance];let p=particles[i];let h=heat[i].burn;if(!fireActive(h,p.status.w)||abs(p.state.w)<.5){return hidden();}
 let q=corner(vi);let shard=vi/6u;let k=f32(shard);let smoke=shard>=8u&&shard<10u;let ember=shard>=10u;
 let seed=f32(i)*2.399+k*1.618;let frame=floor(camera.time.x*12.);
 let age=fract((frame+k*3.)/11.+seed);
 let radius=max(.22,p.body.x);let scale=radius*select(1.,.65,p.state.w<0.);
 let life=min(1.,h.x*3.)*(1.-age*.7);
 // Eight little flames are pinned to alternating body heights and lanes.
 // They hop only on animation frames, so the fire crawls over the figure
 // without becoming a large cloud that obscures its pose.
 let flame=!smoke&&!ember;let lane=f32(i32(shard%3u)-1);
 let tier=f32((shard*3u)%8u)/7.;
 let hop=f32(i32((shard+u32(frame))%3u)-1)*.08;
 let side=(lane*.78+hop)*scale;
 let rise=select(.65+age*3.2,.45+tier*2.85,flame);
 let base=p.pos.xy+vec2(side*select(1.,1.8,ember),-scale*rise);
 let trailing=-p.pos.zw*age*.035;
 let size=scale*select(select(.24+.12*age,.09,ember),.5+.1*f32(shard%2u),flame);
 let position=base+trailing+vec2(q.x*size,q.y*size*select(1.,1.45,flame));
 return output(position,q,life,seed,select(select(-1.,1.,smoke),2.,ember));
}
`;
  const module=device.createShaderModule({label:'Pixel fire plumes and burning victims',code});
  const make=(entryPoint:string)=>device.createRenderPipelineAsync({label:entryPoint==='jet'?'Flamethrower plumes':'Burning zombies',layout:'auto',vertex:{module,entryPoint},fragment:{module,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const [jet,victim]=await Promise.all([make('jet'),make('victim')]);
  // Compact active burns once, so a 65k horde does not emit millions of hidden vertices.
  const burning=device.createBuffer({label:'Visible burning enemy indices',size:shared.capacity*4,usage:GPUBufferUsage.STORAGE});
  const indirect=device.createBuffer({label:'Burning enemy draw arguments',size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST});
  const countUniform=device.createBuffer({label:'Fire particle count',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(indirect,0,new Uint32Array([12*6,0,0,0]));
  const compact=await device.createComputePipelineAsync({layout:'auto',compute:{entryPoint:'compact',module:device.createShaderModule({label:'Compact burning enemies',code:`${PARTICLE_WGSL}${FIRE_STATE_WGSL}
@group(0) @binding(0) var<storage,read> particles:array<Particle>;
@group(0) @binding(1) var<storage,read> heat:array<Heat>;
@group(0) @binding(2) var<storage,read_write> indices:array<u32>;
@group(0) @binding(3) var<storage,read_write> args:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> count:vec4u;
@compute @workgroup_size(128) fn compact(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=count.x){return;}let p=particles[i];
 if(abs(p.state.w)<.5||!fireActive(heat[i].burn,p.status.w)){return;}
 indices[atomicAdd(&args[1],1u)]=i;
}`})}});
  const compactBind=device.createBindGroup({layout:compact.getBindGroupLayout(0),entries:[shared.particles,shared.heatState!,burning,indirect,countUniform].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const resources=[camera,shared.particles,shared.heatState!,shared.shotState??emptyShots,towers,burning];
  const bind=(pipeline:GPURenderPipeline,indices:number[])=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:indices.map(binding=>({binding,resource:{buffer:resources[binding]}}))});
  const jetBind=bind(jet,[0,3,4]),victimBind=bind(victim,[0,1,2,5]);
  return {
   prepare(encoder:GPUCommandEncoder,count:number){
    encoder.clearBuffer(indirect,4,4);if(!count)return;
    device.queue.writeBuffer(countUniform,0,new Uint32Array([Math.min(shared.capacity,count),0,0,0]));
    const pass=encoder.beginComputePass({label:'Find burning enemies'});pass.setPipeline(compact);pass.setBindGroup(0,compactBind);pass.dispatchWorkgroups(Math.ceil(Math.min(shared.capacity,count)/128));pass.end();
   },
   draw(pass:GPURenderPassEncoder,count:number,towerCount:number){
    pass.setPipeline(jet);pass.setBindGroup(0,jetBind);pass.draw(56*6,Math.min(64,towerCount));
    pass.setPipeline(victim);pass.setBindGroup(0,victimBind);if(count)pass.drawIndirect(indirect,0);
  },destroy(){burning.destroy();indirect.destroy();countUniform.destroy();}};
}
