import {PARTICLE_WGSL,type SharedGPU} from '../contracts/index.ts';
import {ELECTROCUTION_DURATION,ELECTROCUTION_FRAMES,TESLA_LINKS,TESLA_STATE_WGSL} from '../effects/tesla.ts';
import type {TurretArtStyle} from './red-alert.ts';

/** The same GPU hit records drive the bolt, its impact and the victim animation. */
export async function createTeslaEffects(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,towers:GPUBuffer,shared:SharedGPU,style:TurretArtStyle){
  if(!shared.teslaState||!shared.shotState)return null;
  const response=await fetch('/assets/red-alert/atlas.json');
  if(!response.ok)throw Error('Tesla electrocution atlas is missing');
  const atlas=await response.json() as {frames:{x:number;y:number;width:number;height:number}[];sprites:Record<string,number[]>};
  if(atlas.sprites.electro?.length!==14)throw Error('Reimport Red Alert assets for the electrocution frames');
  const image=await fetch('/assets/red-alert/atlas.png');if(!image.ok)throw Error('Tesla electrocution texture is missing');
  const bitmap=await createImageBitmap(await image.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const texture=device.createTexture({label:'Red Alert electrocution sprites',size:[bitmap.width,bitmap.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:bitmap},{texture},[bitmap.width,bitmap.height]);bitmap.close();
  const frames=device.createBuffer({label:'Electrocution frame coordinates',size:14*16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(frames,0,new Float32Array(atlas.sprites.electro.flatMap(id=>{const f=atlas.frames[id];return [f.x,f.y,f.width,f.height];})));
  const common=`${PARTICLE_WGSL}${TESLA_STATE_WGSL}
struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
struct TowerState {timing:vec4f,shot:vec4f,flags:vec4f};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> electricity:TeslaState;
@group(0) @binding(2) var<storage,read> particles:array<Particle>;
fn clip(p:vec2f)->vec4f {let aspect=camera.viewport.x/max(1.,camera.viewport.y);let wa=camera.world.z/camera.world.w;return vec4f(((p-camera.world.xy)/camera.world.zw*vec2f(2.,-2.)+vec2f(-1.,1.))*vec2f(min(1.,wa/aspect),min(1.,aspect/wa)),0.,1.);}
fn quad(i:u32)->vec2f {let q=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));return q[i%6u];}
fn hash(v:f32)->f32 {return fract(sin(v*127.1+311.7)*43758.5453);}
`;
  const boltModule=device.createShaderModule({label:'Tesla continuous forked bolts and microblasts',code:common+`
@group(0) @binding(3) var<storage,read> shots:array<TowerState>;
@group(0) @binding(4) var<storage,read> towers:array<vec4f>;
struct Out {@builtin(position) pos:vec4f,@location(0) local:vec2f,@location(1) color:vec4f,@location(2) mode:f32};
fn endpoint(link:vec4f)->vec2f {
 if(link.z>=0.){let p=particles[u32(link.z)];if(p.status.w==link.w){return p.pos.xy+vec2f(0.,-p.body.x*2.);}}
 return link.xy;
}
fn boltPoint(a:vec2f,b:vec2f,u:f32,seed:f32)->vec2f {
 let d=b-a;let side=vec2f(-d.y,d.x)/max(.001,length(d));
 // Both endpoints are pinned; connected segments share exactly the same knot.
 let wobble=(hash(floor(u*18.+.5)+seed)*2.-1.)*min(1.15,length(d)*.1)*sin(u*3.14159265);
 return mix(a,b,u)+side*wobble;
}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) instance:u32)->Out {
 let tower=instance/${TESLA_LINKS}u;let hop=instance%${TESLA_LINKS}u;let s=shots[tower];let t=towers[tower];let link=electricity.links[instance];
 let age=max(0.,camera.time.x-(s.flags.z-1.)/60.);let q=quad(vi);let piece=vi/6u;
 var o:Out;o.pos=vec4f(2.,2.,0.,1.);o.local=q;o.color=vec4f(0.);o.mode=0.;
 if(round(fract(t.w)*100.)!=4.||s.flags.x!=t.z||s.flags.y<1.||link.z< -1.||age>.34){return o;}
 var a=t.xy+vec2f(0.,${style==='red-alert'?-4.5:-1.45});
 if(hop>0u){a=endpoint(electricity.links[instance-1u]);}
 let b=endpoint(link);let seed=f32(tower)*13.7+s.flags.y*31.+floor(age/.04)*7.;
 let fade=(1.-smoothstep(.04,.18,age))*pow(.86,f32(hop));
 var p:vec2f;
 // One bright strand and two dim, wandering strands, as in OpenRA's TeslaZap.
 if(piece<54u){
  let strand=piece/18u;let segment=piece%18u;let u0=f32(segment)/18.;let u1=f32(segment+1u)/18.;
  let begin=boltPoint(a,b,u0,seed+f32(strand)*17.);let end=boltPoint(a,b,u1,seed+f32(strand)*17.);
  let d=end-begin;let side=vec2f(-d.y,d.x)/max(.001,length(d));
  let width=select(.09,.19,strand<2u)*select(.72,1.,hop==0u);
  p=mix(begin,end,(q.x+1.)*.5)+side*q.y*width;
  o.color=select(vec4f(.8,.94,1.,fade),vec4f(.16,.36,1.,fade*.65),strand<2u);
 }else if(piece<60u){
  let branch=f32(piece-54u);let u=.2+branch*.11;let begin=boltPoint(a,b,u,seed);
  let direction=vec2f(cos(seed+branch*3.),sin(seed+branch*3.));let end=begin+direction*(.45+hash(branch+seed)*1.1);
  let d=end-begin;let side=vec2f(-d.y,d.x)/max(.001,length(d));p=mix(begin,end,(q.x+1.)*.5)+side*q.y*.055;
  o.color=vec4f(.38,.62,1.,fade*.8);
 }else if(piece==60u){
  p=b+q*(.25+age*5.);o.mode=1.;o.color=vec4f(.56,.78,1.,(1.-smoothstep(.015,.12,age))*.85);
 }else if(piece==61u){
  p=b+q*(.35+age*4.5);o.mode=2.;o.color=vec4f(.32,.58,1.,(1.-smoothstep(.04,.24,age))*.65);
 }else if(piece<70u){
  let n=f32(piece-62u);let angle=n*.785398+hash(seed+n)*.4;let dir=vec2f(cos(angle),sin(angle));let side=vec2f(-dir.y,dir.x);
  p=b+dir*(.15+age*(3.+hash(n+seed)*5.))+dir*q.x*.18+side*q.y*.045+vec2f(0.,age*age*3.);
  o.color=vec4f(1.,.65+.25*hash(n),.26,1.-smoothstep(.04,.3,age));
 }else if(piece==70u){
  p=b+vec2f(0.,-age*1.8)+q*(.35+age*2.);o.mode=1.;o.color=vec4f(.22,.29,.38,sin(min(1.,age/.34)*3.14159)*.2);
 }else{
  p=a+q*(.35+.12*sin(age*90.));o.mode=1.;o.color=vec4f(.5,.75,1.,fade*select(0.,.85,hop==0u));
 }
 o.pos=clip(p);return o;
}
@fragment fn fs(i:Out)->@location(0) vec4f {
 var alpha=i.color.a;if(i.mode>.5){let d=length(i.local);alpha*=1.-smoothstep(.2,1.,d);if(i.mode>1.5){alpha=(1.-smoothstep(.07,.18,abs(d-.76)))*i.color.a;}}
 if(alpha<.005){discard;}return vec4f(i.color.rgb,alpha);
}`});
  const victimModule=device.createShaderModule({label:'Original Red Alert skeleton and ash sequence',code:common+`
@group(0) @binding(3) var sprites:texture_2d<f32>;
@group(0) @binding(4) var<uniform> frames:array<vec4f,14>;
struct Out {@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) alpha:f32};
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) instance:u32)->Out {
 let i=instance/2u;let dead=instance%2u==1u;let p=particles[i];let victim=electricity.victims[i];let shock=victim.shock;
 let age=select(teslaAge(shock,p.status.w,camera.time.x),max(0.,camera.time.x-(victim.corpse.w-1.)/60.),dead);
 var o:Out;o.pos=vec4f(2.,2.,0.,1.);o.uv=vec2f(0);o.alpha=0.;
 if(age>4.||(dead&&victim.corpse.w<=0.)||(!dead&&(p.state.w<.5||age>.24))){return o;}
 let sequence=array<u32,22>(${ELECTROCUTION_FRAMES.map(f=>f+'u').join(',')});
 let frame=select(u32(floor(age/.08))%4u,sequence[min(21u,u32(floor(age/.08)))],dead);
 let rect=frames[frame];let q=(quad(vi)+1.)*.5;
 // The source canvas is 50x39. Its feet are at (25,21), not the canvas center.
 let origin=select(p.pos.xy,victim.corpse.xy,dead);let radius=select(p.body.x,victim.corpse.z,dead);
 let position=origin+(q*rect.zw-vec2f(25.,21.))*radius*.36;
 o.pos=clip(position);o.uv=rect.xy+q*rect.zw;o.alpha=select(1.,1.-smoothstep(${ELECTROCUTION_DURATION},4.,age),dead);return o;
}
@fragment fn fs(i:Out)->@location(0) vec4f {let c=textureLoad(sprites,vec2i(floor(i.uv)),0);if(c.a<.01||i.alpha<.01){discard;}return vec4f(c.rgb,c.a*i.alpha);}
`});
  const blend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
  const make=(module:GPUShaderModule)=>device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format,blend}]},primitive:{topology:'triangle-list'}});
  const [bolts,victims]=await Promise.all([make(boltModule),make(victimModule)]);
  const base=[camera,shared.teslaState,shared.particles].map((buffer,binding)=>({binding,resource:{buffer}}));
  const boltBindings=device.createBindGroup({layout:bolts.getBindGroupLayout(0),entries:[...base,{binding:3,resource:{buffer:shared.shotState}},{binding:4,resource:{buffer:towers}}]});
  const victimBindings=device.createBindGroup({layout:victims.getBindGroupLayout(0),entries:[...base,{binding:3,resource:texture.createView()},{binding:4,resource:{buffer:frames}}]});
  return {
    draw(pass:GPURenderPassEncoder,count:number,towerCount:number){
      pass.setPipeline(victims);pass.setBindGroup(0,victimBindings);pass.draw(6,Math.min(count,shared.capacity)*2);
      pass.setPipeline(bolts);pass.setBindGroup(0,boltBindings);pass.draw(72*6,Math.min(64,towerCount)*TESLA_LINKS);
    },
    destroy(){texture.destroy();frames.destroy();}
  };
}
