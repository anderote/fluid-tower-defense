import { towerBehavior } from '../content/index.ts';
import { PARTICLE_WGSL, type RenderScene, type Renderer, type SharedGPU, type Vec2 } from '../contracts/index.ts';

const W = 160, H = 100, MAX_OVERLAY_VERTICES = 12000, MAX_TOWERS = 64;
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
  let shard=vi/6u; let c=corners[vi%6u]; let p=particles[ii]; let dead=p.state.w<-.5; var radius=p.body.x;
  var o:Out; o.local=c; o.bloodMode=0.;
  if(dead){ let age=max(0.,camera.time.x-(-p.body.w)/60.);let seed=f32(ii)*17.+f32(shard)*2.4;let flight=clamp(age/.72,0.,1.);let dir=vec2(cos(seed),sin(seed));let stain=shard==0u;let mist=shard>4u;let speed=select(.6+fract(seed*3.1)*1.65,.3+fract(seed)*.65,mist);let center=select(p.pos.xy+dir*(.18+speed*flight)+vec2(0.,age*age*.55),p.pos.xy,stain);radius=select(max(.055,p.body.x*(.28+.56*(1.-flight))*select(1.,.58,mist)),max(.28,p.body.x*2.7),stain);let life=select(max(0.,1.-age/select(.82,.52,mist)),max(0.,1.-age/16.),stain);o.pos=vec4(world(center+c*radius),0,1);o.color=vec4(select(.48+.35*sin(seed),.72+.2*sin(seed*2.),mist),.008,.004,life*select(.85,.38,stain));o.bloodMode=select(2.,1.,stain);return o; }
  if(shard>0u){o.pos=vec4(2.,2.,0.,1.);o.color=vec4(0.);return o;}let q=world(p.pos.xy + c*radius); o.pos=vec4(q,0,1);
  let k=u32(p.state.z + 0.5); var col=vec3(0.77,0.85,0.68);
  if(k==1u){col=vec3(1.0,0.61,0.25);} if(k==2u){col=vec3(0.74,0.35,0.18);}
  let hp=clamp(p.body.z/max(0.001,p.body.w),0.0,1.0); let pressure=clamp(max(p.state.y,p.state.x)*.018,0.0,1.0);
  // time.y is the heatmap switch: data comes solely from this particle's pressure/packing fields.
  if(camera.time.y > .5){ col=mix(col,vec3(1.0,0.12,0.03),pressure); }
  o.color=vec4(col*(0.45+0.55*hp),p.state.w); return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{ let d=dot(i.local,i.local); let blood=i.bloodMode>.5; let droplets=sin(i.local.x*11.)*sin(i.local.y*13.); if(d>1.0 || i.color.a<.02 || (blood && droplets<-.25)){discard;} let rim=smoothstep(.58,.98,d); return vec4(mix(i.color.rgb,vec3(1.0,.9,.65),select(rim*.18,0.,blood)),i.color.a); }
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
struct Out { @builtin(position) pos:vec4<f32>, @location(0) local:vec2<f32>, @location(1) kind:f32, @location(2) fresh:f32, @location(3) shard:f32 };
fn clip(p:vec2<f32>)->vec2<f32>{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let targetAspect=camera.world.z/camera.world.w;let sx=min(1.,targetAspect/aspect);let sy=min(1.,aspect/targetAspect);return vec2((((p.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((p.y-camera.world.y)/camera.world.w)*2.)*sy);}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {let c=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));let shard=vi/6u;let q=c[vi%6u];let s=states[ii];let t=towers[ii];let kind=t.w;let fresh=select(0.,1.,s.shot.x>.5 && s.timing.y>0. && s.timing.y-s.timing.x<.20 && abs(s.flags.x-t.z)<.5);let aim=s.timing.zw;let d=aim-t.xy;let len=max(.1,length(d));let forward=d/len;let side=vec2(-forward.y,forward.x);let seed=f32(shard)*2.399+f32(ii)*.71;let burst=vec2(cos(seed),sin(seed));var p:vec2<f32>;var scale=1.;
 if(shard==0u){if(kind==1.){p=aim+q*max(2.5,min(8.,len*.18));}else if(kind==0.){p=t.xy+q*(3.5+len*.04);}else if(kind==2.){p=aim+q*vec2(1.7,.16);}else{p=t.xy+forward*((q.x+1.)*.5*len)+side*q.y*select(.35,2.4,kind==3.);}}else{let impact=select(t.xy+forward*min(3.,len*.18),aim,kind==1.||kind==2.);let distance=.65+f32(shard)*.48;p=impact+burst*distance+q*vec2(.12, .42+f32(shard)*.025);scale=.32+fract(seed)*.28;}
 var o:Out;o.pos=vec4(clip(p),0,1);o.local=q;o.kind=kind;o.fresh=fresh;o.shard=f32(shard);return o;}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{if(i.fresh<.5){discard;}let d=length(i.local);var col=vec3(.72,1.,.16);var a=0.;if(i.shard>0.){a=(1.-smoothstep(.16,.94,abs(i.local.x)))*(1.-smoothstep(.35,1.,abs(i.local.y)))*(.72-i.shard*.035);col=mix(vec3(1.,.76,.2),vec3(.95,.16,.04),clamp(i.kind*.22,0.,1.));return vec4(col,max(0.,a));}if(i.kind==1.){a=1.-smoothstep(.52,.72,d);a*=smoothstep(.05,.22,abs(d-.56));col=vec3(1.,.43,.08);}else if(i.kind==2.){a=(1.-smoothstep(.5,.96,abs(i.local.y)))*.85;col=vec3(.35,.86,1.);}else if(i.kind==3.){a=(1.-smoothstep(.35,1.,abs(i.local.y)))*smoothstep(-1.,.1,i.local.x);col=vec3(.3,.85,1.);}else{a=smoothstep(.92,.35,d)*.55;}return vec4(col,a);}`});
  const bgModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
@vertex fn vs(@builtin(vertex_index) v:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));return vec4(p[v],0,1);}
@fragment fn fs(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{let uv=p.xy/camera.viewport.xy;let w=camera.world.xy+vec2(uv.x*camera.world.z,(1.-uv.y)*camera.world.w);let brush=.009*sin(w.x*1.3)+.006*sin(w.y*1.7)+.004*sin((w.x+w.y)*2.1);return vec4(vec3(.18,.23,.205)+brush,1);}`});
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
  const screenToWorld=(clientX:number,clientY:number):Vec2=>{const r=canvas.getBoundingClientRect(),aspect=r.width/r.height,target=W/H,sx=Math.min(1,target/aspect),sy=Math.min(1,aspect/target),v=view();return{x:Math.max(0,Math.min(W,camera.x+(((clientX-r.left)/r.width*2-1)/sx+1)*v.width/2)),y:Math.max(0,Math.min(H,camera.y+(((clientY-r.top)/r.height*2-1)/sy+1)*v.height/2))}};
  const worldToScreen=(x:number,y:number):Vec2=>{const r=canvas.getBoundingClientRect(),aspect=r.width/r.height,target=W/H,sx=Math.min(1,target/aspect),sy=Math.min(1,aspect/target),v=view();return{x:r.left+r.width*((((x-camera.x)/v.width)*sx)+1)/2,y:r.top+r.height*(1-(((y-camera.y)/v.height)*sy))/2}};
  const push=(a:V[],x:number,y:number,c:[number,number,number,number])=>a.push({x,y,r:c[0],g:c[1],b:c[2],a:c[3]});
  const tri=(a:V[], p:Vec2,q:Vec2,r:Vec2,c:[number,number,number,number])=>{push(a,p.x,p.y,c);push(a,q.x,q.y,c);push(a,r.x,r.y,c)};
  const rect=(a:V[],x:number,y:number,w:number,h:number,c:[number,number,number,number])=>{tri(a,{x,y},{x:x+w,y},{x,y:y+h},c);tri(a,{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},c)};
  const ring=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],width=0.65)=>{const n=28;for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;const p=(rr:number,t:number)=>({x:x+Math.cos(t)*rr,y:y+Math.sin(t)*rr});tri(a,p(rad-width,u),p(rad-width,v),p(rad,v),c);tri(a,p(rad-width,u),p(rad,v),p(rad,u),c)}};
  const diamond=(a:V[],x:number,y:number,size:number,c:[number,number,number,number])=>{tri(a,{x,y:y-size},{x:x+size,y},{x,y:y+size},c);tri(a,{x,y:y-size},{x,y:y+size},{x:x-size,y},c)};
  const towerShape=(a:V[],t:Vec2 & {kind:string;level?:number},c:[number,number,number,number])=>{const s=1.65+(t.level??0)*.12;if(t.kind==='repulsor'||t.kind==='rocket')tri(a,{x:t.x,y:t.y-s},{x:t.x+s,y:t.y+s},{x:t.x-s,y:t.y+s},c);else if(t.kind==='mortar'||t.kind==='tesla')rect(a,t.x-s,t.y-s,s*2,s*2,c);else if(t.kind==='autocannon'||t.kind==='railgun')diamond(a,t.x,t.y,s,c);else{rect(a,t.x-s*.38,t.y-s,s*.76,s*2,c);rect(a,t.x-s,t.y-s*.38,s*2,s*.76,c);}};
  function geometry(scene:RenderScene): Float32Array { const a:V[]=[];
    for(const o of scene.map.obstacles){rect(a,o.x,o.y,o.width,o.height,[.17,.22,.18,.95]);rect(a,o.x+.45,o.y+.45,Math.max(0,o.width-.9),Math.min(1,o.height),[.38,.5,.25,.3]);}
    for(const wire of scene.wires??[]){const integrity=Math.max(.15,wire.health/wire.maxHealth),color:[number,number,number,number]=wire.breached?[.8,.12,.05,.55*integrity]:[.95,.45,.08,.8*integrity];rect(a,wire.x,wire.y+wire.height*.18,wire.width,wire.height*.12,color);rect(a,wire.x,wire.y+wire.height*.7,wire.width,wire.height*.12,color);}
    rect(a,scene.map.spawn.x,scene.map.spawn.y,scene.map.spawn.width,scene.map.spawn.height,[.95,.48,.12,.11]); ring(a,scene.map.goal.x,scene.map.goal.y,scene.map.goalRadius,[.71,.98,.31,.85]);
    for(const t of scene.towers){const c: [number,number,number,number]=t.kind==='repulsor'?[.73,1,.22,.95]:t.kind==='mortar'?[1,.62,.16,.95]:t.kind==='autocannon'?[.28,.85,1,.95]:t.kind==='cryo'?[.4,.85,.95,.95]:t.kind==='tesla'?[.62,.45,1,.95]:t.kind==='rocket'?[1,.25,.15,.95]:[.35,1,.78,.95];towerShape(a,t,c);if(scene.selection===t.id)ring(a,t.x,t.y,4.2,[1,.88,.4,.9],.35);}
    if(scene.ghost){const c: [number,number,number,number]=scene.ghost.valid?[.65,1,.25,.8]:[1,.18,.12,.8];ring(a,scene.ghost.x,scene.ghost.y,scene.ghost.range,c,.22);towerShape(a,scene.ghost,c);}
    if(scene.wallGhost)rect(a,scene.wallGhost.x,scene.wallGhost.y,scene.wallGhost.width,scene.wallGhost.height,scene.wallGhost.valid?[.25,.85,.95,.5]:[1,.15,.08,.5]);
    for(const e of scene.effects){const c: [number,number,number,number]=e.kind==='blast'?[1,.42,.1,.75]:e.kind==='slow'?[.25,.8,1,.56]:[.7,1,.2,.5];ring(a,e.x,e.y,Math.max(1,e.radius),c,Math.max(.35,e.radius*.08)); if(e.kind==='push'){const q={x:e.x+e.direction.x*e.radius,y:e.y+e.direction.y*e.radius};tri(a,{x:e.x-1,y:e.y-1},{x:e.x+1,y:e.y+1},q,c)}}
    for(const p of scene.visualParticles??[]){const t=Math.max(0,Math.min(1,p.age/p.life)),fade=(1-t)*(1-t);const x=p.x+p.vx*p.age*(1-p.drag*t),y=p.y+p.vy*p.age+.5*p.gravity*p.age*p.age;const size=p.size*(1-.42*t);const c:[number,number,number,number]=[p.color[0],p.color[1],p.color[2],fade];diamond(a,x,y,size,c);if(p.size>.2)diamond(a,x-p.vx*.025,y-p.vy*.025,size*.42,[p.color[0],p.color[1],p.color[2],fade*.38]);}
    if(scene.boss){const c: [number,number,number,number]=scene.boss.phase===2?[1,.15,.04,.95]:scene.boss.phase===1?[.9,.72,.2,.95]:[.55,.78,1,.95];ring(a,scene.boss.x,scene.boss.y,2.5,c,.55);rect(a,scene.boss.x-3,scene.boss.y-4,6*Math.max(0,scene.boss.health/scene.boss.maxHealth),.45,c);}
    const capped=a.slice(0,MAX_OVERLAY_VERTICES); const data=new Float32Array(capped.length*6);capped.forEach((v,i)=>data.set([v.x,v.y,v.r,v.g,v.b,v.a],i*6));return data;
  }
  return { encode(encoder,scene){resize(); const v=view(); const u=new Float32Array([pixelW,pixelH,0,0,camera.x,camera.y,v.width,v.height,scene.time,scene.heatmap?1:0,0,0,0,0,0,0]);device.queue.writeBuffer(uniform,0,u);const visual=new Float32Array(Math.max(1,Math.min(MAX_TOWERS,scene.towers.length))*4);scene.towers.slice(0,MAX_TOWERS).forEach((t,i)=>visual.set([t.x,t.y,t.id,towerBehavior(t.kind)],i*4));device.queue.writeBuffer(towerVisuals,0,visual);const data=geometry(scene);if(data.byteLength)device.queue.writeBuffer(overlays,0,data.buffer,data.byteOffset,data.byteLength);const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.12,g:.16,b:.14,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(bg);pass.setBindGroup(0,cameraBG);pass.draw(3);pass.setPipeline(overlay);pass.setBindGroup(0,cameraOverlay);pass.setVertexBuffer(0,overlays);pass.draw(data.length/6);pass.setPipeline(particles);pass.setBindGroup(0,cameraParticles);pass.draw(48,Math.min(scene.count,shared.capacity));if(shared.shotState){pass.setPipeline(cues);pass.setBindGroup(0,cameraCues);pass.draw(72,Math.min(MAX_TOWERS,scene.towers.length));}pass.end(); },
    screenToWorld,
    worldToScreen,
    pan(dx,dy){camera.x+=dx;camera.y+=dy;clampCamera();},
    zoomAt(factor,clientX,clientY){const before=screenToWorld(clientX,clientY);camera.zoom=Math.max(1,Math.min(3,camera.zoom*factor));const after=screenToWorld(clientX,clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;clampCamera();},
    destroy(){uniform.destroy();overlays.destroy();towerVisuals.destroy();emptyShots.destroy();}
  };
}
