import {AFTERMATH_WGSL,CORPSE_CAPACITY,HIT_CAPACITY} from '../effects/aftermath.ts';
import type {RenderScene} from '../contracts/index.ts';
import {ZOMBIE_FRAME,ZOMBIE_PIVOT,ZOMBIE_ROSTER_WGSL} from './zombie-roster.ts';
import {createRemnantAtlas} from './remnant-art.ts';

const SCORCH_CAPACITY=256;
export async function createAftermathRenderer(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,events:GPUBuffer,zombies:GPUTexture){
  const atlas=createRemnantAtlas(),parts=device.createTexture({label:'Pixel body fragments',size:[atlas.width,atlas.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:atlas},{texture:parts},[atlas.width,atlas.height]);
  const scorches=device.createBuffer({label:'Persistent scorch marks',size:SCORCH_CAPACITY*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const shader=device.createShaderModule({label:'Blood, corpses and ballistic fragments',code:`${AFTERMATH_WGSL.replaceAll('atomic<u32>','u32')}${ZOMBIE_ROSTER_WGSL}
struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> aftermath:Aftermath;
@group(0) @binding(2) var zombies:texture_2d<f32>;
@group(0) @binding(3) var parts:texture_2d<f32>;
@group(0) @binding(4) var<storage,read> scorches:array<vec4f>;
struct Out {@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) local:vec2f,@location(2) color:vec4f,@location(3) mode:f32,@location(4) seed:f32};
fn corner(v:u32)->vec2f{let q=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));return q[v%6u];}
fn hash(v:f32)->f32{return fract(sin(v*12.9898)*43758.5453);}
fn rotate(p:vec2f,a:f32)->vec2f{return vec2f(p.x*cos(a)-p.y*sin(a),p.x*sin(a)+p.y*cos(a));}
fn clip(p:vec2f)->vec2f{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let wa=camera.world.z/camera.world.w;return vec2f((((p.x-camera.world.x)/camera.world.z)*2.-1.)*min(1.,wa/aspect),(1.-((p.y-camera.world.y)/camera.world.w)*2.)*min(1.,aspect/wa));}
fn empty()->Out{var o:Out;o.pos=vec4f(2,2,0,1);o.color=vec4f(0);return o;}
fn place(p:vec2f,q:vec2f,color:vec4f,mode:f32,seed:f32)->Out{var o:Out;o.pos=vec4f(clip(p),0,1);o.local=q;o.color=color;o.mode=mode;o.seed=seed;return o;}
fn eventAt(i:u32)->Remnant{if(i<${CORPSE_CAPACITY}u){return aftermath.deaths[i];}return aftermath.hits[i-${CORPSE_CAPACITY}u];}
// Ground displacement, height and spin. Gravity is visual altitude, not map Y.
fn piece(e:Remnant,part:u32,age:f32)->vec4f{
 let seed=e.life.y+f32(part)*3.71;let base=atan2(e.force.y,e.force.x);let angle=base+(f32(part)-1.5)*.77+(hash(seed)-.5)*.5;
 let heavy=select(1.,.72,e.body.w==2.);let speed=(3.+hash(seed+1.)*5.)*heavy;
 let flight=.42+hash(seed+2.)*.36;let t=min(age,1.8);let travel=speed*.62*(1.-exp(-t/.62));
 var height=0.;if(age<flight){height=sin(age/flight*3.141593)*(1.1+hash(seed+3.)*1.2);}else if(age<flight+.22){height=sin((age-flight)/.22*3.141593)*.22;}
 let ground=e.body.xy+vec2f(cos(angle),sin(angle))*travel;
 return vec4f(ground,max(0.,height),seed+min(age,flight+.35)*(4.+hash(seed+4.)*7.));
}
@vertex fn stainVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let e=eventAt(i);let age=camera.time.x-e.life.x;let death=i<${CORPSE_CAPACITY}u;let life=select(18.,100.,death);
 if(e.life.w<.5||age<0.||age>life){return empty();}let shard=vi/6u;let q=corner(vi);let seed=e.life.y+f32(shard)*2.17;
 var center=e.body.xy;var radius=e.body.z*select(.65,2.5,death);var alpha=.78;
 if(shard>0u){
  if(death&&e.force.w==1.){let p=piece(e,shard-1u,age);if(age<.65){return empty();}center=p.xy;radius*=.34;}
  else{center+=rotate(vec2f(.3+hash(seed)*1.1,(hash(seed+1.)-.5)*1.2),atan2(e.force.y,e.force.x))*e.body.z*1.5;radius*=.18+hash(seed+2.)*.3;}
  alpha=.85;
 }
 radius*=.45+.55*smoothstep(0.,.35,age);let local=rotate(q*vec2f(radius,radius*.65),seed);
 let fresh=exp(-age*.12);let color=mix(vec3f(.25,.018,.014),vec3f(.62,.045,.025),fresh);
 return place(center+local,q,vec4f(color,alpha*(1.-smoothstep(life*.75,life,age))),0.,seed);
}
@vertex fn corpseVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let e=aftermath.deaths[i];let age=camera.time.x-e.life.x;let sprite=zombieAtlas(u32(e.body.w));
 if(e.life.w<.5||age<0.||age>45.||e.force.w==1.||sprite<0.){return empty();}
 let q=(corner(vi)+1.)*.5;let frame=10.+floor(min(5.,age/zombieCollapseStep(u32(e.body.w))));let facing=f32((i32(round(e.force.z/.7853981634))+16)%8);
 let slide=e.force.xy*e.body.z*.45*(1.-exp(-age*7.));
 let p=e.body.xy+slide+(q-vec2f(${ZOMBIE_PIVOT.x/ZOMBIE_FRAME},${ZOMBIE_PIVOT.y/ZOMBIE_FRAME}))*e.body.z*zombieTileScale(u32(e.body.w));
 var o=place(p,corner(vi),vec4f(select(vec3f(.66,.6,.56),vec3f(.2,.14,.09),e.force.w==3.),1.-smoothstep(30.,45.,age)),1.,e.life.y);o.uv=(vec2f(frame,sprite*8.+facing)+q)*${ZOMBIE_FRAME}.;return o;
}
fn partVertex(vi:u32,i:u32,air:bool)->Out{
 let e=aftermath.deaths[i];let age=camera.time.x-e.life.x;
 if(e.life.w<.5||age<0.||age>38.||e.force.w!=1.){return empty();}
 let part=vi/6u;let q=corner(vi);let p=piece(e,part,age);if((p.z>.001)!=air){return empty();}
 let size=e.body.z*1.5;var o=place(p.xy-vec2f(0,p.z)+rotate(q*size,p.w),q,vec4f(vec3f(1.),1.-smoothstep(25.,38.,age)),2.,e.life.y);
 o.uv=(vec2f(f32(part),e.body.w)+(q+1.)*.5)*16.;return o;
}
@vertex fn groundPartVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{return partVertex(vi,i,false);}
@vertex fn airPartVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{return partVertex(vi,i,true);}
@vertex fn shadowVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let e=aftermath.deaths[i];let age=camera.time.x-e.life.x;if(e.life.w<.5||age<0.||age>1.3||e.force.w!=1.){return empty();}
 let p=piece(e,vi/6u,age);let q=corner(vi);return place(p.xy+q*e.body.z*vec2f(.58,.3),q,vec4f(.025,.022,.018,.32/(1.+p.z*.45)),3.,e.life.y);
}
@vertex fn sprayVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let e=eventAt(i);let age=camera.time.x-e.life.x;if(e.life.w<.5||age<0.||age>.34){return empty();}
 let shard=vi/6u;let q=corner(vi);let seed=e.life.y+f32(shard)*7.7;let angle=atan2(e.force.y,e.force.x)+(hash(seed)-.5)*1.3;
 let speed=select(5.+hash(seed+1.)*7.,2.5+hash(seed+1.)*3.,e.force.w==2.);let dir=vec2f(cos(angle),sin(angle));
 let p=e.body.xy+dir*speed*age+vec2f(0,-.25-age*1.2+age*age*8.);
 let size=e.body.z*(.11+hash(seed+2.)*.15);return place(p+rotate(q*vec2f(size*(1.5+speed*.12),size*.6),angle),q,vec4f(.57,.07,.045,(1.-age/.34)*.9),4.,seed);
}
@vertex fn scorchVS(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
 let s=scorches[i];let age=camera.time.x-s.w;let q=corner(vi);if(s.z<=0.||age<0.||age>100.){return empty();}
 return place(s.xy+q*vec2f(2.5,1.7)*s.z,q,vec4f(.035,.026,.019,.4*(1.-smoothstep(70.,100.,age))),0.,f32(i)*3.1);
}
@fragment fn fs(i:Out)->@location(0) vec4f{
 if(i.color.a<.005){discard;}
 if(i.mode==1.){let texel=textureLoad(zombies,vec2i(floor(i.uv)),0);if(texel.a<.5){discard;}return texel*i.color;}
 if(i.mode==2.){let texel=textureLoad(parts,vec2i(floor(i.uv)),0);if(texel.a<.5){discard;}return texel*i.color;}
 let pixel=floor(i.local*12.)/12.;let d=length(pixel);
 if(i.mode==0.){let edge=.72+hash(dot(floor(pixel*8.),vec2f(7.,11.))+i.seed)*.28;if(d>edge){discard;}return vec4f(i.color.rgb,i.color.a*(.6+.4*(1.-d)));}
 if(d>1.){discard;}return vec4f(i.color.rgb,i.color.a*select(1.,1.-smoothstep(.2,1.,d),i.mode==3.));
}`});
  const info=await shader.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const entries=['scorchVS','stainVS','shadowVS','corpseVS','groundPartVS','airPartVS','sprayVS'];
  const pipelines=await Promise.all(entries.map(entryPoint=>device.createRenderPipelineAsync({label:entryPoint,layout:pipelineLayout,vertex:{module:shader,entryPoint},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}})));
  const bindings=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:{buffer:events}},{binding:2,resource:zombies.createView()},{binding:3,resource:parts.createView()},{binding:4,resource:{buffer:scorches}}]});
  let cursor=0,lastTime=-1;let seen=new Map<string,number>();
  const draw=(pass:GPURenderPassEncoder,index:number,vertices:number,count:number)=>{pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bindings);pass.draw(vertices,count);};
  const reset=()=>{cursor=0;seen.clear();device.queue.writeBuffer(scorches,0,new Float32Array(SCORCH_CAPACITY*4));};
  return {
    reset,
    prepare(scene:RenderScene){
      if(scene.time<lastTime)reset();lastTime=scene.time;
      const next=new Map<string,number>();for(const e of scene.heavyExplosions??[]){const key=[e.kind,e.serial,e.x,e.y].join(':');const age=seen.get(key);if(age===undefined||e.age<age){device.queue.writeBuffer(scorches,(cursor++%SCORCH_CAPACITY)*16,new Float32Array([e.x,e.y,e.scale,scene.time-e.age]));}next.set(key,e.age);}seen=next;
    },
    ground(pass:GPURenderPassEncoder){draw(pass,0,6,SCORCH_CAPACITY);draw(pass,1,30,CORPSE_CAPACITY+HIT_CAPACITY);draw(pass,2,24,CORPSE_CAPACITY);draw(pass,3,6,CORPSE_CAPACITY);draw(pass,4,24,CORPSE_CAPACITY);},
    air(pass:GPURenderPassEncoder){draw(pass,5,24,CORPSE_CAPACITY);draw(pass,6,36,CORPSE_CAPACITY+HIT_CAPACITY);},
    destroy(){parts.destroy();scorches.destroy();}
  };
}
