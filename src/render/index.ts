import {screenToWorld as unproject, worldToScreen as project} from './camera.ts';
import { towerBehavior } from '../content/index.ts';
import { PARTICLE_WGSL, type RenderScene, type Renderer, type SharedGPU, type Vec2 } from '../contracts/index.ts';

const W = 160, H = 100, MAX_OVERLAY_VERTICES = 24000, MAX_TOWERS = 64;
type V = { x:number; y:number; r:number; g:number; b:number; a:number };

/** GPU-only visualizer. Particle bodies remain in the shared simulation buffer. */
export async function createRenderer(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, shared: SharedGPU, canvas: HTMLCanvasElement): Promise<Renderer> {
  const uniform = device.createBuffer({ label:'Render camera', size:64, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const overlays = device.createBuffer({ label:'Tactical overlays', size:MAX_OVERLAY_VERTICES * 24, usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
  const towerVisuals = device.createBuffer({ label:'Tower visual state', size:MAX_TOWERS * 16, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST });
  const emptyShots = device.createBuffer({ label:'Empty firing state', size:MAX_TOWERS * 48, usage:GPUBufferUsage.STORAGE });
  const particleModule = device.createShaderModule({code:`
${PARTICLE_WGSL}
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> };
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage,read> particles: array<Particle>;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) color: vec4<f32>, @location(2) bloodMode: f32 };
fn world(p:vec2<f32>)->vec2<f32>{ let aspect=camera.viewport.x/max(1.0,camera.viewport.y); let targetAspect=camera.world.z/camera.world.w; let sx=min(1.0,targetAspect/aspect); let sy=min(1.0,aspect/targetAspect); return vec2((((p.x-camera.world.x)/camera.world.z)*2.0-1.0)*sx, (1.0-((p.y-camera.world.y)/camera.world.w)*2.0)*sy); }
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {
  let corners=array<vec2<f32>,6>(vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  let shard=vi/6u; let c=corners[vi%6u]; let p=particles[ii]; let dead=p.state.w<-.5; var radius=max(.27,p.body.x*1.18);
  var o:Out; o.local=c; o.bloodMode=0.;
  if(dead){ let age=max(0.,camera.time.x-(-p.body.w)/60.);let seed=f32(ii)*17.+f32(shard)*2.4;let flight=clamp(age/.78,0.,1.);let dir=vec2(cos(seed),sin(seed));let stain=shard==0u;let mist=shard>4u;let speed=select(.85+fract(seed*3.1)*2.2,.38+fract(seed)*.8,mist);let center=select(p.pos.xy+dir*(.18+speed*flight)+vec2(0.,age*age*.7),p.pos.xy,stain);radius=select(max(.07,p.body.x*(.36+.72*(1.-flight))*select(1.,.62,mist)),max(.38,p.body.x*3.25),stain);let life=select(max(0.,1.-age/select(.95,.62,mist)),max(0.,1.-age/18.),stain);o.pos=vec4(world(center+c*radius),0,1);o.color=vec4(select(.42+.3*sin(seed),.7+.18*sin(seed*2.),mist),.008,.004,life*select(.9,.42,stain));o.bloodMode=select(2.,1.,stain);return o; }
  if(shard>0u){o.pos=vec4(2.,2.,0.,1.);o.color=vec4(0.);return o;}
  let speed=length(p.pos.zw);let forward=select(vec2(1.,0.),p.pos.zw/max(.001,speed),speed>.02);let side=vec2(-forward.y,forward.x);let breathe=1.+.055*sin(camera.time.x*5.5+f32(ii)*.37);let offset=(forward*c.x*(1.03+min(.28,speed*.035))+side*c.y*.92)*radius*breathe;let q=world(p.pos.xy+offset);o.pos=vec4(q,0,1);
  let k=u32(p.state.z + 0.5); var col=vec3(0.77,0.85,0.68);
  if(k==1u){col=vec3(.96,.72,.25);} if(k==2u){col=vec3(.78,.32,.2);}
  let hp=clamp(p.body.z/max(0.001,p.body.w),0.0,1.0); let pressure=clamp(max(p.state.y,p.state.x)*.018,0.0,1.0);
  // time.y is the heatmap switch: data comes solely from this particle's pressure/packing fields.
  if(camera.time.y > .5){ col=mix(col,vec3(1.0,0.12,0.03),pressure); }
  o.color=vec4(col*(.42+.58*hp)+pressure*vec3(.06,.025,0.),p.state.w); return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{let d=length(i.local);let blood=i.bloodMode>.5;let irregular=.045*sin(i.local.x*13.+i.local.y*7.)+.035*sin(i.local.y*19.);let edge=select(1.,1.+irregular,blood);if(d>edge||i.color.a<.02){discard;}var alpha=i.color.a*(1.-smoothstep(edge-.16,edge,d));if(i.bloodMode>1.5){alpha*=.72+.28*sin((i.local.x-i.local.y)*12.);}let light=max(0.,dot(normalize(i.local+vec2(.001)),normalize(vec2(-.65,-.75))));let rim=smoothstep(.62,.98,d);let col=select(i.color.rgb*(.82+.18*light)+vec3(.07)*light*light,mix(i.color.rgb,vec3(.16,.002,0.),rim*.35),blood);return vec4(col,alpha);}
`});
  const overlayModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
struct I { @location(0) pos:vec2<f32>, @location(1) color:vec4<f32> }; struct O { @builtin(position) pos:vec4<f32>, @location(0) color:vec4<f32> };
@vertex fn vs(i:I)->O { let aspect=camera.viewport.x/max(1.,camera.viewport.y);let targetAspect=camera.world.z/camera.world.w;let sx=min(1.,targetAspect/aspect);let sy=min(1.,aspect/targetAspect);var o:O; o.pos=vec4((((i.pos.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((i.pos.y-camera.world.y)/camera.world.w)*2.)*sy,0,1);o.color=i.color;return o; }
@fragment fn fs(i:O)->@location(0) vec4<f32>{return i.color;}`});
  const cueModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> };
struct TowerState { timing:vec4<f32>, shot:vec4<f32>, flags:vec4<f32> };
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> states:array<TowerState>;
@group(0) @binding(2) var<storage,read> towers:array<vec4<f32>>;
struct Out { @builtin(position) pos:vec4<f32>, @location(0) local:vec2<f32>, @location(1) kind:f32, @location(2) age:f32, @location(3) shard:f32, @location(4) weapon:f32 };
fn clip(p:vec2<f32>)->vec2<f32>{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let targetAspect=camera.world.z/camera.world.w;let sx=min(1.,targetAspect/aspect);let sy=min(1.,aspect/targetAspect);return vec2((((p.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((p.y-camera.world.y)/camera.world.w)*2.)*sy);}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {let c=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));let shard=vi/6u;let q=c[vi%6u];let s=states[ii];let t=towers[ii];let kind=floor(t.w+.001);let weapon=round(fract(t.w)*100.);let valid=s.shot.x>.5&&s.timing.y>0.&&abs(s.flags.x-t.z)<.5;let age=select(2.,clamp((s.timing.y-s.timing.x)/.22,0.,1.),valid);let aim=s.timing.zw;let d=aim-t.xy;let len=max(.1,length(d));let forward=d/len;let side=vec2(-forward.y,forward.x);let seed=f32(shard)*2.399+f32(ii)*.71;let burst=vec2(cos(seed),sin(seed));var p:vec2<f32>;
 if(shard==0u){if(kind==1.){let r=max(1.2,min(7.,len*.16))*(.45+.7*age);p=aim+q*r;}else if(kind==0.){p=t.xy+q*(2.2+age*(2.1+len*.025));}else if(kind==2.){p=t.xy+forward*((q.x+1.)*.5*len)+side*q.y*(.11+.18*(1.-age));}else{p=t.xy+forward*((q.x+1.)*.5*len)+side*q.y*select(.32,2.2,kind==3.);}}else{let impact=select(t.xy+forward*min(3.,len*.18),aim,kind==1.||kind==2.);let distance=(.25+age*3.2)*(.55+fract(seed*.83));p=impact+burst*distance+q*vec2(.16,.5+f32(shard)*.025)*(1.-age*.35);}
 var o:Out;o.pos=vec4(clip(p),0,1);o.local=q;o.kind=kind;o.age=age;o.shard=f32(shard);o.weapon=weapon;return o;}
fn weaponColor(w:f32)->vec3<f32>{if(w<.5){return vec3(.55,1.,.28);}if(w<1.5){return vec3(1.,.46,.11);}if(w<2.5){return vec3(1.,.84,.24);}if(w<3.5){return vec3(.42,.9,1.);}if(w<4.5){return vec3(.7,.38,1.);}if(w<5.5){return vec3(1.,.18,.055);}return vec3(.3,1.,.78);}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{if(i.age>1.){discard;}let d=length(i.local);let fade=(1.-i.age)*(1.-i.age);let col=weaponColor(i.weapon);var a=0.;if(i.shard>0.){a=(1.-smoothstep(.15,.9,abs(i.local.x)))*(1.-smoothstep(.28,1.,abs(i.local.y)))*fade*(.86-i.shard*.035);return vec4(mix(vec3(1.,.92,.58),col,.62),max(0.,a));}if(i.kind==1.){a=(1.-smoothstep(.7,1.,d))*smoothstep(.08,.35,d)*fade;}else if(i.kind==2.){a=(1.-smoothstep(.48,1.,abs(i.local.y)))*(.72+.28*sin(i.local.x*18.))*fade;}else if(i.kind==3.){a=(1.-smoothstep(.3,1.,abs(i.local.y)))*smoothstep(-1.,.05,i.local.x)*fade*.82;}else{a=smoothstep(.96,.28,d)*fade*.72;}return vec4(col,a);}`});
  const bgModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
@vertex fn vs(@builtin(vertex_index) v:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));return vec4(p[v],0,1);}
@fragment fn fs(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{let keepBinding=camera.viewport.x*0.;return vec4(vec3(.075+keepBinding),1.);}`});
  const bg=device.createRenderPipeline({layout:'auto',vertex:{module:bgModule,entryPoint:'vs'},fragment:{module:bgModule,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
  const particles=device.createRenderPipeline({layout:'auto',vertex:{module:particleModule,entryPoint:'vs'},fragment:{module:particleModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},multisample:{count:1}});
  const overlay=device.createRenderPipeline({layout:'auto',vertex:{module:overlayModule,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module:overlayModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const cues=device.createRenderPipeline({layout:'auto',vertex:{module:cueModule,entryPoint:'vs'},fragment:{module:cueModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const cameraBG=device.createBindGroup({layout:bg.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  const cameraParticles=device.createBindGroup({layout:particles.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:shared.particles}}]});
  const cameraOverlay=device.createBindGroup({layout:overlay.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  const cameraCues=device.createBindGroup({layout:cues.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:shared.shotState ?? emptyShots}},{binding:2,resource:{buffer:towerVisuals}}]});
  let pixelW=0,pixelH=0;
  let camera={x:0,y:0,zoom:1};
  const view=()=>({width:W/camera.zoom,height:H/camera.zoom});
  const clampCamera=()=>{const v=view();camera.x=Math.max(0,Math.min(W-v.width,camera.x));camera.y=Math.max(0,Math.min(H-v.height,camera.y));};
  const resize=()=>{const d=Math.min(devicePixelRatio||1,2),max=device.limits.maxTextureDimension2D; const w=Math.max(1,Math.min(max,Math.round(canvas.clientWidth*d))),h=Math.max(1,Math.min(max,Math.round(canvas.clientHeight*d))); if(w!==pixelW||h!==pixelH){pixelW=w;pixelH=h;canvas.width=w;canvas.height=h;context.configure({device,format,alphaMode:'opaque'});} };
  const screenToWorld=(clientX:number,clientY:number):Vec2=>unproject({x:clientX,y:clientY},canvas.getBoundingClientRect(),camera);
  const worldToScreen=(x:number,y:number):Vec2=>project({x,y},canvas.getBoundingClientRect(),camera);
  const push=(a:V[],x:number,y:number,c:[number,number,number,number])=>a.push({x,y,r:c[0],g:c[1],b:c[2],a:c[3]});
  const tri=(a:V[], p:Vec2,q:Vec2,r:Vec2,c:[number,number,number,number])=>{push(a,p.x,p.y,c);push(a,q.x,q.y,c);push(a,r.x,r.y,c)};
  const rect=(a:V[],x:number,y:number,w:number,h:number,c:[number,number,number,number])=>{tri(a,{x,y},{x:x+w,y},{x,y:y+h},c);tri(a,{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},c)};
  const ring=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],width=0.65)=>{const n=28;for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;const p=(rr:number,t:number)=>({x:x+Math.cos(t)*rr,y:y+Math.sin(t)*rr});tri(a,p(rad-width,u),p(rad-width,v),p(rad,v),c);tri(a,p(rad-width,u),p(rad,v),p(rad,u),c)}};
  const disc=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],n=10)=>{for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;tri(a,{x,y},{x:x+Math.cos(u)*rad,y:y+Math.sin(u)*rad},{x:x+Math.cos(v)*rad,y:y+Math.sin(v)*rad},c)}};
  const streak=(a:V[],x:number,y:number,vx:number,vy:number,length:number,width:number,c:[number,number,number,number])=>{const m=Math.max(.001,Math.hypot(vx,vy)),dx=vx/m*length,dy=vy/m*length,sx=-dy/m*width,sy=dx/m*width;tri(a,{x:x-dx+sx,y:y-dy+sy},{x:x-dx-sx,y:y-dy-sy},{x:x+sx,y:y+sy},c);tri(a,{x:x-dx-sx,y:y-dy-sy},{x:x-sx,y:y-sy},{x:x+sx,y:y+sy},c)};
  const shard=(a:V[],x:number,y:number,size:number,angle:number,c:[number,number,number,number])=>{const f={x:Math.cos(angle)*size,y:Math.sin(angle)*size},s={x:-Math.sin(angle)*size*.55,y:Math.cos(angle)*size*.55};tri(a,{x:x+f.x,y:y+f.y},{x:x+s.x,y:y+s.y},{x:x-f.x-s.x*.25,y:y-f.y-s.y*.25},c);tri(a,{x:x+f.x,y:y+f.y},{x:x-f.x-s.x*.25,y:y-f.y-s.y*.25},{x:x-s.x,y:y-s.y},c)};
  const diamond=(a:V[],x:number,y:number,size:number,c:[number,number,number,number])=>{tri(a,{x,y:y-size},{x:x+size,y},{x,y:y+size},c);tri(a,{x,y:y-size},{x,y:y+size},{x:x-size,y},c)};
  const towerShape=(a:V[],t:Vec2 & {kind:string;level?:number},c:[number,number,number,number])=>{const s=1.65+(t.level??0)*.12;if(t.kind==='repulsor'||t.kind==='rocket')tri(a,{x:t.x,y:t.y-s},{x:t.x+s,y:t.y+s},{x:t.x-s,y:t.y+s},c);else if(t.kind==='mortar'||t.kind==='tesla')rect(a,t.x-s,t.y-s,s*2,s*2,c);else if(t.kind==='autocannon'||t.kind==='railgun')diamond(a,t.x,t.y,s,c);else if(t.kind==='incinerator'){tri(a,{x:t.x,y:t.y-s},{x:t.x+s,y:t.y+s*.7},{x:t.x-s,y:t.y+s*.7},c);rect(a,t.x-s*.25,t.y-s*.1,s*.5,s*1.1,c);}else{rect(a,t.x-s*.38,t.y-s,s*.76,s*2,c);rect(a,t.x-s,t.y-s*.38,s*2,s*.76,c);}};
  function geometry(scene:RenderScene): Float32Array { const a:V[]=[];
    for(const o of scene.map.obstacles){rect(a,o.x-.22,o.y-.22,o.width+.44,o.height+.44,[.018,.021,.027,.78]);rect(a,o.x,o.y,o.width,o.height,[.13,.15,.19,.98]);rect(a,o.x+.38,o.y+.38,Math.max(0,o.width-.76),Math.max(0,o.height-.76),[.22,.25,.3,.92]);rect(a,o.x+.38,o.y+.38,Math.max(0,o.width-.76),.34,[.5,.57,.66,.42]);rect(a,o.x+o.width-.58,o.y+.45,.18,Math.max(0,o.height-.9),[.045,.052,.07,.74]);for(let y=o.y+2;y<o.y+o.height-1;y+=5)rect(a,o.x+.08,y,Math.min(.48,o.width*.16),1.5,[.95,.61,.12,.38]);}
    for(const wire of scene.wires??[]){const integrity=Math.max(.15,wire.health/wire.maxHealth),color:[number,number,number,number]=wire.breached?[.8,.12,.05,.55*integrity]:[.95,.45,.08,.8*integrity];rect(a,wire.x,wire.y+wire.height*.18,wire.width,wire.height*.12,color);rect(a,wire.x,wire.y+wire.height*.7,wire.width,wire.height*.12,color);for(let x=wire.x+.35;x<wire.x+wire.width;x+=.75)streak(a,x,wire.y+wire.height*.76,1,-1,.66,.055,[1,.72,.22,.62*integrity]);}
    rect(a,scene.map.spawn.x,scene.map.spawn.y,scene.map.spawn.width,scene.map.spawn.height,[.95,.48,.12,.11]); ring(a,scene.map.goal.x,scene.map.goal.y,scene.map.goalRadius,[.71,.98,.31,.85]);
    for(const t of scene.towers){const c: [number,number,number,number]=t.kind==='repulsor'?[.73,1,.22,.95]:t.kind==='mortar'?[1,.62,.16,.95]:t.kind==='autocannon'?[.28,.85,1,.95]:t.kind==='cryo'?[.4,.85,.95,.95]:t.kind==='tesla'?[.62,.45,1,.95]:t.kind==='rocket'?[1,.25,.15,.95]:t.kind==='incinerator'?[1,.31,.12,.95]:[.35,1,.78,.95];towerShape(a,t,c);if(scene.selection===t.id)ring(a,t.x,t.y,4.2,[1,.88,.4,.9],.35);}
    if(scene.ghost){const c: [number,number,number,number]=scene.ghost.valid?[.65,1,.25,.8]:[1,.18,.12,.8];ring(a,scene.ghost.x,scene.ghost.y,scene.ghost.range,c,.22);towerShape(a,scene.ghost,c);}
    if(scene.wallGhost)rect(a,scene.wallGhost.x,scene.wallGhost.y,scene.wallGhost.width,scene.wallGhost.height,scene.wallGhost.valid?[.25,.85,.95,.5]:[1,.15,.08,.5]);
    for(const e of scene.effects){const progress=Math.max(0,Math.min(1,1-e.duration/.55)),ease=1-(1-progress)*(1-progress),alpha=(1-progress)*(1-progress);const c:[number,number,number,number]=e.kind==='blast'?[1,.34,.055,.88*alpha]:e.kind==='slow'?[.25,.8,1,.56*alpha]:[.45,.95,1,.62*alpha];const radius=Math.max(.35,e.radius*(.05+.95*ease));disc(a,e.x,e.y,Math.max(.2,e.radius*.22*(1-progress)),[c[0],c[1],c[2],.16*alpha],12);ring(a,e.x,e.y,radius,c,Math.max(.18,e.radius*.085*(1-progress)));if(progress>.16)ring(a,e.x,e.y,radius*.72,[c[0],c[1],c[2],c[3]*.38],Math.max(.12,e.radius*.035));if(e.kind==='push'){const q={x:e.x+e.direction.x*radius,y:e.y+e.direction.y*radius};tri(a,{x:e.x-.7,y:e.y-.7},{x:e.x+.7,y:e.y+.7},q,[c[0],c[1],c[2],c[3]*.32])}}
    for(const p of scene.visualParticles??[]){const t=Math.max(0,Math.min(1,p.age/p.life)),x=p.x+p.vx*p.age*(1-p.drag*t),y=p.y+p.vy*p.age+.5*p.gravity*p.age*p.age,fade=(1-t)*(1-t),c:[number,number,number,number]=[p.color[0],p.color[1],p.color[2],fade];if(p.style==='smoke'){const bloom=Math.sin(Math.PI*t),size=p.size*(.55+1.55*t);disc(a,x,y,size,[c[0],c[1],c[2],bloom*.22],10);disc(a,x-size*.28,y+size*.12,size*.62,[c[0]*.7,c[1]*.72,c[2]*.75,bloom*.14],9);}else if(p.style==='mist'){const size=p.size*(.7+1.15*t);disc(a,x,y,size,[c[0],c[1],c[2],fade*.16],10);ring(a,x,y,size,[c[0],c[1],c[2],fade*.28],Math.max(.08,size*.14));}else if(p.style==='debris'){shard(a,x,y,p.size*(1-.3*t),p.spin*p.age,c);}else{streak(a,x,y,p.vx,p.vy,Math.max(.35,p.size*3.2*(1-t)),Math.max(.06,p.size*.22),c);disc(a,x,y,p.size*.52,[1,Math.min(1,p.color[1]+.18),Math.min(1,p.color[2]+.1),fade*.9],7);}}
    if(scene.boss){const c: [number,number,number,number]=scene.boss.phase===2?[1,.15,.04,.95]:scene.boss.phase===1?[.9,.72,.2,.95]:[.55,.78,1,.95];ring(a,scene.boss.x,scene.boss.y,2.5,c,.55);rect(a,scene.boss.x-3,scene.boss.y-4,6*Math.max(0,scene.boss.health/scene.boss.maxHealth),.45,c);}
    const capped=a.slice(0,MAX_OVERLAY_VERTICES); const data=new Float32Array(capped.length*6);capped.forEach((v,i)=>data.set([v.x,v.y,v.r,v.g,v.b,v.a],i*6));return data;
  }
  return { encode(encoder,scene){resize(); const v=view(); const u=new Float32Array([pixelW,pixelH,0,0,camera.x,camera.y,v.width,v.height,scene.time,scene.heatmap?1:0,0,0,0,0,0,0]);device.queue.writeBuffer(uniform,0,u);const visual=new Float32Array(Math.max(1,Math.min(MAX_TOWERS,scene.towers.length))*4),weaponKinds=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun'];scene.towers.slice(0,MAX_TOWERS).forEach((t,i)=>visual.set([t.x,t.y,t.id,towerBehavior(t.kind)+weaponKinds.indexOf(t.kind)/100],i*4));device.queue.writeBuffer(towerVisuals,0,visual);const data=geometry(scene);if(data.byteLength)device.queue.writeBuffer(overlays,0,data.buffer,data.byteOffset,data.byteLength);const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.075,g:.075,b:.078,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(bg);pass.setBindGroup(0,cameraBG);pass.draw(3);pass.setPipeline(overlay);pass.setBindGroup(0,cameraOverlay);pass.setVertexBuffer(0,overlays);pass.draw(data.length/6);pass.setPipeline(particles);pass.setBindGroup(0,cameraParticles);pass.draw(48,Math.min(scene.count,shared.capacity));if(shared.shotState){pass.setPipeline(cues);pass.setBindGroup(0,cameraCues);pass.draw(72,Math.min(MAX_TOWERS,scene.towers.length));}pass.end(); },
    screenToWorld,
    worldToScreen,
    pan(dx,dy){camera.x+=dx;camera.y+=dy;clampCamera();},
    zoomAt(factor,clientX,clientY){const before=screenToWorld(clientX,clientY);camera.zoom=Math.max(1,Math.min(5,camera.zoom*factor));const after=screenToWorld(clientX,clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;clampCamera();},
    destroy(){uniform.destroy();overlays.destroy();towerVisuals.destroy();emptyShots.destroy();}
  };
}
