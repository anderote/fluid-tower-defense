import {createTeslaEffects} from './tesla.ts';
import {createAftermathRenderer} from './aftermath.ts';
import {TESLA_STATE_WGSL,TESLA_HEADER_BYTES,TESLA_PARTICLE_BYTES} from '../effects/tesla.ts';
import { ENEMY_WGSL, towerBehavior } from '../content/index.ts';
import { PARTICLE_WGSL, type RenderScene, type Renderer, type SharedGPU, type TowerKind, type Vec2 } from '../contracts/index.ts';
import {screenToWorld as unproject, worldToScreen as project} from './camera.ts';
import {TURRET_GRID, turretHardpoints, turretPixelRects, type TurretInk} from './turret-art.ts';
import {createRedAlertArt,hasRedAlertSprite,type TurretArtStyle,type FloorArtStyle} from './red-alert.ts';
import type {WireArtStyle} from './wire-art.ts';
import {SHOT_GEOMETRY_WGSL} from './shot-geometry.ts';
import {createShamblers} from './shamblers.ts';
import {ZOMBIE_ROSTER_WGSL} from './zombie-roster.ts';

const MAX_TOWERS = 64;
const WEAPON_KINDS:readonly TowerKind[]=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator'];
const wgslFloat=(value:number)=>Number.isInteger(value)?`${value}.`:`${value}`;
const MUZZLE_OFFSETS_WGSL=`fn muzzleOffset(weapon:f32,barrel:f32)->vec2<f32>{${WEAPON_KINDS.map((kind,index)=>{
  const muzzles=turretHardpoints(kind).muzzles;
  const result=muzzles.map(point=>`vec2(${wgslFloat(point.x)},${wgslFloat(point.y)})`);
  const body=muzzles.slice(0,-1).map((_,barrel)=>`if(barrel<${wgslFloat(barrel+.5)}){return ${result[barrel]};}`).join('');
  const branch=`${body}return ${result.at(-1)};`;
  return index===WEAPON_KINDS.length-1?branch:`if(weapon<${wgslFloat(index+.5)}){${branch}}`;
}).join('')}}`;
type V = { x:number; y:number; r:number; g:number; b:number; a:number };
const sameRect=(left:{x:number;y:number;width:number;height:number},right:{x:number;y:number;width:number;height:number})=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;

/** GPU-only visualizer. Particle bodies remain in the shared simulation buffer. */
export async function createRenderer(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, shared: SharedGPU, canvas: HTMLCanvasElement,options:{turretArt?:TurretArtStyle;wireArt?:WireArtStyle;floorArt?:FloorArtStyle}={}): Promise<Renderer> {
  const uniform = device.createBuffer({ label:'Render camera', size:64, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const turretArt=options.turretArt??'soldat';
  const redAlert=await createRedAlertArt(device,format,uniform,turretArt,options.wireArt,options.floorArt).catch(error=>{console.warn('Facility artwork unavailable; using fallback graphics.',error);return null;});
  const emptyTesla=shared.teslaState?null:device.createBuffer({label:'Empty Tesla status',size:TESLA_HEADER_BYTES+shared.capacity*TESLA_PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE});
  const teslaState=shared.teslaState??emptyTesla!;
  const shamblers=await createShamblers(device,format,uniform,{...shared,teslaState});
  const aftermath=shared.aftermath?await createAftermathRenderer(device,format,uniform,shared.aftermath,shamblers.texture):null;
  let overlayCapacity=1;
  let overlays = device.createBuffer({ label:'Tactical overlays', size:24, usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
  let foregroundCapacity=1;
  let foreground = device.createBuffer({ label:'Foreground effects', size:24, usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
  const towerVisuals = device.createBuffer({ label:'Tower visual state', size:MAX_TOWERS * 16, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST });
  const emptyShots = device.createBuffer({ label:'Empty firing state', size:MAX_TOWERS * 48, usage:GPUBufferUsage.STORAGE });
  const tesla=await createTeslaEffects(device,format,uniform,towerVisuals,shared,turretArt);
  const particleModule = device.createShaderModule({code:`
${PARTICLE_WGSL}
${ENEMY_WGSL}
${TESLA_STATE_WGSL}
${ZOMBIE_ROSTER_WGSL}
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> };
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage,read> particles: array<Particle>;
@group(0) @binding(2) var<storage,read> electricity:TeslaState;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) color: vec4<f32>, @location(2) bloodMode: f32 };
fn world(p:vec2<f32>)->vec2<f32>{ let aspect=camera.viewport.x/max(1.0,camera.viewport.y); let targetAspect=camera.world.z/camera.world.w; let sx=min(1.0,targetAspect/aspect); let sy=min(1.0,aspect/targetAspect); return vec2((((p.x-camera.world.x)/camera.world.z)*2.0-1.0)*sx, (1.0-((p.y-camera.world.y)/camera.world.w)*2.0)*sy); }
fn pressureColor(value:f32)->vec3<f32>{
  let cold=vec3(.04,.22,.72);let cool=vec3(.02,.88,1.);let warm=vec3(1.,.9,.08);let hot=vec3(1.,.3,.015);let critical=vec3(.92,.015,.08);
  if(value<.25){return mix(cold,cool,value*4.);}
  if(value<.55){return mix(cool,warm,(value-.25)/.3);}
  if(value<.8){return mix(warm,hot,(value-.55)/.25);}
  return mix(hot,critical,(value-.8)/.2);
}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {
  let corners=array<vec2<f32>,6>(vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  let shard=vi/6u; let c=corners[vi%6u]; let p=particles[ii]; let dead=p.state.w<-.5; var radius=max(.27,p.body.x*1.18);
  var o:Out; o.local=c; o.bloodMode=0.;
  if(dead&&${shared.aftermath?'true':'false'}){o.pos=vec4(2.,2.,0.,1.);o.color=vec4(0.);return o;}
  let shock=electricity.victims[ii].shock;let shockAge=teslaAge(shock,p.status.w,camera.time.x);
  if((dead&&shock.x>0.&&shock.y==p.status.w&&shock.z>.5)||(!dead&&shockAge<.24)){o.pos=vec4(2.,2.,0.,1.);o.color=vec4(0.);return o;}
  if(dead){ let age=max(0.,camera.time.x-(-p.body.w)/60.);let seed=f32(ii)*17.+f32(shard)*2.4;let flight=clamp(age/.78,0.,1.);let dir=vec2(cos(seed),sin(seed));let stain=shard==0u;let mist=shard>4u;let speed=select(.85+fract(seed*3.1)*2.2,.38+fract(seed)*.8,mist);let center=select(p.pos.xy+dir*(.18+speed*flight)+vec2(0.,age*age*.7),p.pos.xy,stain);radius=select(max(.07,p.body.x*(.36+.72*(1.-flight))*select(1.,.62,mist)),max(.38,p.body.x*3.25),stain);let life=select(max(0.,1.-age/select(.95,.62,mist)),max(0.,1.-age/18.),stain);o.pos=vec4(world(center+c*radius),0,1);o.color=vec4(select(.42+.3*sin(seed),.7+.18*sin(seed*2.),mist),.008,.004,life*select(.9,.42,stain));o.bloodMode=select(2.,1.,stain);return o; }
  if(shard>0u||zombieAtlas(u32(max(0.,round(p.state.z))))>=0.){o.pos=vec4(2.,2.,0.,1.);o.color=vec4(0.);return o;}
  let speed=length(p.pos.zw);let forward=select(vec2(1.,0.),p.pos.zw/max(.001,speed),speed>.02);let side=vec2(-forward.y,forward.x);let breathe=1.+.055*sin(camera.time.x*5.5+f32(ii)*.37);let offset=(forward*c.x*(1.03+min(.28,speed*.035))+side*c.y*.92)*radius*breathe;let q=world(p.pos.xy+offset);o.pos=vec4(q,0,1);
  let k=u32(clamp(p.state.z,0.0,5.0)+0.5); var col=enemyColor(k);
  let hp=clamp(p.body.z/max(0.001,p.body.w),0.0,1.0);let rawPressure=max(0.,p.state.y);let pressure=clamp(log2(1.+rawPressure)/7.,0.,1.);
  // time.y is the heatmap switch: data comes solely from this particle's pressure/packing fields.
  if(camera.time.y > .5&&pressure>.001){col=mix(col,pressureColor(pressure),.35+.65*pressure);}
  o.color=vec4(col*(.42+.58*hp),p.state.w); return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{let d=length(i.local);let blood=i.bloodMode>.5;let irregular=.045*sin(i.local.x*13.+i.local.y*7.)+.035*sin(i.local.y*19.);let edge=select(1.,1.+irregular,blood);if(d>edge||i.color.a<.02){discard;}var alpha=i.color.a*(1.-smoothstep(edge-.16,edge,d));if(i.bloodMode>1.5){alpha*=.72+.28*sin((i.local.x-i.local.y)*12.);}let light=max(0.,dot(normalize(i.local+vec2(.001)),normalize(vec2(-.65,-.75))));let rim=smoothstep(.62,.98,d);let col=select(i.color.rgb*(.82+.18*light)+vec3(.07)*light*light,mix(i.color.rgb,vec3(.16,.002,0.),rim*.35),blood);return vec4(col,alpha);}
`});
  const overlayModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
struct I { @location(0) pos:vec2<f32>, @location(1) color:vec4<f32> }; struct O { @builtin(position) pos:vec4<f32>, @location(0) color:vec4<f32> };
@vertex fn vs(i:I)->O { let aspect=camera.viewport.x/max(1.,camera.viewport.y);let targetAspect=camera.world.z/camera.world.w;let sx=min(1.,targetAspect/aspect);let sy=min(1.,aspect/targetAspect);var o:O; o.pos=vec4((((i.pos.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((i.pos.y-camera.world.y)/camera.world.w)*2.)*sy,0,1);o.color=i.color;return o; }
@fragment fn fs(i:O)->@location(0) vec4<f32>{return i.color;}`});
  const cueModule=device.createShaderModule({code:`
${SHOT_GEOMETRY_WGSL}
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> };
struct TowerState { timing:vec4<f32>, shot:vec4<f32>, flags:vec4<f32> };
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> states:array<TowerState>;
@group(0) @binding(2) var<storage,read> towers:array<vec4<f32>>;
struct Out { @builtin(position) pos:vec4<f32>, @location(0) local:vec2<f32>, @location(1) kind:f32, @location(2) age:f32, @location(3) shard:f32, @location(4) weapon:f32, @location(5) elapsed:f32 };
fn clip(p:vec2<f32>)->vec2<f32>{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let targetAspect=camera.world.z/camera.world.w;let sx=min(1.,targetAspect/aspect);let sy=min(1.,aspect/targetAspect);return vec2((((p.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((p.y-camera.world.y)/camera.world.w)*2.)*sy);}
${MUZZLE_OFFSETS_WGSL}
fn muzzlePoint(origin:vec2<f32>,forward:vec2<f32>,weapon:f32,barrel:f32)->vec2<f32>{let offset=muzzleOffset(weapon,barrel);let side=vec2(-forward.y,forward.x);return origin+forward*offset.x+side*offset.y;}
fn muzzleDistance(weapon:f32)->f32{return muzzleOffset(weapon,select(0.,1.,weapon>=4.5&&weapon<5.5)).x;}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {
 let corners=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
 let shard=vi/6u;let q=corners[vi%6u];let s=states[ii];let t=towers[ii];let kind=floor(t.w+.001);let weapon=round(fract(t.w)*100.);
 var life=.24;if(weapon==1.){life=.62;}else if(weapon==2.){life=.32;}else if(weapon==4.){life=.3;}else if(weapon==5.){life=.56;}else if(weapon==6.){life=.18;}else if(weapon==7.){life=.34;}
 let elapsed=max(0.,s.timing.y-s.timing.x);let valid=s.timing.y>0.&&elapsed<=life&&abs(s.flags.x-t.z)<.5&&weapon!=4.;let age=select(2.,clamp(elapsed/life,0.,1.),valid);
 let aim=s.timing.zw;let delta=aim-t.xy;let len=max(.1,length(delta));let forward=delta/len;let side=vec2(-forward.y,forward.x);let muzzle=muzzlePoint(t.xy,forward,weapon,0.);let seed=f32(shard)*2.399+f32(ii)*.71;let burst=vec2(cos(seed),sin(seed));var p:vec2<f32>;
 if(weapon==0.){
  let distance=.15+age*(4.5+len*.035);p=muzzle+burst*distance+q*(select(.22,1.05,shard==0u));
 }else if(weapon==1.){
  if(shard==0u){p=muzzle+forward*q.x*(1.25-1.7*elapsed)+side*q.y*(.55-.6*elapsed);}else{let smokeAge=clamp(elapsed/.62,0.,1.);p=muzzle-forward*smokeAge*(.35+f32(shard)*.035)+burst*(.1+smokeAge*.45)+q*(.13+smokeAge*.2);}
 }else if(weapon==2.){
  if(shard==0u){p=muzzle+forward*q.x*(1.4-2.8*elapsed)+side*q.y*(.58-1.05*elapsed);}
  else if(shard==1u){p=autocannonTracer(q,muzzle,forward,len-muzzleDistance(weapon),elapsed);}
  else if(shard<8u){let impactAge=clamp((elapsed-.04)/.24,0.,1.);let ricochet=normalize(burst-forward*(.65+.2*fract(seed)));p=aim+ricochet*impactAge*(1.3+f32(shard)*.3)+q*(.18-.08*impactAge);}
  else{let smokeAge=clamp(elapsed/.32,0.,1.);let drift=side*(f32(shard)-9.5)*.22-forward*smokeAge*.8;p=muzzle+drift+q*(.16+smokeAge*.38);}
 }else if(weapon==3.){
  let u=(f32(shard)+.65)/12.;let width=(.3+u*3.2)*(1.-age*.45);p=muzzle+forward*(max(0.,len-muzzleDistance(weapon))*u)+side*(burst.y*width)+q*(.22+u*.5);
 }else if(weapon==4.){
  let u=(f32(shard)+.5)/12.;let beamLen=max(0.,len-muzzleDistance(weapon));let jitter=sin(u*39.+f32(ii)*2.1+age*17.)*(.35+sin(u*3.14159)*.95);p=muzzle+forward*(beamLen*u)+side*jitter+forward*q.x*(beamLen/21.)+side*q.y*.16;
 }else if(weapon==5.){
  let tube=f32(shard%3u);let tubeDelay=tube*.045;let launch=muzzlePoint(t.xy,forward,weapon,tube);if(elapsed<tubeDelay){p=vec2(1e6);}else if(shard<3u){p=launch+forward*q.x*max(.2,1.35-(elapsed-tubeDelay)*2.4)+side*q.y*.42;}else{let smokeAge=clamp((elapsed-tubeDelay)/.5,0.,1.);p=launch-forward*smokeAge*.65+burst*(.08+smokeAge*.55)+q*(.14+.24*smokeAge);}
 }else if(weapon==6.){
  if(shard==0u){p=muzzle+forward*((q.x+1.)*.5*max(0.,len-muzzleDistance(weapon)))+side*q.y*.16;}else{p=aim+burst*(.4+f32(shard)*.22)+q*.14;}
 }else{
  let u=(f32(shard)+.6)/12.;let spread=(.35+u*3.4)*sin(seed+age*4.);p=muzzle+forward*(max(0.,len-muzzleDistance(weapon))*u*.82)+side*spread+q*(.32+u*1.05);
 }
 var o:Out;o.pos=vec4(clip(p),0.,1.);o.local=q;o.kind=kind;o.age=age;o.shard=f32(shard);o.weapon=weapon;o.elapsed=elapsed;return o;
}
fn weaponColor(w:f32)->vec3<f32>{if(w<.5){return vec3(.52,1.,.24);}if(w<1.5){return vec3(.93,.48,.12);}if(w<2.5){return vec3(1.,.86,.3);}if(w<3.5){return vec3(.35,.88,1.);}if(w<4.5){return vec3(.68,.42,1.);}if(w<5.5){return vec3(1.,.22,.055);}if(w<6.5){return vec3(.28,1.,.79);}return vec3(1.,.3,.035);}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{
 if(i.age>1.){discard;}let d=length(i.local);let fade=(1.-i.age)*(1.-i.age);var col=weaponColor(i.weapon);var a=0.;
 if(i.weapon<.5){a=(1.-smoothstep(.36,1.,d))*fade*(.9-.035*i.shard);if(i.shard==0.){a*=smoothstep(.22,.72,d);}}
 else if(i.weapon<1.5){if(i.shard==0.&&i.age<.66){a=1.-smoothstep(.55,1.,d);col=mix(vec3(.18,.13,.09),col,smoothstep(.68,1.,d));}else{a=(1.-smoothstep(.18,1.,d))*smoothstep(.05,.38,d)*smoothstep(.5,.64,i.age)*(1.-i.age);}}
 else if(i.weapon<2.5){
  if(i.shard<.5){let hot=1.-smoothstep(.02,.11,i.elapsed);a=(1.-smoothstep(.25,1.,length(i.local)))*hot*1.2;col=mix(vec3(1.),vec3(1.,.48,.04),smoothstep(.1,1.,length(i.local)));}
  else if(i.shard<1.5){a=(1.-smoothstep(.22,1.,abs(i.local.y)))*(1.-smoothstep(.06,.18,i.elapsed))*1.15;col=mix(vec3(1.),vec3(1.,.68,.16),smoothstep(-1.,1.,i.local.x));}
  else if(i.shard<7.5){a=(1.-smoothstep(.18,1.,length(i.local)))*smoothstep(.035,.06,i.elapsed)*(1.-smoothstep(.12,.3,i.elapsed));col=mix(vec3(1.),vec3(1.,.42,.04),length(i.local));}
  else{a=(1.-smoothstep(.2,1.,length(i.local)))*smoothstep(.045,.12,i.elapsed)*(1.-i.age)*.16;col=vec3(.34,.32,.29);}
 }
 else if(i.weapon<3.5){a=(1.-smoothstep(.25,1.,d))*fade*(.35+.65*fract(sin(i.shard*19.7)*91.3));col=mix(col,vec3(1.),.28);}
 else if(i.weapon<4.5){a=(1.-smoothstep(.12,1.,abs(i.local.y)))*fade*(.65+.35*sin(i.local.x*24.+i.shard));col=mix(col,vec3(1.),.48);}
 else if(i.weapon<5.5){a=(1.-smoothstep(.28,1.,d))*fade;if(i.shard<3.){a=1.-smoothstep(.38,1.,max(abs(i.local.x),d*.7));col=mix(vec3(1.,.72,.18),col,.55);}else{col=vec3(.34,.3,.27);a*=.42;}}
 else if(i.weapon<6.5){a=(1.-smoothstep(.18,1.,abs(i.local.y)))*fade;if(i.shard==0.){a*=1.35;col=mix(col,vec3(1.),.62);}}
 else{let flicker=.58+.42*sin(i.local.y*9.+i.shard*2.7+i.age*23.);a=(1.-smoothstep(.32,1.,d))*fade*flicker;col=mix(vec3(1.,.92,.18),col,smoothstep(.05,.9,d));}
 return vec4(col,max(0.,a));
}`});
  const bgModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
@vertex fn vs(@builtin(vertex_index) v:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));return vec4(p[v],0,1);}
@fragment fn fs(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{let keepBinding=camera.viewport.x*0.;return vec4(vec3(.075+keepBinding),1.);}`});
  const bg=device.createRenderPipeline({layout:'auto',vertex:{module:bgModule,entryPoint:'vs'},fragment:{module:bgModule,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
  const particles=device.createRenderPipeline({layout:'auto',vertex:{module:particleModule,entryPoint:'vs'},fragment:{module:particleModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},multisample:{count:1}});
  const overlay=device.createRenderPipeline({layout:'auto',vertex:{module:overlayModule,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module:overlayModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const cues=device.createRenderPipeline({layout:'auto',vertex:{module:cueModule,entryPoint:'vs'},fragment:{module:cueModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const cameraBG=device.createBindGroup({layout:bg.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  const cameraParticles=device.createBindGroup({layout:particles.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:shared.particles}},{binding:2,resource:{buffer:teslaState}}]});
  const cameraOverlay=device.createBindGroup({layout:overlay.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  const cameraCues=device.createBindGroup({layout:cues.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:shared.shotState ?? emptyShots}},{binding:2,resource:{buffer:towerVisuals}}]});
  let pixelW=0,pixelH=0;
  let camera={x:0,y:0,zoom:1};
  let world={width:160,height:100};
  const view=()=>({width:world.width/camera.zoom,height:world.height/camera.zoom});
  const clampCamera=()=>{const v=view();camera.x=Math.max(0,Math.min(world.width-v.width,camera.x));camera.y=Math.max(0,Math.min(world.height-v.height,camera.y));};
  const resize=()=>{const d=Math.min(devicePixelRatio||1,2),max=device.limits.maxTextureDimension2D; const w=Math.max(1,Math.min(max,Math.round(canvas.clientWidth*d))),h=Math.max(1,Math.min(max,Math.round(canvas.clientHeight*d))); if(w!==pixelW||h!==pixelH){pixelW=w;pixelH=h;canvas.width=w;canvas.height=h;context.configure({device,format,alphaMode:'opaque'});} };
  const screenToWorld=(clientX:number,clientY:number):Vec2=>unproject({x:clientX,y:clientY},canvas.getBoundingClientRect(),camera,world);
  const worldToScreen=(x:number,y:number):Vec2=>project({x,y},canvas.getBoundingClientRect(),camera,world);
  const push=(a:V[],x:number,y:number,c:[number,number,number,number])=>a.push({x,y,r:c[0],g:c[1],b:c[2],a:c[3]});
  const tri=(a:V[], p:Vec2,q:Vec2,r:Vec2,c:[number,number,number,number])=>{push(a,p.x,p.y,c);push(a,q.x,q.y,c);push(a,r.x,r.y,c)};
  const rect=(a:V[],x:number,y:number,w:number,h:number,c:[number,number,number,number])=>{tri(a,{x,y},{x:x+w,y},{x,y:y+h},c);tri(a,{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},c)};
  const rectOutline=(a:V[],x:number,y:number,w:number,h:number,c:[number,number,number,number],width=.35)=>{rect(a,x-width,y-width,w+width*2,width,c);rect(a,x-width,y+h,w+width*2,width,c);rect(a,x-width,y,width,h,c);rect(a,x+w,y,width,h,c)};
  const ring=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],width=0.65)=>{const n=28;for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;const p=(rr:number,t:number)=>({x:x+Math.cos(t)*rr,y:y+Math.sin(t)*rr});tri(a,p(rad-width,u),p(rad-width,v),p(rad,v),c);tri(a,p(rad-width,u),p(rad,v),p(rad,u),c)}};
  const disc=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],n=10)=>{for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;tri(a,{x,y},{x:x+Math.cos(u)*rad,y:y+Math.sin(u)*rad},{x:x+Math.cos(v)*rad,y:y+Math.sin(v)*rad},c)}};
  const streak=(a:V[],x:number,y:number,vx:number,vy:number,length:number,width:number,c:[number,number,number,number])=>{const m=Math.max(.001,Math.hypot(vx,vy)),dx=vx/m*length,dy=vy/m*length,sx=-dy/m*width,sy=dx/m*width;tri(a,{x:x-dx+sx,y:y-dy+sy},{x:x-dx-sx,y:y-dy-sy},{x:x+sx,y:y+sy},c);tri(a,{x:x-dx-sx,y:y-dy-sy},{x:x-sx,y:y-sy},{x:x+sx,y:y+sy},c)};
  const shard=(a:V[],x:number,y:number,size:number,angle:number,c:[number,number,number,number])=>{const f={x:Math.cos(angle)*size,y:Math.sin(angle)*size},s={x:-Math.sin(angle)*size*.55,y:Math.cos(angle)*size*.55};tri(a,{x:x+f.x,y:y+f.y},{x:x+s.x,y:y+s.y},{x:x-f.x-s.x*.25,y:y-f.y-s.y*.25},c);tri(a,{x:x+f.x,y:y+f.y},{x:x-f.x-s.x*.25,y:y-f.y-s.y*.25},{x:x-s.x,y:y-s.y},c)};
  const casing=(a:V[],x:number,y:number,size:number,angle:number,c:[number,number,number,number])=>{const f={x:Math.cos(angle)*size,y:Math.sin(angle)*size},s={x:-Math.sin(angle)*size*.28,y:Math.cos(angle)*size*.28};tri(a,{x:x+f.x,y:y+f.y},{x:x+s.x,y:y+s.y},{x:x-f.x+s.x,y:y-f.y+s.y},c);tri(a,{x:x+f.x,y:y+f.y},{x:x-f.x+s.x,y:y-f.y+s.y},{x:x-f.x-s.x,y:y-f.y-s.y},c);tri(a,{x:x+f.x,y:y+f.y},{x:x-f.x-s.x,y:y-f.y-s.y},{x:x-s.x,y:y-s.y},[Math.min(1,c[0]*1.3),Math.min(1,c[1]*1.35),Math.min(1,c[2]*1.2),c[3]*.85]);};
  const orientedRect=(a:V[],x:number,y:number,halfLength:number,halfWidth:number,angle:number,c:[number,number,number,number])=>{const f={x:Math.cos(angle)*halfLength,y:Math.sin(angle)*halfLength},s={x:-Math.sin(angle)*halfWidth,y:Math.cos(angle)*halfWidth};tri(a,{x:x+f.x+s.x,y:y+f.y+s.y},{x:x-f.x+s.x,y:y-f.y+s.y},{x:x-f.x-s.x,y:y-f.y-s.y},c);tri(a,{x:x+f.x+s.x,y:y+f.y+s.y},{x:x-f.x-s.x,y:y-f.y-s.y},{x:x+f.x-s.x,y:y+f.y-s.y},c);};
  const towerShape=(a:V[],t:Vec2 & {kind:TowerKind;angle?:number},c:[number,number,number,number])=>{
    if(redAlert&&hasRedAlertSprite(t.kind,turretArt))return;
    const angle=t.angle??0,cell=4/TURRET_GRID;
    const palette:Record<TurretInk,[number,number,number,number]>={
      shadow:[.008,.01,.014,c[3]*.72],base:[.12,.14,.17,c[3]],dark:[c[0]*.18,c[1]*.2,c[2]*.22,c[3]],
      body:[c[0]*.62,c[1]*.68,c[2]*.7,c[3]],light:[Math.min(1,c[0]*1.15+.12),Math.min(1,c[1]*1.15+.12),Math.min(1,c[2]*1.15+.12),c[3]],
      accent:c,hot:[1,Math.min(1,c[1]+.2),Math.min(1,c[2]+.12),c[3]],
    };
    for(const pixel of turretPixelRects(t.kind)){
      const localX=(pixel.x+pixel.width/2-TURRET_GRID/2)*cell,localY=(pixel.y+pixel.height/2-TURRET_GRID/2)*cell;
      const x=t.x+Math.cos(angle)*localX-Math.sin(angle)*localY,y=t.y+Math.sin(angle)*localX+Math.cos(angle)*localY;
      orientedRect(a,x,y,pixel.width*cell/2,pixel.height*cell/2,angle,palette[pixel.ink]);
    }
  };
  const wireShape=(a:V[],wire:{x:number;y:number;width:number;height:number},c:[number,number,number,number],integrity:number,broken=false)=>{
    const damage=1-integrity,left=wire.x+.42,right=wire.x+wire.width-.42,top=wire.y+.48,bottom=wire.y+wire.height-.42,mid=wire.y+wire.height*.52;
    const dark:[number,number,number,number]=[c[0]*.25,c[1]*.27,c[2]*.28,c[3]*.9],shadow:[number,number,number,number]=[.015,.012,.01,.28*c[3]];
    rect(a,wire.x+.14,bottom-.02,wire.width-.28,.3,shadow);
    // Heavy end stakes anchor the silhouette and make adjacent cells join cleanly.
    for(const x of [left,right]){
      streak(a,x,bottom,damage*(x===left ? .18 : -.18),1,wire.height-.72,.12,dark);
      streak(a,x-.16,bottom+.12,x===left?-.72:.72,.34,.7,.11,dark);
      disc(a,x,top,.14,[Math.min(1,c[0]*1.18),Math.min(1,c[1]*1.18),Math.min(1,c[2]*1.18),c[3]],6);
    }
    if(broken){
      streak(a,wire.x+wire.width*.43,mid-.3,1,.16,wire.width*.34,.095,dark);
      streak(a,wire.x+wire.width*.57,mid+.35,-1,-.18,wire.width*.34,.095,dark);
      for(const [index,x] of [wire.x+1.05,wire.x+wire.width-1.05].entries())ring(a,x,mid+(index ? .18 : -.16),.58,[c[0],c[1],c[2],c[3]*.78],.1);
      return;
    }
    // Two twisted rails sag as integrity falls.
    for(const [index,y] of [wire.y+1.18,wire.y+2.78].entries()){
      const sag=damage*(index?-.34:.28);
      streak(a,right,y+sag,1,sag*.22,right-left,.085,index?dark:c);
      streak(a,right,y+.12+sag,1,-sag*.18,right-left,.035,[Math.min(1,c[0]*1.35),Math.min(1,c[1]*1.35),Math.min(1,c[2]*1.35),c[3]*.62]);
    }
    // Overlapping concertina loops read clearly as barbed wire at gameplay scale.
    const loops=Math.max(3,Math.round(wire.width/.92));
    for(let i=0;i<loops;i++){
      const x=left+(right-left)*(i+.5)/loops,y=mid+Math.sin(i*2.1)*damage*.18,missing=damage>.62&&i%3===1;
      if(missing){streak(a,x+.24,y+.15,.72,.26,.58,.07,[.18,.065,.018,.72]);continue;}
      ring(a,x,y,.61-damage*.08,[c[0],c[1],c[2],c[3]*(i%2 ? .72 : .9)],.075);
    }
    // Paired diagonal barbs catch the light without turning into a solid hatch.
    for(let i=0;i<6;i++){
      const x=left+.28+i*(right-left-.56)/5,y=i%2?wire.y+2.72:wire.y+1.18,flip=i%2?1:-1;
      streak(a,x,y,.55,flip,.34,.055,c);streak(a,x,y,-.55,flip,.34,.055,c);
    }
  };
  function geometry(scene:RenderScene): Float32Array { const a:V[]=[];
    const activeWires=(scene.wires??[]).filter(wire=>!wire.breached);
    if(!redAlert)for(const o of scene.map.obstacles){if(activeWires.some(wire=>sameRect(wire,o)))continue;rect(a,o.x-.22,o.y-.22,o.width+.44,o.height+.44,[.018,.021,.027,.78]);rect(a,o.x,o.y,o.width,o.height,[.13,.15,.19,.98]);rect(a,o.x+.38,o.y+.38,Math.max(0,o.width-.76),Math.max(0,o.height-.76),[.22,.25,.3,.92]);rect(a,o.x+.38,o.y+.38,Math.max(0,o.width-.76),.34,[.5,.57,.66,.42]);rect(a,o.x+o.width-.58,o.y+.45,.18,Math.max(0,o.height-.9),[.045,.052,.07,.74]);for(let y=o.y+2;y<o.y+o.height-1;y+=5)rect(a,o.x+.08,y,Math.min(.48,o.width*.16),1.5,[.95,.61,.12,.38]);}
    for(const wall of scene.walls??[]){
      const integrity=Math.max(0,Math.min(1,wall.health/wall.maxHealth)),damage=1-integrity;
      // The structural base is drawn from map obstacles above. These overlays make its condition legible at a glance.
      rect(a,wall.x+.16,wall.y+.16,wall.width-.32,wall.height-.32,[.012,.015,.019,(redAlert?0:.13)+damage*.68]);
      if(!redAlert){
      rect(a,wall.x+.48,wall.y+wall.height*.48,wall.width-.96,.14,[.7-damage*.48,.76-damage*.56,.79-damage*.6,.32+damage*.22]);
      for(const x of [wall.x+.62,wall.x+wall.width-.82])for(const y of [wall.y+.62,wall.y+wall.height-.82])disc(a,x,y,.12,[.85-damage*.62,.9-damage*.7,.91-damage*.72,.72]);
      }
      if(damage>.18){
        const alpha=Math.min(.94,(damage-.14)*1.25), cx=wall.x+wall.width*.53,cy=wall.y+wall.height*.46;
        streak(a,cx,cy,-.72,-1,1.25+damage*1.1,.075,[.008,.007,.006,alpha]);
        streak(a,cx-.52,cy-.68,.8,-.48,.7+damage*.55,.06,[.008,.007,.006,alpha*.9]);
        if(damage>.46){
          streak(a,cx+.24,cy+.35,.62,1,.95+damage*.75,.085,[.008,.007,.006,alpha]);
          streak(a,cx+.57,cy+.94,-.9,.24,.64,.055,[.008,.007,.006,alpha*.84]);
        }
        if(damage>.74){
          streak(a,wall.x+wall.width*.24,wall.y+wall.height*.3,.32,1,1.45,.1,[.005,.004,.003,alpha]);
          streak(a,wall.x+wall.width*.72,wall.y+wall.height*.68,-.46,-1,1.3,.095,[.005,.004,.003,alpha]);
          rect(a,wall.x+.3,wall.y+wall.height-.64,wall.width-.6,.22,[.05,.035,.023,.18+damage*.35]);
        }
      }
    }
    for(const wire of scene.wires??[]){
      if(redAlert?.hasWireSprites)continue;
      const integrity=Math.max(.03,Math.min(1,wire.health/wire.maxHealth)),damage=1-integrity;
      const color:[number,number,number,number]=wire.breached?[.17,.06,.022,.86]:[.68-damage*.43,.74-damage*.58,.72-damage*.62,.96];
      wireShape(a,wire,color,integrity,wire.breached);
      if(damage>.28&&!wire.breached){
        // Rust and a dark sagging lower rail appear well before the wire finally parts.
        streak(a,wire.x+.45,wire.y+wire.height*.72,1,.06,wire.width-.9,.065,[.12,.045,.014,.22+damage*.48]);
        for(let x=wire.x+.52;x<wire.x+wire.width-.25;x+=1.1)disc(a,x,wire.y+wire.height*(.3+((Math.floor(x*4)%3)*.18)),.09,[.2,.065,.015,.2+damage*.38],5);
      }
      if(wire.breached){
        streak(a,wire.x+wire.width*.2,wire.y+wire.height*.28,-1,.32,1.3,.12,[.1,.045,.02,.88]);
        streak(a,wire.x+wire.width*.8,wire.y+wire.height*.72,1,-.32,1.3,.12,[.1,.045,.02,.88]);
      }
    }
    rect(a,scene.map.spawn.x,scene.map.spawn.y,scene.map.spawn.width,scene.map.spawn.height,[.95,.48,.12,.11]); ring(a,scene.map.goal.x,scene.map.goal.y,scene.map.goalRadius,[.71,.98,.31,.85]);
    for(const t of scene.towers){const c: [number,number,number,number]=t.kind==='repulsor'?[.73,1,.22,.95]:t.kind==='mortar'?[1,.62,.16,.95]:t.kind==='autocannon'?[.28,.85,1,.95]:t.kind==='cryo'?[.4,.85,.95,.95]:t.kind==='tesla'?[.62,.45,1,.95]:t.kind==='rocket'?[1,.25,.15,.95]:t.kind==='incinerator'?[1,.31,.12,.95]:[.35,1,.78,.95];towerShape(a,t,c);if(scene.selection===t.id)ring(a,t.x,t.y,4.2,[1,.88,.4,.9],.35);}
    if(scene.ghost){const c: [number,number,number,number]=scene.ghost.valid?[.65,1,.25,.8]:[1,.18,.12,.8];ring(a,scene.ghost.x,scene.ghost.y,scene.ghost.range,c,.22);towerShape(a,scene.ghost,c);}
    if(scene.placementGhost){
      const pulse=.8+.2*Math.sin(scene.time*7),c:[number,number,number,number]=scene.placementGhost.valid?[.26,1,.78,.72*pulse]:[1,.13,.07,.78];
      rect(a,scene.placementGhost.x-.14,scene.placementGhost.y-.14,scene.placementGhost.width+.28,scene.placementGhost.height+.28,[c[0],c[1],c[2],.12*pulse]);
      rectOutline(a,scene.placementGhost.x-.08,scene.placementGhost.y-.08,scene.placementGhost.width+.16,scene.placementGhost.height+.16,[c[0],c[1],c[2],.62*pulse],.11);
      if(scene.placementGhost.kind==='wire'){
        if(!redAlert?.hasWireSprites)wireShape(a,scene.placementGhost,c,1);
        for(const x of [scene.placementGhost.x+.22,scene.placementGhost.x+scene.placementGhost.width-.22])for(const y of [scene.placementGhost.y+.22,scene.placementGhost.y+scene.placementGhost.height-.22])disc(a,x,y,.09,c,5);
      }else{
        rect(a,scene.placementGhost.x,scene.placementGhost.y,scene.placementGhost.width,scene.placementGhost.height,[c[0],c[1],c[2],.42]);
        rect(a,scene.placementGhost.x+.35,scene.placementGhost.y+.35,scene.placementGhost.width-.7,.25,c);
        rect(a,scene.placementGhost.x+.48,scene.placementGhost.y+scene.placementGhost.height*.48,scene.placementGhost.width-.96,.14,c);
      }
      if(!scene.placementGhost.valid){streak(a,scene.placementGhost.x+3.25,scene.placementGhost.y+3.25,1,1,3.45,.15,c);streak(a,scene.placementGhost.x+3.25,scene.placementGhost.y+.75,1,-1,3.45,.15,c);}
    }
    if(scene.wallGhost)rect(a,scene.wallGhost.x,scene.wallGhost.y,scene.wallGhost.width,scene.wallGhost.height,scene.wallGhost.valid?[.25,.85,.95,.5]:[1,.15,.08,.5]);
    if(scene.demolitionHover){const alpha=.78+.18*Math.sin(scene.time*8);rectOutline(a,scene.demolitionHover.x,scene.demolitionHover.y,scene.demolitionHover.width,scene.demolitionHover.height,[1,.06,.035,alpha],.42);}
    for(const e of scene.effects){const progress=Math.max(0,Math.min(1,1-e.duration/.55)),ease=1-(1-progress)*(1-progress),alpha=(1-progress)*(1-progress);const c:[number,number,number,number]=e.kind==='blast'?[1,.34,.055,.88*alpha]:e.kind==='slow'?[.25,.8,1,.56*alpha]:[.45,.95,1,.62*alpha];const radius=Math.max(.35,e.radius*(.05+.95*ease));disc(a,e.x,e.y,Math.max(.2,e.radius*.22*(1-progress)),[c[0],c[1],c[2],.16*alpha],12);ring(a,e.x,e.y,radius,c,Math.max(.18,e.radius*.085*(1-progress)));if(progress>.16)ring(a,e.x,e.y,radius*.72,[c[0],c[1],c[2],c[3]*.38],Math.max(.12,e.radius*.035));if(e.kind==='push'){const q={x:e.x+e.direction.x*radius,y:e.y+e.direction.y*radius};tri(a,{x:e.x-.7,y:e.y-.7},{x:e.x+.7,y:e.y+.7},q,[c[0],c[1],c[2],c[3]*.32])}}
    if(scene.boss){const c: [number,number,number,number]=scene.boss.phase===2?[1,.15,.04,.95]:scene.boss.phase===1?[.9,.72,.2,.95]:[.55,.78,1,.95];ring(a,scene.boss.x,scene.boss.y,2.5,c,.55);rect(a,scene.boss.x-3,scene.boss.y-4,6*Math.max(0,scene.boss.health/scene.boss.maxHealth),.45,c);}
    const data=new Float32Array(a.length*6);a.forEach((v,i)=>data.set([v.x,v.y,v.r,v.g,v.b,v.a],i*6));return data;
  }
  function foregroundGeometry(scene:RenderScene):Float32Array {const a:V[]=[];
    for(const projectile of scene.heavyProjectiles??[]){
      const local=projectile.age-projectile.delay;if(local<0)continue;const t=Math.max(0,Math.min(1,local/projectile.flight));
      const dx=projectile.target.x-projectile.x,dy=projectile.target.y-projectile.y,length=Math.max(.001,Math.hypot(dx,dy)),forward={x:dx/length,y:dy/length},side={x:-forward.y,y:forward.x};
      if(projectile.kind==='mortar'){
        const arc=Math.sin(t*Math.PI)*1.28*(projectile.serial%2 ? .72 : -.72),x=projectile.x+dx*t+side.x*arc,y=projectile.y+dy*t+side.y*arc;
        streak(a,x,y,forward.x,forward.y,1.65,.085,[1,.92,.18,.82]);streak(a,x-forward.x*.22,y-forward.y*.22,forward.x,forward.y,.82,.18,[1,.56,.055,.35]);
        casing(a,x,y,.59,projectile.serial*.71+local*24,[.25,.2,.105,1]);disc(a,x,y,.16,[.9,.68,.21,.72],7);
      }else{
        const x=projectile.x+dx*t,y=projectile.y+dy*t,angle=Math.atan2(forward.y,forward.x);
        for(let j=1;j<=6;j++){const lag=j*.045/projectile.flight;if(t<=lag*.45)continue;const u=Math.max(0,t-lag),jitter=Math.sin(projectile.serial*3.17+j*7.3)*(.08+j*.025),sx=projectile.x+dx*u+side.x*jitter,sy=projectile.y+dy*u+side.y*jitter,fade=(1-j/7)*Math.min(1,t*5);disc(a,sx,sy,.2+j*.075,[.29,.28,.26,.17*fade],9);disc(a,sx-side.x*.08,sy-side.y*.08,.12+j*.04,[.48,.45,.38,.09*fade],8);}
        streak(a,x-forward.x*.48,y-forward.y*.48,forward.x,forward.y,1.45,.12,[1,.73,.15,.76]);disc(a,x-forward.x*.78,y-forward.y*.78,.24,[1,.29,.025,.8],7);
        orientedRect(a,x,y,.78,.27,angle,[.19,.2,.17,1]);orientedRect(a,x+side.x*.07,y+side.y*.07,.55,.09,angle,[.65,.66,.56,.72]);
        const nose={x:x+forward.x*1.02,y:y+forward.y*1.02},left={x:x+forward.x*.67+side.x*.27,y:y+forward.y*.67+side.y*.27},right={x:x+forward.x*.67-side.x*.27,y:y+forward.y*.67-side.y*.27};tri(a,nose,left,right,[.77,.76,.64,1]);
      }
    }
    for(const explosion of scene.heavyExplosions??[]){
      const t=Math.max(0,Math.min(1,explosion.age/explosion.life)),age=explosion.age,s=explosion.scale,flash=Math.max(0,1-age/.075),fire=Math.max(0,1-age/.38),smoke=Math.sin(Math.PI*Math.min(1,t*1.12));
      if(flash>0){disc(a,explosion.x,explosion.y,(.65+age*19)*s,[1,1,.78,.68*flash],14);disc(a,explosion.x,explosion.y,(.35+age*10)*s,[1,1,1,.92*flash],12);}
      if(fire>0){ring(a,explosion.x,explosion.y,(1.25+age*10)*s,[1,.38,.035,.72*fire],Math.max(.16,(.58-age)*s));disc(a,explosion.x,explosion.y,(1.35+age*5)*s,[1,.19,.018,.28*fire],12);}
      for(let j=0;j<7;j++){const angle=j/7*Math.PI*2+explosion.serial*.73,radius=(.35+t*(2.3+(j%3)*.48))*s,x=explosion.x+Math.cos(angle)*radius,y=explosion.y+Math.sin(angle)*radius,cloud=(.72+t*(1.6+(j%2)*.42))*s;disc(a,x,y,cloud,[.2+(j%2)*.035,.19,.18,.2*smoke*(1-t*.72)],10);if(t<.5)disc(a,x-Math.cos(angle)*.16,y-Math.sin(angle)*.16,cloud*.48,[1,.42,.045,.26*fire],8);}
      if(age>.035&&age<.42)ring(a,explosion.x,explosion.y,(1.8+age*22)*s,[.75,.68,.55,.18*(1-age/.42)],Math.max(.08,.22*(1-age/.42)));
    }
    for(const p of scene.visualParticles??[]){const t=Math.max(0,Math.min(1,p.age/p.life)),x=p.x+p.vx*p.age*(1-p.drag*t),y=p.y+p.vy*p.age+.5*p.gravity*p.age*p.age,fade=(1-t)*(1-t),c:[number,number,number,number]=[p.color[0],p.color[1],p.color[2],fade];if(p.style==='smoke'){const bloom=Math.sin(Math.PI*t),size=p.size*(.55+1.55*t);disc(a,x,y,size,[c[0],c[1],c[2],bloom*.22],10);disc(a,x-size*.28,y+size*.12,size*.62,[c[0]*.7,c[1]*.72,c[2]*.75,bloom*.14],9);}else if(p.style==='mist'){const size=p.size*(.7+1.15*t);disc(a,x,y,size,[c[0],c[1],c[2],fade*.16],10);ring(a,x,y,size,[c[0],c[1],c[2],fade*.28],Math.max(.08,size*.14));}else if(p.style==='shell'){casing(a,x,y,p.size*(1-.16*t),p.spin*p.age,c);}else if(p.style==='debris'){shard(a,x,y,p.size*(1-.3*t),p.spin*p.age,c);}else{streak(a,x,y,p.vx,p.vy,Math.max(.35,p.size*3.2*(1-t)),Math.max(.06,p.size*.22),c);disc(a,x,y,p.size*.52,[1,Math.min(1,p.color[1]+.18),Math.min(1,p.color[2]+.1),fade*.9],7);}}
    const data=new Float32Array(a.length*6);a.forEach((v,i)=>data.set([v.x,v.y,v.r,v.g,v.b,v.a],i*6));return data;
  }
  return { encode(encoder,scene){
      if(world.width!==scene.map.width||world.height!==scene.map.height){world={width:scene.map.width,height:scene.map.height};clampCamera();}
      resize();const v=view(),shake=scene.cameraShake??0,shakeX=Math.sin(scene.time*83.7)*shake,shakeY=Math.cos(scene.time*71.3)*shake*.7;
      device.queue.writeBuffer(uniform,0,new Float32Array([pixelW,pixelH,0,0,camera.x+shakeX,camera.y+shakeY,v.width,v.height,scene.time,scene.heatmap?1:0,0,0,0,0,0,0]));
      const visual=new Float32Array(Math.max(1,Math.min(MAX_TOWERS,scene.towers.length))*4);
      scene.towers.slice(0,MAX_TOWERS).forEach((t,i)=>visual.set([t.x,t.y,t.id,towerBehavior(t.kind)+WEAPON_KINDS.indexOf(t.kind)/100],i*4));device.queue.writeBuffer(towerVisuals,0,visual);
      redAlert?.prepare(scene);
      shamblers.prepare(encoder,scene);
      if(scene.aftermathVisible!==false)aftermath?.prepare(scene);
      const data=geometry(scene),fx=foregroundGeometry(scene);
      if(data.length/6>overlayCapacity){const previous=overlays;overlayCapacity=2**Math.ceil(Math.log2(data.length/6));overlays=device.createBuffer({label:'Tactical overlays',size:overlayCapacity*24,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});previous.destroy();}
      if(fx.length/6>foregroundCapacity){const previous=foreground;foregroundCapacity=2**Math.ceil(Math.log2(fx.length/6));foreground=device.createBuffer({label:'Foreground effects',size:foregroundCapacity*24,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});previous.destroy();}
      if(data.byteLength)device.queue.writeBuffer(overlays,0,data.buffer,data.byteOffset,data.byteLength);if(fx.byteLength)device.queue.writeBuffer(foreground,0,fx.buffer,fx.byteOffset,fx.byteLength);
      const target=context.getCurrentTexture().createView();
      let pass=encoder.beginRenderPass({colorAttachments:[{view:target,clearValue:{r:.075,g:.075,b:.078,a:1},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(bg);pass.setBindGroup(0,cameraBG);pass.draw(3);
      redAlert?.drawTerrain(pass);
      if(scene.aftermathVisible!==false)aftermath?.ground(pass);
      pass.setPipeline(overlay);pass.setBindGroup(0,cameraOverlay);pass.setVertexBuffer(0,overlays);pass.draw(data.length/6);
      redAlert?.drawTowers(pass);
      pass.setPipeline(particles);pass.setBindGroup(0,cameraParticles);pass.draw(48,Math.min(scene.count,shared.capacity));
      pass.end();shamblers.draw(encoder,target,pixelW,pixelH,scene.count);
      pass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'load',storeOp:'store'}]});
      if(scene.aftermathVisible!==false)aftermath?.air(pass);
      pass.setPipeline(overlay);pass.setBindGroup(0,cameraOverlay);pass.setVertexBuffer(0,foreground);pass.draw(fx.length/6);
      if(shared.shotState){pass.setPipeline(cues);pass.setBindGroup(0,cameraCues);pass.draw(72,Math.min(MAX_TOWERS,scene.towers.length));}tesla?.draw(pass,scene.count,scene.towers.length);pass.end();
    },
    screenToWorld,
    worldToScreen,
    pan(dx,dy){camera.x+=dx;camera.y+=dy;clampCamera();},
    zoomAt(factor,clientX,clientY){const before=screenToWorld(clientX,clientY);camera.zoom=Math.max(1,Math.min(5,camera.zoom*factor));const after=screenToWorld(clientX,clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;clampCamera();},
    clearAftermath(){aftermath?.reset();},
    destroy(){aftermath?.destroy();tesla?.destroy();emptyTesla?.destroy();shamblers.destroy();redAlert?.destroy();uniform.destroy();overlays.destroy();foreground.destroy();towerVisuals.destroy();emptyShots.destroy();}
  };
}
