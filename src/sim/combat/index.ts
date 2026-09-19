import { PARTICLE_WGSL, MAX_EFFECTS, type SharedGPU, type PhysicsFrame, type Tower, type TowerDef } from '../../contracts/index.ts';
import { towerBehavior } from '../../content/index.ts';

const MAX_TOWERS=64;
export interface CombatFrame extends PhysicsFrame { towers:readonly {tower:Tower;definition:TowerDef}[] }
export interface ShotSnapshot { id:number;x:number;y:number;angle:number;fired:boolean }
export interface CombatModule { encodeBefore(encoder:GPUCommandEncoder,frame:CombatFrame):void;encodeAfter(encoder:GPUCommandEncoder,frame:CombatFrame):void;reset():void;destroy():void;readonly shotState:GPUBuffer }

/** GPU targeting and damage. Physics receives tower impulses directly in particle velocity. */
export async function createCombat(device:GPUDevice,shared:SharedGPU):Promise<CombatModule>{
  const uniforms=device.createBuffer({label:'Combat params',size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const towers=device.createBuffer({label:'Tower definitions',size:MAX_TOWERS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const state=device.createBuffer({label:'Tower firing state',size:MAX_TOWERS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const effects=device.createBuffer({label:'Manual damage effects',size:MAX_EFFECTS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const ownedBoss=!shared.bossState;
  const bossBuffer=shared.bossState??device.createBuffer({label:'Inactive boss placeholder',size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const preamble=`${PARTICLE_WGSL}
struct Params { clock:vec4f, goal:vec4f, damage:vec4f, reserved:vec4f };
struct Tower { position:vec4f, weapon:vec4f, flags:vec4f };
struct TowerState { timing:vec4f, shot:vec4f, flags:vec4f };
struct Effect { position:vec4f, direction:vec4f, extra:vec4f };
struct Boss { motion:vec4f, body:vec4f, mode:vec4f, flags:vec4f };
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> towers:array<Tower>;
@group(0) @binding(3) var<storage,read_write> states:array<TowerState>;
@group(0) @binding(4) var<storage,read> effects:array<Effect>;
@group(0) @binding(5) var<storage,read_write> counters:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> boss:array<Boss>;
fn safeDir(delta:vec2f)->vec2f { return delta/max(length(delta),0.0001); }
`;
  const shader=device.createShaderModule({label:'Combat compute',code:preamble+`
@compute @workgroup_size(64) fn acquire(@builtin(global_invocation_id) gid:vec3u){
 let t=gid.x;if(t>=u32(params.clock.w)){return;}let def=towers[t];var s=states[t];
 if(s.flags.x!=def.flags.x){s=TowerState(vec4f(0),vec4f(0),vec4f(def.flags.x,0,0,0));}
 if(s.timing.y>0.0 && s.timing.y!=def.weapon.x){s.timing.x=s.timing.x/s.timing.y*def.weapon.x;}
 s.timing.y=def.weapon.x;s.timing.x=max(0.0,s.timing.x-params.clock.x);s.shot.x=0;
 if(s.timing.x>0.0){states[t]=s;return;}
 var best=-1e20;var found=false;var selected=0u;
 for(var i=0u;i<u32(params.clock.z);i++){
  let p=particles[i];if(p.state.w<0.5 || p.body.z<=0.0){continue;}
  let d=distance(p.pos.xy,def.position.xy);if(d>def.position.z){continue;}
  var score=-distance(p.pos.xy,params.goal.xy);
  if(u32(def.position.w)==1u){score=p.state.x*12.0-d*.03;}
  if(u32(def.position.w)==0u||u32(def.position.w)==3u){score=-d;}
  if(score>best){best=score;selected=i;found=true;}
 }
 let b=boss[0];let bossDistance=distance(b.motion.xy,def.position.xy);
 let bossScore=-distance(b.motion.xy,params.goal.xy)+select(0.0,30.0,u32(def.position.w)==2u);
 if(b.mode.z>.5&&b.body.z>0&&bossDistance<=def.position.z&&(!found||bossScore>best)){
  s.timing=vec4f(def.weapon.x,def.weapon.x,b.motion.xy);s.shot=vec4f(1,-1,b.flags.x,atan2(b.motion.y-def.position.y,b.motion.x-def.position.x));
 }else if(found){let p=particles[selected];s.timing=vec4f(def.weapon.x,def.weapon.x,p.pos.xy);s.shot=vec4f(1,f32(selected),p.status.w,atan2(p.pos.y-def.position.y,p.pos.x-def.position.x));}
 states[t]=s;
}
@compute @workgroup_size(128) fn hit(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<0.5||p.body.z<=0){return;}
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=states[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==2u){let rail=def.flags.w>.5;let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(rail){let offset=p.pos.xy-def.position.xy;let along=dot(offset,forward);let across=abs(offset.x*forward.y-offset.y*forward.x);if(along>=0.&&along<=def.position.z&&across<=1.05){let fall=max(.35,1.-along/max(def.position.z,.001));let kick=forward*def.weapon.z*fall/max(.1,p.body.y);p.body.z-=def.weapon.y*fall;p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;}}else if(s.shot.y>=0&&u32(s.shot.y)==i&&s.shot.z==p.status.w){let kick=forward*def.weapon.z/max(.1,p.body.y);p.body.z-=def.weapon.y;p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;if(def.flags.y==1){p.status.x=max(p.status.x,.25);}}continue;}
  var origin=def.position.xy;var rad=def.position.z;
  if(kind==1u){origin=s.timing.zw;rad=def.weapon.w;}
  let delta=p.pos.xy-origin;let dist=length(delta);if(dist>rad){continue;}
  let forward=vec2f(cos(s.shot.w),sin(s.shot.w));
  let coneCos=cos(clamp(def.weapon.w*.18,.25,1.35));
  if(kind!=1u&&dot(safeDir(delta),forward)<coneCos){continue;}
  let falloff=max(.12,1.0-dist/max(rad,.001));
  p.body.z-=def.weapon.y*falloff;
  if(kind==3u){let kick=forward*def.weapon.z*falloff/max(.1,p.body.y);p.status.x=max(p.status.x,2.2);p.status.y=max(p.status.y,1.6);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;}else{
   let direction=select(forward,safeDir(delta),kind==1u);p.pos.z+=direction.x*def.weapon.z*falloff/max(.1,p.body.y);p.pos.w+=direction.y*def.weapon.z*falloff/max(.1,p.body.y);
  }
 }
 for(var e=0u;e<u32(params.damage.z);e++){
  let f=effects[e];let delta=p.pos.xy-f.position.xy;let dist=length(delta);if(dist>f.position.z){continue;}
  if(f.extra.x==1.0&&f.direction.z>0&&dot(safeDir(delta),f.direction.xy)<cos(f.direction.z*.5)){continue;}
  p.body.z-=f.position.w*max(0.0,1.0-dist/max(.001,f.position.z));
  if(f.extra.x==2.0){p.status.x=max(p.status.x,2.2);p.status.y=max(p.status.y,1.6);}
 }
 particles[i]=p;
}
@compute @workgroup_size(1) fn hitBoss(){
 var b=boss[0];if(b.mode.z<.5||b.body.z<=0){return;}
 let vulnerable=select(1.0,1.6,b.mode.x==1.0||b.mode.x==3.0);
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=states[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==2u){if(s.shot.y<0&&s.shot.z==b.flags.x){b.body.z-=def.weapon.y*vulnerable;}continue;}
  let origin=select(def.position.xy,s.timing.zw,kind==1u);let rad=select(def.position.z,def.weapon.w,kind==1u);let delta=b.motion.xy-origin;let dist=max(0.0,length(delta)-b.body.x);if(dist>rad){continue;}
  let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(kind!=1u&&dot(safeDir(delta),forward)<cos(clamp(def.weapon.w*.18,.25,1.35))){continue;}
  b.body.z-=def.weapon.y*max(.25,1.0-dist/max(rad,.001))*vulnerable;
  if(kind==3u){b.flags.w=max(b.flags.w,1.0);}
 }
 boss[0]=b;
}
@compute @workgroup_size(128) fn settle(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<.5){return;}
 let kind=u32(p.state.z);let tolerance=select(1.0,2.1,kind==2u);
 // Exposure is physics-owned until this settlement consumes it.
 let brittle=select(1.0,1.7,p.status.y>0.0);
 let crush=max(0.0,p.status.z)*brittle/tolerance;
 let wasAlive=p.body.z>0.0;p.body.z-=crush;p.status.z=0;
 if(p.body.z<=0.0){p.body.z=0;p.body.w=-params.clock.y;p.state.w=-1;atomicAdd(&counters[0],1u);if(wasAlive&&crush>0){atomicAdd(&counters[1],1u);}atomicAdd(&counters[3],select(3u,8u,kind==2u));}
 else if(params.goal.w<.5&&distance(p.pos.xy,params.goal.xy)<params.goal.z){p.state.w=0;atomicAdd(&counters[2],select(1u,3u,kind==2u));}
 else{atomicAdd(&counters[4],1u);atomicMax(&counters[6],u32(clamp(p.state.x,0.0,1000.0)*1000.0));}
 p.status.y=max(0.0,p.status.y-params.clock.x);
 particles[i]=p;
}`});
  const info=await shader.getCompilationInfo();const failures=info.messages.filter(m=>m.type==='error');if(failures.length)throw new Error(failures.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
  const layout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
    {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  ]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=await Promise.all(['acquire','hit','settle','hitBoss'].map(entryPoint=>device.createComputePipelineAsync({label:`Combat ${entryPoint}`,layout:pipelineLayout,compute:{module:shader,entryPoint}})));
  const bind=device.createBindGroup({layout,entries:[uniforms,shared.particles,towers,state,effects,shared.counters,bossBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))});
  function dispatch(encoder:GPUCommandEncoder,index:number,groups:number){if(!groups)return;const pass=encoder.beginComputePass({label:['Target selection','Weapon effects','Settlement'][index]});pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();}
  return {
    shotState:state,
    encodeBefore(encoder,frame){
      if(frame.towers.length>MAX_TOWERS||frame.effects.length>MAX_EFFECTS)throw new Error('Combat command capacity exceeded');
      const u=new Float32Array([frame.dt,frame.tick,frame.count,frame.towers.length,frame.map.goal.x,frame.map.goal.y,frame.map.goalRadius,frame.lab?1:0,frame.tuning.crushDamage,frame.tuning.crushThreshold,frame.effects.length,0,0,0,0,0]);device.queue.writeBuffer(uniforms,0,u);
      const data=new Float32Array(Math.max(1,frame.towers.length)*12);
      frame.towers.forEach(({tower:t,definition:d},i)=>{data.set([t.x,t.y,d.range,towerBehavior(t.kind),d.cooldown,d.damage,d.force,d.radius,t.id,t.branch,t.level,t.kind==='railgun'?1:0],i*12);});device.queue.writeBuffer(towers,0,data);
      if(frame.effects.length){const values=new Float32Array(frame.effects.length*12);frame.effects.forEach((e,i)=>values.set([e.x,e.y,e.radius,e.damage,e.direction.x,e.direction.y,e.cone,e.duration,['blast','push','slow','shot'].indexOf(e.kind),e.strength,e.source,0],i*12));device.queue.writeBuffer(effects,0,values);}
      dispatch(encoder,0,Math.ceil(frame.towers.length/64));dispatch(encoder,1,Math.ceil(frame.count/128));dispatch(encoder,3,1);
    },
    encodeAfter(encoder,frame){encoder.clearBuffer(shared.counters,16,4);encoder.clearBuffer(shared.counters,24,4);dispatch(encoder,2,Math.ceil(frame.count/128));},
    reset(){device.queue.writeBuffer(state,0,new Float32Array(MAX_TOWERS*12));},
    destroy(){uniforms.destroy();towers.destroy();state.destroy();effects.destroy();if(ownedBoss)bossBuffer.destroy();},
  };
}
