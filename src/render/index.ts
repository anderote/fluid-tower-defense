import { PARTICLE_WGSL, type RenderScene, type Renderer, type SharedGPU, type Vec2 } from '../contracts/index.ts';

const W = 160, H = 100, MAX_OVERLAY_VERTICES = 12000;
type V = { x:number; y:number; r:number; g:number; b:number; a:number };

/** GPU-only visualizer. Particle bodies remain in the shared simulation buffer. */
export async function createRenderer(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, shared: SharedGPU, canvas: HTMLCanvasElement): Promise<Renderer> {
  const uniform = device.createBuffer({ label:'Render camera', size:64, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const overlays = device.createBuffer({ label:'Tactical overlays', size:MAX_OVERLAY_VERTICES * 24, usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
  const particleModule = device.createShaderModule({code:`
${PARTICLE_WGSL}
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> };
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage,read> particles: array<Particle>;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) color: vec4<f32> };
fn world(p:vec2<f32>)->vec2<f32>{ let aspect=camera.viewport.x/max(1.0,camera.viewport.y); let target=camera.world.z/camera.world.w; let sx=min(1.0,target/aspect); let sy=min(1.0,aspect/target); return vec2((((p.x-camera.world.x)/camera.world.z)*2.0-1.0)*sx, (1.0-((p.y-camera.world.y)/camera.world.w)*2.0)*sy); }
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out {
  let corners=array<vec2<f32>,6>(vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  let p=particles[ii]; let c=corners[vi]; let radius=p.body.x;
  let q=world(p.pos.xy + c*radius); var o:Out; o.pos=vec4(q,0,1); o.local=c;
  let k=u32(p.state.z + 0.5); var col=vec3(0.77,0.85,0.68);
  if(k==1u){col=vec3(1.0,0.61,0.25);} if(k==2u){col=vec3(0.74,0.35,0.18);}
  let hp=clamp(p.body.z/max(0.001,p.body.w),0.0,1.0); let pressure=clamp(max(p.state.y,p.state.x)*.018,0.0,1.0);
  // time.y is the heatmap switch: data comes solely from this particle's pressure/packing fields.
  if(camera.time.y > .5){ col=mix(col,vec3(1.0,0.12,0.03),pressure); }
  o.color=vec4(col*(0.45+0.55*hp),p.state.w); return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{ let d=dot(i.local,i.local); if(d>1.0 || i.color.a<0.5){discard;} let rim=smoothstep(.58,.98,d); return vec4(mix(i.color.rgb,vec3(1.0,.9,.65),rim*.18),1); }
`});
  const overlayModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
struct I { @location(0) pos:vec2<f32>, @location(1) color:vec4<f32> }; struct O { @builtin(position) pos:vec4<f32>, @location(0) color:vec4<f32> };
@vertex fn vs(i:I)->O { let aspect=camera.viewport.x/max(1.,camera.viewport.y);let target=camera.world.z/camera.world.w;let sx=min(1.,target/aspect);let sy=min(1.,aspect/target);var o:O; o.pos=vec4((((i.pos.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((i.pos.y-camera.world.y)/camera.world.w)*2.)*sy,0,1);o.color=i.color;return o; }
@fragment fn fs(i:O)->@location(0) vec4<f32>{return i.color;}`});
  const bgModule=device.createShaderModule({code:`
struct Camera { viewport: vec4<f32>, world: vec4<f32>, time: vec4<f32> }; @group(0) @binding(0) var<uniform> camera:Camera;
@vertex fn vs(@builtin(vertex_index) v:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));return vec4(p[v],0,1);}
@fragment fn fs(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{let uv=p.xy/camera.viewport.xy;let w=camera.world.xy+vec2(uv.x*camera.world.z,(1.-uv.y)*camera.world.w);let line=(1.-smoothstep(.0,.035,abs(fract(w.x/10.-.5)-.5)))+(1.-smoothstep(.0,.035,abs(fract(w.y/10.-.5)-.5)));let scan=.018*sin(w.x*.7+w.y*.8+camera.time.x*1.5);return vec4(vec3(.035,.055,.045)+line*vec3(.035,.075,.055)+scan,1);}`});
  const bg=device.createRenderPipeline({layout:'auto',vertex:{module:bgModule,entryPoint:'vs'},fragment:{module:bgModule,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
  const particles=device.createRenderPipeline({layout:'auto',vertex:{module:particleModule,entryPoint:'vs'},fragment:{module:particleModule,entryPoint:'fs',targets:[{format}],},primitive:{topology:'triangle-list'},multisample:{count:1}});
  const overlay=device.createRenderPipeline({layout:'auto',vertex:{module:overlayModule,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module:overlayModule,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const cameraBG=device.createBindGroup({layout:bg.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  const cameraParticles=device.createBindGroup({layout:particles.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:shared.particles}}]});
  const cameraOverlay=device.createBindGroup({layout:overlay.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  let pixelW=0,pixelH=0;
  const resize=()=>{const d=Math.min(devicePixelRatio||1,2),max=device.limits.maxTextureDimension2D; const w=Math.max(1,Math.min(max,Math.round(canvas.clientWidth*d))),h=Math.max(1,Math.min(max,Math.round(canvas.clientHeight*d))); if(w!==pixelW||h!==pixelH){pixelW=w;pixelH=h;canvas.width=w;canvas.height=h;context.configure({device,format,alphaMode:'opaque'});} };
  const push=(a:V[],x:number,y:number,c:[number,number,number,number])=>a.push({x,y,r:c[0],g:c[1],b:c[2],a:c[3]});
  const tri=(a:V[], p:Vec2,q:Vec2,r:Vec2,c:[number,number,number,number])=>{push(a,p.x,p.y,c);push(a,q.x,q.y,c);push(a,r.x,r.y,c)};
  const rect=(a:V[],x:number,y:number,w:number,h:number,c:[number,number,number,number])=>{tri(a,{x,y},{x:x+w,y},{x,y:y+h},c);tri(a,{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},c)};
  const ring=(a:V[],x:number,y:number,rad:number,c:[number,number,number,number],width=0.65)=>{const n=28;for(let i=0;i<n;i++){const u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2;const p=(rr:number,t:number)=>({x:x+Math.cos(t)*rr,y:y+Math.sin(t)*rr});tri(a,p(rad-width,u),p(rad-width,v),p(rad,v),c);tri(a,p(rad-width,u),p(rad,v),p(rad,u),c)}};
  function geometry(scene:RenderScene): Float32Array { const a:V[]=[];
    for(const o of scene.map.obstacles){rect(a,o.x,o.y,o.width,o.height,[.17,.22,.18,.95]);rect(a,o.x+.45,o.y+.45,Math.max(0,o.width-.9),Math.min(1,o.height),[.38,.5,.25,.3]);}
    rect(a,scene.map.spawn.x,scene.map.spawn.y,scene.map.spawn.width,scene.map.spawn.height,[.95,.48,.12,.26]); ring(a,scene.map.goal.x,scene.map.goal.y,scene.map.goalRadius,[.71,.98,.31,.85]);
    for(const t of scene.towers){const c: [number,number,number,number]=t.kind==='repulsor'?[.73,1,.22,.95]:t.kind==='mortar'?[1,.62,.16,.95]:t.kind==='autocannon'?[.28,.85,1,.95]:[.4,.85,.95,.95];ring(a,t.x,t.y,3.3+t.level*.25,c,.7); const q={x:t.x+Math.cos(t.angle)*5,y:t.y+Math.sin(t.angle)*5}; tri(a,{x:t.x-1.7,y:t.y-1.7},{x:t.x+1.7,y:t.y+1.7},q,c);if(scene.selection===t.id)ring(a,t.x,t.y,6,[1,.88,.4,.9],.45);}
    if(scene.ghost){ring(a,scene.ghost.x,scene.ghost.y,3.2,scene.ghost.valid?[.65,1,.25,.8]:[1,.18,.12,.8],.65)}
    for(const e of scene.effects){const c: [number,number,number,number]=e.kind==='blast'?[1,.42,.1,.75]:e.kind==='slow'?[.25,.8,1,.56]:[.7,1,.2,.5];ring(a,e.x,e.y,Math.max(1,e.radius),c,Math.max(.35,e.radius*.08)); if(e.kind==='push'){const q={x:e.x+e.direction.x*e.radius,y:e.y+e.direction.y*e.radius};tri(a,{x:e.x-1,y:e.y-1},{x:e.x+1,y:e.y+1},q,c)}}
    if(scene.boss){ring(a,scene.boss.x,scene.boss.y,8,[1,.2,.08,.9],1);}
    const capped=a.slice(0,MAX_OVERLAY_VERTICES); const data=new Float32Array(capped.length*6);capped.forEach((v,i)=>data.set([v.x,v.y,v.r,v.g,v.b,v.a],i*6));return data;
  }
  return { encode(encoder,scene){resize(); const u=new Float32Array([pixelW,pixelH,0,0,0,0,W,H,scene.time,scene.heatmap?1:0,0,0,0,0,0,0]);device.queue.writeBuffer(uniform,0,u);const data=geometry(scene);if(data.byteLength)device.queue.writeBuffer(overlays,0,data.buffer,data.byteOffset,data.byteLength);const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.02,g:.03,b:.025,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(bg);pass.setBindGroup(0,cameraBG);pass.draw(3);pass.setPipeline(overlay);pass.setBindGroup(0,cameraOverlay);pass.setVertexBuffer(0,overlays);pass.draw(data.length/6);pass.setPipeline(particles);pass.setBindGroup(0,cameraParticles);pass.draw(6,Math.min(scene.count,shared.capacity));pass.end(); },
    screenToWorld(clientX,clientY){const r=canvas.getBoundingClientRect(),aspect=r.width/r.height,target=W/H,sx=Math.min(1,target/aspect),sy=Math.min(1,aspect/target);return{x:Math.max(0,Math.min(W,(((clientX-r.left)/r.width*2-1)/sx+1)*W/2)),y:Math.max(0,Math.min(H,(1-((clientY-r.top)/r.height*2-1)/sy)*H/2))}},
    destroy(){uniform.destroy();overlays.destroy();}
  };
}
