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
 // A stepped silhouette and stepped color bands retain arcade pixel-art character.
 let q=floor(i.local*12.)/12.;let clock=floor(camera.time.x*14.)/14.;
 let curl=sin(q.y*7.+i.seed+clock*13.)*.13+sin(q.y*13.-clock*9.+i.seed)*.07;
 let width=.64*(1.-.42*max(0.,-q.y));
 let shape=length(vec2((q.x+curl)/width,q.y*.93));
 if(shape>1.){discard;}
 if(i.smoke>1.5){return vec4(1.,.63,.06,i.life);}
 if(i.smoke>.5){let shade=.12+.1*(1.-shape);return vec4(vec3(shade,shade*.9,shade*.8),i.life*.26*(1.-shape*.55));}
 let core=length(vec2((q.x+curl*.65)/width,(q.y-.3)*1.05));
 var color=vec3(.87,.12,.015);
 if(shape<.87){color=vec3(1.,.34,.015);}
 if(core<.67){color=vec3(1.,.72,.055);}
 if(core<.36){color=vec3(1.,.96,.51);}
 return vec4(color,i.life*select(.86,1.,core<.5));
}
`;

export async function createFireEffects(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,shared:SharedGPU,towers:GPUBuffer,emptyShots:GPUBuffer){
  const code=PREAMBLE+`
@vertex fn jet(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let t=towers[i];if(round(fract(t.w)*100.)!=7.){return hidden();}
 let s=shots[i];let elapsed=max(0.,s.timing.y-s.timing.x);
 if(s.timing.y<=0.||elapsed>min(.52,s.timing.y*.95)||abs(s.flags.x-t.z)>.5){return hidden();}
 let q=corner(vi);let shard=vi/6u;let smoke=shard>=24u;let k=f32(shard%24u);
 let age=fract(k/24.+elapsed*2.1);let seed=f32(i)*2.399+k*1.71;
 let angle=s.shot.w;let f=vec2(cos(angle),sin(angle));let side=vec2(-f.y,f.x);
 // Match the elevated Soldat barrel mouth, including baked facing quantization.
 let facing=floor(angle/.09817477042+.5)*.09817477042;
 let muzzle=t.xy+vec2(cos(facing),sin(facing))*2.16-vec2(0.,.5005);
 let range=max(1.,length(s.timing.zw-t.xy)-2.15);
 let reach=min(range,2.+elapsed/max(.04,min(.52,s.timing.y*.95))*range*3.);let along=age*reach;
 let spread=sin(seed+floor(camera.time.x*14.)*.7)*(.12+age*1.35);
 let size=(.45+age*1.7)*select(1.,1.25,smoke);
 let center=muzzle+f*along+side*spread-vec2(0.,select(age*.45,age*1.8,smoke));
 let position=center+f*q.x*size*1.35+side*q.y*size;
 let fade=(1.-smoothstep(min(.52,s.timing.y*.95)*.55,min(.52,s.timing.y*.95),elapsed))*(1.-smoothstep(.78,1.,age));
 return output(position,q,fade,seed,select(0.,1.,smoke));
}
@vertex fn victim(@builtin(vertex_index) vi:u32,@builtin(instance_index) instance:u32)->Out{
 let i=burning[instance];let p=particles[i];let h=heat[i].burn;if(!fireActive(h,p.status.w)||abs(p.state.w)<.5){return hidden();}
 let q=corner(vi);let shard=vi/6u;let k=f32(shard);let smoke=shard>=6u&&shard<8u;let ember=shard>=8u;
 let seed=f32(i)*2.399+k*1.618;let clock=floor(camera.time.x*14.)/14.;
 let age=fract(clock*(1.65+k*.09)+seed);
 let radius=max(.22,p.body.x);let scale=radius*select(1.,.65,p.state.w<0.);
 let life=min(1.,h.x*3.)*(1.-age*.7);
 let side=sin(seed+clock*5.)*scale*(.5+age);
 let base=p.pos.xy+vec2(side*select(1.,2.,ember),-scale*(1.+age*select(3.,7.,ember)));
 let trailing=-p.pos.zw*age*.06;
 let size=scale*select(.6+age*.55,.1,ember);
 let position=base+trailing+vec2(q.x*size,q.y*size*1.7);
 return output(position,q,life,seed,select(select(0.,1.,smoke),2.,ember));
}
`;
  const module=device.createShaderModule({label:'Arcade fire plumes and burning victims',code});
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
    pass.setPipeline(jet);pass.setBindGroup(0,jetBind);pass.draw(30*6,Math.min(64,towerCount));
    pass.setPipeline(victim);pass.setBindGroup(0,victimBind);if(count)pass.drawIndirect(indirect,0);
  },destroy(){burning.destroy();indirect.destroy();countUniform.destroy();}};
}
