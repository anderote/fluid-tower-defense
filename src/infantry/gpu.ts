import {PARTICLE_WGSL,type SharedGPU,type WorldMap} from '../contracts/index.ts';
import {MAX_INFANTRY,infantryStats,type Soldier,type Threat,type RifleShot} from './model.ts';

export async function createInfantryGPU(device:GPUDevice,shared:SharedGPU){
  const params=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const units=device.createBuffer({size:MAX_INFANTRY*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const results=device.createBuffer({size:MAX_INFANTRY*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size:MAX_INFANTRY*32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  let walls=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),wallCapacity=1,busy=false,version=0;
  const threats=new Map<number,Threat>();
  const shader=device.createShaderModule({label:'Rifleman targeting and damage',code:`${PARTICLE_WGSL}
struct Unit {position:vec4f,shot:vec4f,impact:vec4f};
struct Result {aim:vec4f,contact:vec4f};
@group(0) @binding(0) var<uniform> params:vec4u;
@group(0) @binding(1) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> units:array<Unit>;
@group(0) @binding(3) var<storage,read_write> results:array<Result>;
@group(0) @binding(4) var<storage,read> walls:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> owners:array<atomic<u32>>;
fn visible(a:vec2f,b:vec2f)->bool {
 let delta=b-a;
 for(var j=0u;j<params.z;j++){
  let w=walls[j];var lo=0.;var hi=1.;
  for(var k=0u;k<2u;k++){
   if(abs(delta[k])<.00001){if(a[k]<w[k]||a[k]>w[k]+w[k+2u]){hi=-1.;}}
   else {let t0=(w[k]-a[k])/delta[k];let t1=(w[k]+w[k+2u]-a[k])/delta[k];lo=max(lo,min(t0,t1));hi=min(hi,max(t0,t1));}
  }
  if(hi>=lo){return false;}
 }return true;
}
@compute @workgroup_size(64) fn sense(@builtin(global_invocation_id) gid:vec3u){
 let u=gid.x;if(u>=params.y){return;}let unit=units[u];var best=max(unit.position.z,select(0.,12.,unit.position.w==3.));var result=Result(vec4f(-1,0,0,0),vec4f(0));
 for(var i=0u;i<params.x;i++){
  let p=particles[i];if(p.state.w<.5||p.body.z<=0.){continue;}
  let d=distance(p.pos.xy,unit.position.xy);
  if(d<p.body.x+1.0&&visible(unit.position.xy,p.pos.xy)){result.contact.x+=10.+min(20.,p.state.y*.1);}
  if(d<best&&visible(unit.position.xy,p.pos.xy)){best=d;result.aim=vec4f(f32(i),p.status.w,p.pos.xy);}
 }
 result.contact.x=min(120.,result.contact.x);results[u]=result;
}
@compute @workgroup_size(128) fn damage(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=params.x){return;}var p=particles[i];if(p.state.w<.5||p.body.z<=0.){return;}
 for(var u=0u;u<params.y;u++){
  let unit=units[u];if(unit.shot.z<=0.){continue;}
  let delta=p.pos.xy-unit.position.xy;let d=length(delta);let kind=unit.position.w;
  var hit=unit.shot.x==f32(i)&&unit.shot.y==p.status.w&&d<=unit.position.z;
  if(kind==1.){hit=distance(p.pos.xy,unit.impact.xy)<=3.5&&visible(unit.impact.xy,p.pos.xy);}
  if(kind==2.||kind==3.){let alignment=dot(delta/max(d,.001),vec2f(cos(unit.impact.z),sin(unit.impact.z)));hit=d<=unit.position.z&&alignment>=select(.65,-.3,kind==3.);}
  if(hit&&visible(unit.position.xy,p.pos.xy)){p.body.z-=unit.shot.z;atomicStore(&owners[i],0u);}
 }particles[i]=p;
}`});
  const errors=(await shader.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},...[1,2,3,4,5].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:([2,4].includes(binding)?'read-only-storage':'storage') as GPUBufferBindingType}}))]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const sense=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'sense'}}),damage=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'damage'}});
  return {threats,reset(){version++;threats.clear();},encode(encoder:GPUCommandEncoder,soldiers:Soldier[],shots:RifleShot[],map:WorldMap,count:number,sample:boolean){
    const live=soldiers.filter(s=>s.health>0).slice(0,MAX_INFANTRY);if(!live.length)return;
    if(map.obstacles.length>wallCapacity){walls.destroy();wallCapacity=2**Math.ceil(Math.log2(map.obstacles.length));walls=device.createBuffer({size:wallCapacity*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});}
    if(map.obstacles.length)device.queue.writeBuffer(walls,0,new Float32Array(map.obstacles.flatMap(o=>[o.x,o.y,o.width,o.height])));
    device.queue.writeBuffer(params,0,new Uint32Array([count,live.length,map.obstacles.length,0]));
    const data=new Float32Array(MAX_INFANTRY*12);live.forEach((s,i)=>{const shot=shots.find(shot=>shot.soldier===s.id);data.set([s.x,s.y,infantryStats(s.kind,s.quality,s.defense).range,['rifle','rocket','flame','samurai'].indexOf(s.kind??'rifle'),shot?.target??-1,shot?.generation??0,shot?.damage??0,0,shot?.x??0,shot?.y??0,s.angle,0],i*12);});device.queue.writeBuffer(units,0,data);
    const group=device.createBindGroup({layout,entries:[params,shared.particles,units,results,walls,shared.damageOwners!].map((buffer,binding)=>({binding,resource:{buffer}}))});
    if(shots.length&&count){const pass=encoder.beginComputePass();pass.setPipeline(damage);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/128));pass.end();}
    if(!sample||busy)return;
    const pass=encoder.beginComputePass();pass.setPipeline(sense);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(live.length/64));pass.end();
    encoder.copyBufferToBuffer(results,0,read,0,live.length*32);busy=true;const current=version,ids=live.map(s=>s.id);
    return ()=>{void read.mapAsync(GPUMapMode.READ).then(()=>{const data=new Float32Array(read.getMappedRange());if(current===version){threats.clear();ids.forEach((id,i)=>threats.set(id,{target:data[i*8],generation:data[i*8+1],x:data[i*8+2],y:data[i*8+3],contact:data[i*8+4],age:0}));}read.unmap();}).catch(error=>console.warn('Infantry sensing unavailable',error)).finally(()=>{busy=false;});};
  },destroy(){version++;params.destroy();units.destroy();results.destroy();read.destroy();walls.destroy();}};
}
