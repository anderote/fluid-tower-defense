import {PARTICLE_WGSL,type InfantryProjectile,type SharedGPU,type WorldMap} from '../contracts/index.ts';
import {infantryCombatKind,infantryStats,type Soldier,type Threat,type RifleShot} from './model.ts';
import {MAX_TOWERS,MAX_INFANTRY_KILL_SLOTS} from '../contracts/index.ts';

export async function createInfantryGPU(device:GPUDevice,shared:SharedGPU){
  const params=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  let capacity=128;
  let units=device.createBuffer({size:capacity*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  let results=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  let read=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  let walls=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),wallCapacity=1,busy=false,version=0;
  const storage=(size:number)=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  let heads=storage(8),gridCapacity=1,links=storage((shared.capacity+capacity)*4);
  const threats=new Map<number,Threat>();
  const shader=device.createShaderModule({label:'Rifleman targeting and damage',code:`${PARTICLE_WGSL}
struct Params {counts:vec4u,grid:vec4f};
struct Unit {position:vec4f,shot:vec4f,impact:vec4f};
struct Result {aim:vec4f,contact:vec4f};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> units:array<Unit>;
@group(0) @binding(3) var<storage,read_write> results:array<Result>;
@group(0) @binding(4) var<storage,read> walls:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> owners:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> heads:array<atomic<u32>>;
@group(0) @binding(7) var<storage,read_write> links:array<u32>;
fn cell(p:vec2f)->vec2i{return clamp(vec2i(floor(p/8.)),vec2i(0),vec2i(params.grid.xy)-1);}
fn index(p:vec2i)->u32{return u32(p.y)*u32(params.grid.x)+u32(p.x);}
@compute @workgroup_size(128) fn bucket(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;
 if(i<params.counts.x){let p=particles[i];if(p.state.w>.5&&p.body.z>0.){links[i]=atomicExchange(&heads[index(cell(p.pos.xy))],i+1u);}}
 if(i<params.counts.y){links[${shared.capacity}u+i]=atomicExchange(&heads[params.counts.w+index(cell(units[i].position.xy))],i+1u);}
}
fn visible(a:vec2f,b:vec2f)->bool {
 let delta=b-a;
 for(var j=0u;j<params.counts.z;j++){
  let w=walls[j];var lo=0.;var hi=1.;
  for(var k=0u;k<2u;k++){
   if(abs(delta[k])<.00001){if(a[k]<w[k]||a[k]>w[k]+w[k+2u]){hi=-1.;}}
   else {let t0=(w[k]-a[k])/delta[k];let t1=(w[k]+w[k+2u]-a[k])/delta[k];lo=max(lo,min(t0,t1));hi=min(hi,max(t0,t1));}
  }
  if(hi>=lo){return false;}
 }return true;
}
@compute @workgroup_size(64) fn sense(@builtin(global_invocation_id) gid:vec3u){
 let u=gid.x;if(u>=params.counts.y){return;}let unit=units[u];if(unit.position.w>=6.){return;}var best=unit.position.z+select(8.,12.,unit.position.w>=3.);if(unit.position.w==3.){best+=8.;}var result=Result(vec4f(-1,0,0,0),vec4f(0));
 let low=cell(unit.position.xy-vec2f(best+4.));let high=cell(unit.position.xy+vec2f(best+4.));
 for(var y=low.y;y<=high.y;y++){for(var x=low.x;x<=high.x;x++){
 var link=atomicLoad(&heads[index(vec2i(x,y))]);
 loop {if(link==0u){break;}let i=link-1u;link=links[i];
  let p=particles[i];if(p.state.w<.5||p.body.z<=0.){continue;}
  let d=distance(p.pos.xy,unit.position.xy);
  if(d<p.body.x+1.0&&visible(unit.position.xy,p.pos.xy)){let frontal=dot((p.pos.xy-unit.position.xy)/max(d,.01),vec2f(cos(unit.impact.z),sin(unit.impact.z)))>.55;
   let shield=select(1.,1.-.75*unit.impact.w,unit.position.w==5.&&frontal);
   result.contact.x+=(10.+min(40.,p.state.y*.15))*shield;result.contact+=vec4f(0.,(unit.position.xy-p.pos.xy)/max(d,.01)*(p.body.x+1.-d)*.8,0.);result.contact.w=max(result.contact.w,p.state.y);}
  let inFront=unit.position.w!=5.||dot((p.pos.xy-unit.position.xy)/max(d,.01),vec2f(cos(unit.impact.z),sin(unit.impact.z)))>.55;
  if(inFront&&d<best&&visible(unit.position.xy,p.pos.xy)){best=d;result.aim=vec4f(f32(i),p.status.w,p.pos.xy);}
 }
 }}results[u]=result;
}
// Find a single body at the actual landing point; a moving target can leave it empty.
@compute @workgroup_size(64) fn impactTargets(@builtin(global_invocation_id) gid:vec3u){
 let u=gid.x;if(u>=params.counts.y){return;}let unit=units[u];if(unit.position.w!=6.){return;}
 var best=4.;var result=Result(vec4f(-1,0,0,0),vec4f(0));
 let low=cell(unit.position.xy-vec2f(4.));let high=cell(unit.position.xy+vec2f(4.));
 for(var y=low.y;y<=high.y;y++){for(var x=low.x;x<=high.x;x++){
 var link=atomicLoad(&heads[index(vec2i(x,y))]);
 loop {if(link==0u){break;}let i=link-1u;link=links[i];let p=particles[i];
 if(p.state.w<.5||p.body.z<=0.){continue;}let d=distance(p.pos.xy,unit.position.xy);
 if(d<best&&d<=max(.45,p.body.x*.8)&&visible(unit.position.xy,p.pos.xy)){best=d;result.aim=vec4f(f32(i),p.status.w,0,0);}
 }}}results[u]=result;
}
@compute @workgroup_size(128) fn damage(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=params.counts.x){return;}var p=particles[i];if(p.state.w<.5||p.body.z<=0.){return;}
 let low=cell(p.pos.xy-vec2f(params.grid.w));let high=cell(p.pos.xy+vec2f(params.grid.w));
 for(var y=low.y;y<=high.y;y++){for(var x=low.x;x<=high.x;x++){
 var link=atomicLoad(&heads[params.counts.w+index(vec2i(x,y))]);
 loop {if(link==0u){break;}let u=link-1u;link=links[${shared.capacity}u+u];
  let unit=units[u];
  let delta=p.pos.xy-unit.position.xy;let d=length(delta);let kind=unit.position.w;
  let front=dot(delta/max(d,.01),vec2f(cos(unit.impact.z),sin(unit.impact.z)))>.55;
  let brace=select(0.,unit.impact.w,kind==5.&&front);let radius=p.body.x+.45+brace*.45;
  if(kind<6.&&d<radius&&visible(unit.position.xy,p.pos.xy)){p.pos+=vec4f(0.,0.,delta/max(d,.01)*(radius-d)*params.grid.z*(18.+brace*90.)/max(1.,p.body.y));}
  if(unit.shot.z<=0.){continue;}
  var hit=unit.shot.x==f32(i)&&unit.shot.y==p.status.w&&d<=unit.position.z;
  if(kind==1.||kind==7.){hit=distance(p.pos.xy,unit.impact.xy)<=3.5&&visible(unit.impact.xy,p.pos.xy);}
  if(kind==2.||kind==3.){let alignment=dot(delta/max(d,.001),vec2f(cos(unit.impact.z),sin(unit.impact.z)));hit=d<=unit.position.z&&alignment>=select(.65,.35,kind==3.);}
  if(kind==6.){hit=results[u].aim.x==f32(i)&&results[u].aim.y==p.status.w;}
  if(hit&&visible(unit.position.xy,p.pos.xy)){if(kind==6.){results[u].contact.x=1.;}p.body.z-=unit.shot.z;atomicStore(&owners[i],u32(unit.shot.w));}
 }}}particles[i]=p;
}`});
  const errors=(await shader.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},...[1,2,3,4,5,6,7].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:([2,4].includes(binding)?'read-only-storage':'storage') as GPUBufferBindingType}}))]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const sense=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'sense'}}),damage=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'damage'}});
  const impactTargets=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'impactTargets'}});
  const bucket=device.createComputePipeline({layout:pipelineLayout,compute:{module:shader,entryPoint:'bucket'}});
  let liveIds:number[]=[];
  return {threats,get liveIds(){return liveIds;},reset(){version++;threats.clear();liveIds=[];},encode(encoder:GPUCommandEncoder,soldiers:Soldier[],shots:RifleShot[],map:WorldMap,count:number,sample:boolean,research:readonly string[]=[],dt=1/60,lineOfSightMap:WorldMap=map,impacts:readonly InfantryProjectile[]=[],onImpact?:(projectile:InfantryProjectile,hit:boolean)=>void){
    const live=soldiers.filter(s=>s.health>0),unitCount=live.length+impacts.length;if(!unitCount){liveIds=[];threats.clear();return;}
    if(unitCount>capacity){
      capacity=2**Math.ceil(Math.log2(unitCount));units.destroy();results.destroy();if(!busy)read.destroy();links.destroy();
      units=storage(capacity*48);
      results=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
      read=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      links=storage((shared.capacity+capacity)*4);
    }
    const width=Math.ceil(map.width/8),height=Math.ceil(map.height/8),cells=width*height;
    if(cells>gridCapacity){heads.destroy();gridCapacity=cells;heads=storage(cells*8);}
    if(lineOfSightMap.obstacles.length>wallCapacity){walls.destroy();wallCapacity=2**Math.ceil(Math.log2(lineOfSightMap.obstacles.length));walls=device.createBuffer({size:wallCapacity*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});}
    if(lineOfSightMap.obstacles.length)device.queue.writeBuffer(walls,0,new Float32Array(lineOfSightMap.obstacles.flatMap(o=>[o.x,o.y,o.width,o.height])));
    device.queue.writeBuffer(params,0,new Uint32Array([count,unitCount,lineOfSightMap.obstacles.length,cells]));
    liveIds=[];const shotMap=new Map(shots.map(s=>[s.soldier,s]));let maxRange=4;const data=new Float32Array(unitCount*12);
    live.forEach((s,i)=>{const shot=shotMap.get(s.id),stats=infantryStats(s.kind,s.quality,s.defense,s.veterancy,research),slot=s.id-1,owner=slot<MAX_INFANTRY_KILL_SLOTS?MAX_TOWERS+slot+1:0;if(owner)liveIds[slot]=s.id;maxRange=Math.max(maxRange,stats.range+3.5);data.set([s.x,s.y,stats.range,infantryCombatKind(s.kind),shot?.target??-1,shot?.generation??0,shot?.damage??0,owner,shot?.x??0,shot?.y??0,s.angle,s.brace??0],i*12);});
    impacts.forEach((p,i)=>{const slot=p.soldier-1,owner=slot<MAX_INFANTRY_KILL_SLOTS?MAX_TOWERS+slot+1:0;if(owner)liveIds[slot]=p.soldier;data.set([p.target.x,p.target.y,4,p.kind==='arrow'?6:7,-1,0,p.damage,owner,p.target.x,p.target.y,0,0],(live.length+i)*12);});
    device.queue.writeBuffer(units,0,data);
    device.queue.writeBuffer(params,16,new Float32Array([width,height,dt,maxRange]));encoder.clearBuffer(heads);encoder.clearBuffer(results);
    const group=device.createBindGroup({layout,entries:[params,shared.particles,units,results,walls,shared.damageOwners!,heads,links].map((buffer,binding)=>({binding,resource:{buffer}}))});
    {const pass=encoder.beginComputePass();pass.setPipeline(bucket);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(Math.max(count,unitCount)/128));pass.end();}
    if(impacts.length){const pass=encoder.beginComputePass();pass.setPipeline(impactTargets);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(unitCount/64));pass.end();}
    if(count){const pass=encoder.beginComputePass();pass.setPipeline(damage);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/128));pass.end();}
    let finishImpacts:(()=>void)|undefined;
    if(impacts.length&&onImpact){
      const pending=device.createBuffer({size:impacts.length*32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),current=version;
      encoder.copyBufferToBuffer(results,live.length*32,pending,0,impacts.length*32);
      finishImpacts=()=>{void pending.mapAsync(GPUMapMode.READ).then(()=>{const values=new Float32Array(pending.getMappedRange());if(current===version)impacts.forEach((p,i)=>onImpact(p,values[i*8+4]>0));pending.unmap();}).catch(error=>console.warn('Projectile impact feedback unavailable',error)).finally(()=>pending.destroy());};
    }
    if(!sample||busy||!live.length)return finishImpacts;
    const pass=encoder.beginComputePass();pass.setPipeline(sense);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(live.length/64));pass.end();
    encoder.copyBufferToBuffer(results,0,read,0,live.length*32);busy=true;const current=version,ids=live.map(s=>s.id),pending=read;
    return ()=>{finishImpacts?.();return pending.mapAsync(GPUMapMode.READ).then(()=>{const data=new Float32Array(pending.getMappedRange());if(current===version){threats.clear();ids.forEach((id,i)=>threats.set(id,{target:data[i*8],generation:data[i*8+1],x:data[i*8+2],y:data[i*8+3],contact:data[i*8+4],pushX:data[i*8+5],pushY:data[i*8+6],pressure:data[i*8+7],age:0}));}pending.unmap();}).catch(error=>console.warn('Infantry sensing unavailable',error)).finally(()=>{busy=false;if(pending!==read)pending.destroy();});};
  },destroy(){version++;params.destroy();units.destroy();results.destroy();read.destroy();walls.destroy();heads.destroy();links.destroy();}};
}
