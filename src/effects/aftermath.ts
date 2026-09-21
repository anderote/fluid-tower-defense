import {PARTICLE_WGSL,type SharedGPU} from '../contracts/index.ts';
import {TESLA_STATE_WGSL} from './tesla.ts';

export const CORPSE_CAPACITY=2048,HIT_CAPACITY=1024,AFTERMATH_BATCH=512;
export const AFTERMATH_HEADER_BYTES=32,AFTERMATH_RECORD_BYTES=48;
export const AFTERMATH_BYTES=AFTERMATH_HEADER_BYTES+(CORPSE_CAPACITY+HIT_CAPACITY)*AFTERMATH_RECORD_BYTES;
export const AFTERMATH_WGSL=`
struct Remnant {body:vec4f,force:vec4f,life:vec4f}; // body: position/radius/kind; force: direction/facing/cause; life: time/seed/damage/valid
struct Aftermath {
 heads:vec4u, // death cursor, hit cursor, retained deaths, retained hits
 deathsThisTick:atomic<u32>,hitsThisTick:atomic<u32>,padding:vec2u,
 deaths:array<Remnant,${CORPSE_CAPACITY}>,hits:array<Remnant,${HIT_CAPACITY}>,
};
`;

/** Observes combat without writing particles, damage, Tesla state or attribution.
 * Each tick can publish at most 512 events per ring, so writers never alias even
 * when an entire 65k swarm dies together. Events outlive recycled particle slots.
 */
export async function createAftermathEvents(device:GPUDevice,shared:SharedGPU,resources:{uniforms:GPUBuffer;towers:GPUBuffer;states:GPUBuffer;owners:GPUBuffer;effects:GPUBuffer;tesla:GPUBuffer}){
  const events=device.createBuffer({label:'Persistent battlefield aftermath',size:AFTERMATH_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  shared.aftermath=events;
  const snapshots=device.createBuffer({label:'Combat visual snapshots',size:shared.capacity*64,usage:GPUBufferUsage.STORAGE});
  const shader=device.createShaderModule({label:'Capture combat aftermath',code:`${PARTICLE_WGSL}${TESLA_STATE_WGSL}${AFTERMATH_WGSL}
struct Params {clock:vec4f,goal:vec4f,damage:vec4f,reserved:vec4f};
struct Tower {position:vec4f,weapon:vec4f,flags:vec4f};
struct Shot {timing:vec4f,shot:vec4f,flags:vec4f};
struct Effect {position:vec4f,direction:vec4f,extra:vec4f};
struct Snapshot {before:vec4f,velocity:vec4f,hit:vec4f,shape:vec4f};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read> particles:array<Particle>;
@group(0) @binding(2) var<storage,read_write> snapshots:array<Snapshot>;
@group(0) @binding(3) var<storage,read_write> aftermath:Aftermath;
@group(0) @binding(4) var<storage,read> towers:array<Tower>;
@group(0) @binding(5) var<storage,read> shots:array<Shot>;
@group(0) @binding(6) var<storage,read> owners:array<u32>;
@group(0) @binding(7) var<storage,read> effects:array<Effect>;
@group(0) @binding(8) var<storage,read> electricity:TeslaState;
fn direction(v:vec2f)->vec2f{return select(vec2f(1,0),v/max(.001,length(v)),length(v)>.001);}
@compute @workgroup_size(128) fn before(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}let p=particles[i];
 snapshots[i]=Snapshot(vec4f(p.pos.xy,p.body.z,p.state.w),vec4f(p.pos.zw,p.status.w,p.state.z),vec4f(0),vec4f(p.body.x,atan2(p.pos.w,p.pos.z),0,p.body.z));
}
@compute @workgroup_size(128) fn hits(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}let p=particles[i];var s=snapshots[i];
 if(s.before.w<.5||p.status.w!=s.velocity.z){return;}
 let damage=max(0.,s.before.z-p.body.z);var cause=0.;var dir=direction(p.pos.zw-s.velocity.xy);
 let owner=owners[i];
 if(damage>0.&&owner>0u&&owner<=u32(params.clock.w)){
  let t=owner-1u;let kind=u32(towers[t].position.w);dir=vec2f(cos(shots[t].shot.w),sin(shots[t].shot.w));
  if(kind==1u||kind==12u){cause=1.;dir=direction(p.pos.xy-shots[t].timing.zw);}
  if(kind==13u){cause=4.;}if(kind==14u){cause=3.;}
 }
 for(var j=0u;j<u32(params.damage.z);j++){
  let e=effects[j];if(damage>0.&&e.position.w>0.&&select(distance(p.pos.xy,e.position.xy)<e.position.z,abs(p.pos.x-e.position.x)<=4.&&abs(p.pos.y-e.position.y)<=5.,e.extra.x==4.)){
   if(e.extra.x==0.){cause=1.;dir=direction(p.pos.xy-e.position.xy);}
   else if(e.extra.x==4.){cause=2.;dir=vec2f(0.,sign(p.pos.y-e.position.y));}
   else if(e.extra.x==3.){cause=0.;dir=direction(e.direction.xy);}
  }
 }
 s.hit=vec4f(dir,cause,damage);s.shape.w=p.body.z;snapshots[i]=s;
}
@compute @workgroup_size(128) fn collect(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}let p=particles[i];let s=snapshots[i];
 if(s.before.w<.5||p.status.w!=s.velocity.z){return;}
 let dead=p.state.w<-.5;let shock=electricity.victims[i].shock;
 // The custom Tesla system retains exclusive ownership of electrocution deaths.
 if(dead&&shock.x>0.&&shock.y==p.status.w&&shock.z>.5){return;}
 var cause=s.hit.z;if(dead&&s.shape.w>0.){cause=2.;}
 if(!dead&&(s.hit.w<.25||cause==4.)){return;}
 var event:Remnant;event.body=vec4f(select(s.before.xy,p.pos.xy,dead),s.shape.x,s.velocity.w);
 event.force=vec4f(s.hit.xy,s.shape.y,cause);event.life=vec4f(params.clock.y/60.,f32(i)*.731+p.status.w*7.13+params.clock.y*.17,s.hit.w,1.);
 if(dead){let ticket=atomicAdd(&aftermath.deathsThisTick,1u);if(ticket<${AFTERMATH_BATCH}u){aftermath.deaths[(aftermath.heads.x+ticket)%${CORPSE_CAPACITY}u]=event;}}
 else{let ticket=atomicAdd(&aftermath.hitsThisTick,1u);if(ticket<${AFTERMATH_BATCH}u){aftermath.hits[(aftermath.heads.y+ticket)%${HIT_CAPACITY}u]=event;}}
}
@compute @workgroup_size(1) fn finish(){
 let d=min(${AFTERMATH_BATCH}u,atomicLoad(&aftermath.deathsThisTick));let h=min(${AFTERMATH_BATCH}u,atomicLoad(&aftermath.hitsThisTick));
 aftermath.heads=vec4u((aftermath.heads.x+d)%${CORPSE_CAPACITY}u,(aftermath.heads.y+h)%${HIT_CAPACITY}u,min(${CORPSE_CAPACITY}u,aftermath.heads.z+d),min(${HIT_CAPACITY}u,aftermath.heads.w+h));
}
`});
  const compilation=await shader.getCompilationInfo();if(compilation.messages.some(m=>m.type==='error'))throw Error(compilation.messages.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
  const layout=device.createBindGroupLayout({entries:Array.from({length:9},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0?'uniform':binding===2||binding===3?'storage':'read-only-storage'}}))});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=await Promise.all(['before','hits','collect','finish'].map(entryPoint=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module:shader,entryPoint}})));
  const bind=device.createBindGroup({layout,entries:[resources.uniforms,shared.particles,snapshots,events,resources.towers,resources.states,resources.owners,resources.effects,resources.tesla].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const dispatch=(encoder:GPUCommandEncoder,index:number,count:number)=>{if(!count)return;const pass=encoder.beginComputePass({label:'Observe combat aftermath'});pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(index===3?1:Math.ceil(count/128));pass.end();};
  return {
    before(encoder:GPUCommandEncoder,count:number){dispatch(encoder,0,count);},
    hits(encoder:GPUCommandEncoder,count:number){dispatch(encoder,1,count);},
    after(encoder:GPUCommandEncoder,count:number){encoder.clearBuffer(events,16,16);dispatch(encoder,2,count);dispatch(encoder,3,count);},
    reset(){device.queue.writeBuffer(events,0,new Uint8Array(AFTERMATH_BYTES));},
    destroy(){snapshots.destroy();events.destroy();}
  };
}
