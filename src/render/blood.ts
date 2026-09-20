import {AFTERMATH_WGSL,CORPSE_CAPACITY,HIT_CAPACITY} from '../effects/aftermath.ts';
import {BLOOD_WALL_WGSL,BLOOD_WALL_CAPACITY,createBloodWallTable} from '../effects/blood-surfaces.ts';
import type {SharedGPU,RenderScene} from '../contracts/index.ts';
export const BLOOD_GRID=256,BLOOD_DROPLETS=12;
export async function createBloodRenderer(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,shared:SharedGPU){
 const walls=shared.bloodWalls!,table=createBloodWallTable(device,walls);shared.bloodWallSlots=table.slots;
 const total=CORPSE_CAPACITY+HIT_CAPACITY;
 const cells=device.createBuffer({label:'Persistent GPU blood pools',size:BLOOD_GRID**2*8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
 const seen=device.createBuffer({label:'GPU droplet landing masks',size:total*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const impacts=device.createBuffer({label:'Cached GPU droplet wall contacts',size:total*BLOOD_DROPLETS*16,usage:GPUBufferUsage.STORAGE});
 const params=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const common=`${AFTERMATH_WGSL.replaceAll('atomic<u32>','u32')}${BLOOD_WALL_WGSL}
 struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
 struct Cell {amount:atomic<u32>,tick:atomic<u32>};
 @group(0) @binding(0) var<uniform> camera:Camera;
 @group(0) @binding(1) var<storage,read> events:Aftermath;
 @group(0) @binding(2) var<storage,read_write> walls:BloodWalls;
 @group(0) @binding(3) var<storage,read_write> cells:array<Cell>;
 @group(0) @binding(4) var<storage,read_write> seen:array<vec4f>;
 @group(0) @binding(5) var<uniform> params:vec4f;
 @group(0) @binding(6) var<storage,read_write> impacts:array<vec4f>;
 fn hash(v:f32)->f32{return fract(sin(v*12.9898)*43758.5453);}
 fn eventAt(i:u32)->Remnant{if(i<${CORPSE_CAPACITY}u){return events.deaths[i];}return events.hits[i-${CORPSE_CAPACITY}u];}
 // Analytic ballistic motion: no per-droplet CPU state or frame-dependent integration.
 fn trajectory(e:Remnant,j:u32)->vec4f{
  let seed=e.life.y+f32(j)*13.7;let explosive=e.force.w==1.;
  let angle=atan2(e.force.y,e.force.x)+(hash(seed)-.5)*select(1.8,6.283185,explosive);
  let speed=select(2.5,7.,explosive)+hash(seed+1.)*select(4.,8.,explosive);
  let flight=.35+hash(seed+2.)*.55;return vec4f(vec2f(cos(angle),sin(angle))*speed*flight,flight,.5+hash(seed+3.)*2.);
 }
 // Segment slab intersection chooses the first wall, not whichever is listed first.
 fn impact(origin:vec2f,delta:vec2f)->vec3f{
  var best=1.;var chosen=-1.;var face=0.;
  for(var w=0u;w<walls.header.x;w++){
   if(walls.items[w].flags.x==0u){continue;}let r=walls.items[w].rect;
   var lo=0.;var hi=1.;var side=0.;var valid=true;
   for(var k=0u;k<2u;k++){
    if(abs(delta[k])<.0001){if(origin[k]<r[k]||origin[k]>r[k]+r[k+2u]){valid=false;}}
    else{let a=(r[k]-origin[k])/delta[k];let b=(r[k]+r[k+2u]-origin[k])/delta[k];let near=min(a,b);if(near>lo){lo=near;side=f32(k*2u)+select(1.,0.,delta[k]>0.);}hi=min(hi,max(a,b));}
   }
   if(valid&&hi>=lo&&lo>=0.&&lo<best){best=lo;chosen=f32(w);face=side;}
  }return vec3f(best,chosen,face);
 }
 fn deposit(p:vec2f,amount:u32){
  let cell=vec2i(floor(p/params.xy*${BLOOD_GRID}.));
  if(any(cell<vec2i(0))||any(cell>=vec2i(${BLOOD_GRID}))){return;}
  let index=u32(cell.y)*${BLOOD_GRID}u+u32(cell.x);
  atomicMax(&cells[index].tick,u32(camera.time.x*60.)+1u);
  // Saturation prevents wraparound during endless runs.
  var old=atomicLoad(&cells[index].amount);loop{if(old>=4096u){break;}let result=atomicCompareExchangeWeak(&cells[index].amount,old,min(4096u,old+amount));if(result.exchanged){break;}old=result.old_value;}
 }
 @compute @workgroup_size(64) fn accumulate(@builtin(global_invocation_id) gid:vec3u){
  let i=gid.x;if(i>=${total}u){return;}let e=eventAt(i);let age=camera.time.x-e.life.x;
  if(e.life.w<.5||age<0.||age>3.){return;}
  var previous=seen[i];let fresh=previous.x!=e.life.y||previous.y!=e.life.x;if(fresh){previous=vec4f(e.life.y,e.life.x,0,0);}
  var mask=u32(previous.z);
  if((mask&4096u)==0u){
   if(i<${CORPSE_CAPACITY}u){for(var y=-3;y<=3;y++){for(var x=-3;x<=3;x++){let offset=vec2f(f32(x),f32(y));if(length(offset)<3.2){deposit(e.body.xy+offset*e.body.z*.5,u32(65.-length(offset)*12.));}}}}
   else{deposit(e.body.xy,10u);}mask|=4096u;
  }
  for(var j=0u;j<${BLOOD_DROPLETS}u;j++){
   if((mask&(1u<<j))!=0u){continue;}let path=trajectory(e,j);let slot=i*12u+j;if(fresh){impacts[slot]=vec4f(impact(e.body.xy,path.xy),0.);}let hit=impacts[slot].xyz;
   if(age<path.z*hit.x){continue;}let p=e.body.xy+path.xy*hit.x;
   deposit(p,select(5u,20u,i<${CORPSE_CAPACITY}u));
   if(hit.y>=0.){atomicAdd(&walls.items[u32(hit.y)].splashes[u32(hit.z)],1u);}
   mask|=1u<<j;
  }seen[i]=vec4f(e.life.y,e.life.x,f32(mask),0);
 }
 `;
 const compute=device.createShaderModule({code:common});
 const render=device.createShaderModule({code:common.slice(0,common.indexOf(' fn deposit')).replaceAll('atomic<u32>','u32').replaceAll('storage,read_write','storage,read')+`
 struct Out {@builtin(position) pos:vec4f,@location(0) local:vec2f,@location(1) color:vec4f,@location(2) seed:f32};
 fn corner(i:u32)->vec2f{let a=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));return a[i%6u];}
 fn vertex(p:vec2f,q:vec2f,c:vec4f,seed:f32)->Out{var o:Out;let aspect=camera.viewport.x/max(1.,camera.viewport.y);let wa=camera.world.z/camera.world.w;o.pos=vec4f((((p-camera.world.xy)/camera.world.zw)*2.-1.)*vec2f(min(1.,wa/aspect),-min(1.,aspect/wa)),0,1);o.local=q;o.color=c;o.seed=seed;return o;}
 fn empty()->Out{return vertex(vec2f(-10000),vec2f(0),vec4f(0),0.);}
 @vertex fn pool(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
  let cell=cells[i];if(cell.amount==0u){return empty();}let age=max(0.,camera.time.x-f32(cell.tick)/60.);let q=corner(vi);let seed=f32(i)*.37;
  let size=params.xy/${BLOOD_GRID}.;let center=(vec2f(f32(i%${BLOOD_GRID}u),f32(i/${BLOOD_GRID}u))+.5)*size;
  let saturation=min(1.,f32(cell.amount)/100.);let spread=(.3+.65*saturation)*(.65+.35*smoothstep(0.,2.,age));
  let color=mix(vec3f(.17,.014,.01),vec3f(.53,.025,.018),exp(-age*.12));
  return vertex(center+q*size*spread,q,vec4f(color,.35+.5*saturation),seed);
 }
 @vertex fn droplet(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
  let e=eventAt(i);let age=camera.time.x-e.life.x;if(e.life.w<.5||age<0.||age>.9){return empty();}
  let j=vi/6u;let path=trajectory(e,j);let hit=impacts[i*12u+j].xyz;if(age>path.z*hit.x){return empty();}
  let t=age/path.z;let p=e.body.xy+path.xy*t-vec2f(0,4.*path.w*t*(1.-t));
  let q=corner(vi);let dir=normalize(path.xy);let size=e.body.z*(.08+hash(e.life.y+f32(j))*.13);
  let stretched=dir*q.x*size*2.+vec2f(-dir.y,dir.x)*q.y*size;
  return vertex(p+stretched,q,vec4f(.72,.045,.025,.95),f32(j));
 }
 @vertex fn smear(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Out{
  let w=walls.items[i];let face=vi/36u;let shard=(vi/6u)%6u;let amount=w.splashes[face];if(amount==0u){return empty();}
  let q=corner(vi);let seed=f32(i*29u+shard*7u+face);let r=w.rect;let fraction=(f32(shard)+.5)/6.;
  var p=r.xy;var extent=vec2f(.18,r.w/10.);
  if(face<2u){p+=vec2f(select(0.,r.z,face==1u),fraction*r.w);}
  else{p+=vec2f(fraction*r.z,select(0.,r.w,face==3u));extent=vec2f(r.z/10.,.18);}
  // Project streaks up the visible wall face; demolished walls keep low rubble stains.
  let standing=f32(w.flags.x);p.y-=standing*(.15+hash(seed)*.65);extent.y+=standing*(.12+hash(seed+1.)*.35);
  let density=min(1.,f32(amount)/24.);return vertex(p+q*extent*(.4+density),q,vec4f(.29,.022,.013,.2+.65*density),seed);
 }
 @fragment fn fs(i:Out)->@location(0) vec4f{
  let q=floor(i.local*16.)/16.;let edge=.73+hash(dot(floor(q*7.),vec2f(9.,17.))+i.seed)*.27;
  if(length(q)>edge){discard;}return i.color;
 }`});
 for(const module of [compute,render]){const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));}
 const layout=(read:boolean)=>device.createBindGroupLayout({entries:[0,1,2,3,4,5,6].map(binding=>({binding,visibility:read?GPUShaderStage.VERTEX:GPUShaderStage.COMPUTE,buffer:{type:binding===0||binding===5?'uniform':read||binding===1?'read-only-storage':'storage'}}))});
 const cl=layout(false),rl=layout(true);
 const cp=await device.createComputePipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[cl]}),compute:{module:compute,entryPoint:'accumulate'}});
 const pipelines=await Promise.all(['pool','droplet','smear'].map(entryPoint=>device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[rl]}),vertex:{module:render,entryPoint},fragment:{module:render,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]}})));
 const buffers=[camera,shared.aftermath!,walls,cells,seen,params,impacts],bind=(layout:GPUBindGroupLayout)=>device.createBindGroup({layout,entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))}),cb=bind(cl),rb=bind(rl);
 let mapId='',lastTime=-1;
 const reset=()=>{table.reset();device.queue.writeBuffer(cells,0,new Uint8Array(cells.size));device.queue.writeBuffer(seen,0,new Uint8Array(seen.size));};
 return {storage:{cells,seen},reset,prepare(encoder:GPUCommandEncoder,scene:RenderScene){
  if(mapId!==scene.map.id||scene.time<lastTime)reset();mapId=scene.map.id;lastTime=scene.time;
  table.update(scene.map.obstacles,scene.walls??[]);device.queue.writeBuffer(params,0,new Float32Array([scene.map.width,scene.map.height,0,0]));
  const pass=encoder.beginComputePass();pass.setPipeline(cp);pass.setBindGroup(0,cb);pass.dispatchWorkgroups(Math.ceil(total/64));pass.end();
 },ground(pass:GPURenderPassEncoder){pass.setPipeline(pipelines[0]);pass.setBindGroup(0,rb);pass.draw(6,BLOOD_GRID**2);},
 spray(pass:GPURenderPassEncoder){pass.setPipeline(pipelines[1]);pass.setBindGroup(0,rb);pass.draw(6*BLOOD_DROPLETS,total);},
 walls(pass:GPURenderPassEncoder){pass.setPipeline(pipelines[2]);pass.setBindGroup(0,rb);pass.draw(144,table.slots.size);},
 destroy(){impacts.destroy();cells.destroy();seen.destroy();params.destroy();}};
}
