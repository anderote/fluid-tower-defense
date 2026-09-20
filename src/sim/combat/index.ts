import {FIRE_STATE_BYTES,FIRE_STATE_WGSL,FIRE_BURN_SECONDS} from '../../effects/fire.ts';
import {TESLA_STATE_WGSL,TESLA_LINKS,TESLA_HEADER_BYTES,TESLA_PARTICLE_BYTES} from '../../effects/tesla.ts';
import {createAftermathEvents} from '../../effects/aftermath.ts';
import { PARTICLE_WGSL, HORDE_PRESSURE_COUNTER, MAX_EFFECTS, type SharedGPU, type PhysicsFrame, type Tower, type TowerDef } from '../../contracts/index.ts';
import { ENEMY_BOUNTY_DIVISOR, ENEMY_WGSL, towerBehavior } from '../../content/index.ts';

const MAX_TOWERS=64;
export interface CombatFrame extends PhysicsFrame { towers:readonly {tower:Tower;definition:TowerDef}[] }
export interface ShotSnapshot { id:number;x:number;y:number;angle:number;fired:boolean }
export interface CombatModule { encodeBefore(encoder:GPUCommandEncoder,frame:CombatFrame):void;encodeAfter(encoder:GPUCommandEncoder,frame:CombatFrame):void;reset():void;clearAftermath():void;resetAttribution():void;destroy():void;readonly shotState:GPUBuffer }

/** GPU targeting and damage. Physics receives tower impulses directly in particle velocity. */
export async function createCombat(device:GPUDevice,shared:SharedGPU):Promise<CombatModule>{
  const uniforms=device.createBuffer({label:'Combat params',size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const towers=device.createBuffer({label:'Tower definitions',size:MAX_TOWERS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const state=device.createBuffer({label:'Tower firing state',size:MAX_TOWERS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const effects=device.createBuffer({label:'Manual damage effects',size:MAX_EFFECTS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const tesla=device.createBuffer({label:'Tesla chain and electrocution state',size:TESLA_HEADER_BYTES+shared.capacity*TESLA_PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  shared.teslaState=tesla;
  const heat=device.createBuffer({label:'Burn status',size:shared.capacity*FIRE_STATE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  shared.heatState=heat;
  const ownership=device.createBuffer({label:'Last tower damage owner',size:shared.capacity*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const ownedBoss=!shared.bossState;
  const bossBuffer=shared.bossState??device.createBuffer({label:'Inactive boss placeholder',size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const preamble=`${PARTICLE_WGSL}
${ENEMY_WGSL}
${TESLA_STATE_WGSL}
struct Params { clock:vec4f, goal:vec4f, damage:vec4f, reserved:vec4f };
struct Tower { position:vec4f, weapon:vec4f, flags:vec4f };
struct TowerState { timing:vec4f, shot:vec4f, flags:vec4f };
struct Effect { position:vec4f, direction:vec4f, extra:vec4f };
${FIRE_STATE_WGSL}
struct Boss { motion:vec4f, body:vec4f, mode:vec4f, flags:vec4f };
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> towers:array<Tower>;
@group(0) @binding(3) var<storage,read_write> states:array<TowerState>;
@group(0) @binding(4) var<storage,read> effects:array<Effect>;
@group(0) @binding(5) var<storage,read_write> counters:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> boss:array<Boss>;
@group(0) @binding(7) var<storage,read_write> heat:array<Heat>;
@group(0) @binding(8) var<storage,read_write> owners:array<atomic<u32>>;
@group(0) @binding(9) var<storage,read_write> electricity:TeslaState;
fn safeDir(delta:vec2f)->vec2f { return delta/max(length(delta),0.0001); }
fn blastFalloff(distance:f32,radius:f32)->f32 {
 let safeRadius=max(radius,.0001);if(distance>=safeRadius){return 0.;}
 let coreRadius=safeRadius*.2;let inverseRadius=coreRadius/max(coreRadius,distance);
 let edgeTaper=1.-smoothstep(.8,1.,distance/safeRadius);
 return inverseRadius*edgeTaper;
}
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
  s.timing=vec4f(def.weapon.x,def.weapon.x,b.motion.xy);s.shot=vec4f(1,-1,b.flags.x,atan2(b.motion.y-def.position.y,b.motion.x-def.position.x));s.flags.y+=1.;
 }else if(found){let p=particles[selected];s.timing=vec4f(def.weapon.x,def.weapon.x,p.pos.xy);s.shot=vec4f(1,f32(selected),p.status.w,atan2(p.pos.y-def.position.y,p.pos.x-def.position.x));s.flags.y+=1.;}
 if(u32(def.position.w)==13u&&s.shot.x>.5){
  s.flags.z=params.clock.y+1.;
  let base=t*${TESLA_LINKS}u;
  for(var hop=0u;hop<${TESLA_LINKS}u;hop++){electricity.links[base+hop]=vec4f(0,0,-2,0);}
  electricity.links[base]=vec4f(s.timing.zw,s.shot.y,s.shot.z);
  var origin=s.timing.zw;
  let limit=select(4u,${TESLA_LINKS}u,def.flags.y==1.);
  for(var hop=1u;hop<limit;hop++){
   var nearest=def.weapon.w*1.35;var candidate=-1;var generation=0.;var position=vec2f(0);
   for(var i=0u;i<u32(params.clock.z);i++){
    let p=particles[i];if(p.state.w<.5||p.body.z<=0.){continue;}
    var visited=false;for(var prior=0u;prior<hop;prior++){if(electricity.links[base+prior].z==f32(i)){visited=true;}}
    if(visited){continue;}let d=distance(origin,p.pos.xy);
    if(d<nearest){nearest=d;candidate=i32(i);generation=p.status.w;position=p.pos.xy;}
   }
   if(candidate<0){break;}
   electricity.links[base+hop]=vec4f(position,f32(candidate),generation);origin=position;
  }
 }
 states[t]=s;
}
@compute @workgroup_size(128) fn hit(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<0.5||p.body.z<=0){return;}
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=states[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==2u){let rail=def.flags.w>.5;let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(rail){let offset=p.pos.xy-def.position.xy;let along=dot(offset,forward);let across=abs(offset.x*forward.y-offset.y*forward.x);if(along>=0.&&along<=def.position.z&&across<=1.05){let fall=max(.35,1.-along/max(def.position.z,.001));let kick=forward*def.weapon.z*fall/max(.1,p.body.y);p.body.z-=def.weapon.y*fall;atomicStore(&owners[i],t+1u);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;}}else if(s.shot.y>=0&&u32(s.shot.y)==i&&s.shot.z==p.status.w){let kick=forward*def.weapon.z/max(.1,p.body.y);p.body.z-=def.weapon.y;atomicStore(&owners[i],t+1u);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;p.status.x=max(p.status.x,select(.18,.55,def.flags.y==1));}continue;}
  if(kind==13u){
   for(var hop=0u;hop<${TESLA_LINKS}u;hop++){
    let link=electricity.links[t*${TESLA_LINKS}u+hop];
    if(link.z==f32(i)&&link.w==p.status.w&&p.body.z>0.){
     let power=select(.52*pow(.82,f32(hop)-1.),1.,hop==0u);
     p.body.z-=def.weapon.y*power;atomicStore(&owners[i],t+1u);
     p.status.y=max(p.status.y,.8);p.status.x=max(p.status.x,.32);
     electricity.victims[i].shock=vec4f(params.clock.y+1.,p.status.w,select(0.,1.,p.body.z<=0.),power);
     if(p.body.z<=0.){electricity.victims[i].corpse=vec4f(p.pos.xy,p.body.x,params.clock.y+1.);}
    }
   }
   continue;
  }
  if(kind==14u){let delta=p.pos.xy-def.position.xy;let dist=length(delta);let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(dist<=def.position.z&&dot(safeDir(delta),forward)>=cos(clamp(def.weapon.w*.18,.25,1.35))){let fall=max(.2,1.-dist/max(def.position.z,.001));let previous=heat[i].burn;heat[i].burn=vec4f(${FIRE_BURN_SECONDS},max(select(0.,previous.y,fireActive(previous,p.status.w)),def.weapon.y*fall),p.status.w,select(params.clock.y+1.,previous.w,fireActive(previous,p.status.w)));atomicStore(&owners[i],t+1u);}continue;}
  if(kind==12u){let side=vec2f(-sin(s.shot.w),cos(s.shot.w));let spread=def.weapon.w*.48;let blastRadius=def.weapon.w*.55;var best=0.;var blastDirection=vec2f(0.);for(var salvo=0u;salvo<3u;salvo++){let center=s.timing.zw+side*(f32(salvo)-1.)*spread;let delta=p.pos.xy-center;let dist=length(delta);let fall=blastFalloff(dist,blastRadius);if(fall>best){best=fall;blastDirection=safeDir(delta);}}if(best>0.){p.body.z-=def.weapon.y*best;atomicStore(&owners[i],t+1u);let kick=blastDirection*def.weapon.z*best/max(.1,p.body.y);p.pos.z+=kick.x;p.pos.w+=kick.y;}continue;}
  var origin=def.position.xy;var rad=def.position.z;
  if(kind==1u){origin=s.timing.zw;rad=def.weapon.w;}
  let delta=p.pos.xy-origin;let dist=length(delta);if(dist>rad){continue;}
  let forward=vec2f(cos(s.shot.w),sin(s.shot.w));
  let coneCos=cos(clamp(def.weapon.w*.18,.25,1.35));
  if(kind!=1u&&dot(safeDir(delta),forward)<coneCos){continue;}
  let falloff=select(max(.12,1.0-dist/max(rad,.001)),blastFalloff(dist,rad),kind==1u);
  p.body.z-=def.weapon.y*falloff;
  atomicStore(&owners[i],t+1u);
  if(kind==3u){let kick=forward*def.weapon.z*falloff/max(.1,p.body.y);p.status.x=max(p.status.x,2.2);p.status.y=max(p.status.y,1.6);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;}else{
   let direction=select(forward,safeDir(delta),kind==1u);p.pos.z+=direction.x*def.weapon.z*falloff/max(.1,p.body.y);p.pos.w+=direction.y*def.weapon.z*falloff/max(.1,p.body.y);
  }
 }
 for(var e=0u;e<u32(params.damage.z);e++){
  let f=effects[e];let delta=p.pos.xy-f.position.xy;let dist=length(delta);if(dist>f.position.z){continue;}
  if(f.extra.x==1.0&&f.direction.z>0&&dot(safeDir(delta),f.direction.xy)<cos(f.direction.z*.5)){continue;}
  let effectFalloff=select(max(0.0,1.0-dist/max(.001,f.position.z)),blastFalloff(dist,f.position.z),f.extra.x==0.0);
  p.body.z-=f.position.w*effectFalloff;
  if(f.extra.x==2.0){p.status.x=max(p.status.x,max(.1,f.extra.w));p.status.y=max(p.status.y,1.6);}
 }
 particles[i]=p;
}
@compute @workgroup_size(128) fn burn(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];var h=heat[i];
 if(h.burn.z!=p.status.w||abs(p.state.w)<.5){heat[i]=Heat(vec4f(0));return;}
 if(p.state.w<.5||p.body.z<=0.){h.burn.x=max(0.,h.burn.x-params.clock.x);heat[i]=h;return;}
 if(fireActive(h.burn,p.status.w)){
  p.body.z-=h.burn.y*params.clock.x;h.burn.x=max(0.,h.burn.x-params.clock.x);
  // Panic is an impulse before physics: walls, contacts and navigation still resolve it.
  let speed=length(p.pos.zw);let heading=select(vec2f(1.,0.),p.pos.zw/max(.001,speed),speed>.1);
  let side=vec2f(-heading.y,heading.x);let panic=sin(params.clock.y*.17+f32(i)*2.399);
  let desired=(heading+side*panic*.85)*enemySpeed(u32(p.state.z))*1.65;
  p.pos=vec4f(p.pos.xy,mix(p.pos.zw,desired,min(1.,params.clock.x*7.)));
 }
 heat[i]=h;particles[i]=p;
}
@compute @workgroup_size(1) fn hitBoss(){
 var b=boss[0];if(b.mode.z<.5||b.body.z<=0){return;}
 let vulnerable=select(1.0,1.6,b.mode.x==1.0||b.mode.x==3.0);
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=states[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==2u){if(s.shot.y<0&&s.shot.z==b.flags.x){b.body.z-=def.weapon.y*vulnerable;}continue;}
  if(kind==13u){if(s.shot.y<0&&s.shot.z==b.flags.x){b.body.z-=def.weapon.y*vulnerable;}continue;}
  if(kind==12u){let side=vec2f(-sin(s.shot.w),cos(s.shot.w));let spread=def.weapon.w*.48;let blastRadius=def.weapon.w*.55;var best=0.;for(var salvo=0u;salvo<3u;salvo++){let center=s.timing.zw+side*(f32(salvo)-1.)*spread;let dist=max(0.,length(b.motion.xy-center)-b.body.x);best=max(best,blastFalloff(dist,blastRadius));}if(best>0.){b.body.z-=def.weapon.y*best*vulnerable;}continue;}
  let targetedBlast=kind==1u;let origin=select(def.position.xy,s.timing.zw,targetedBlast);let rad=select(def.position.z,def.weapon.w,targetedBlast);let delta=b.motion.xy-origin;let dist=max(0.0,length(delta)-b.body.x);if(dist>rad){continue;}
  let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(kind!=1u&&dot(safeDir(delta),forward)<cos(clamp(def.weapon.w*.18,.25,1.35))){continue;}
  let falloff=select(max(.25,1.0-dist/max(rad,.001)),blastFalloff(dist,rad),targetedBlast);
  b.body.z-=def.weapon.y*falloff*vulnerable;
  if(kind==3u){b.flags.w=max(b.flags.w,1.0);}
 }
 boss[0]=b;
}
@compute @workgroup_size(128) fn settle(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<.5){return;}
 if(p.pos.x < -10.0 && p.state.y > 40.0){atomicStore(&counters[${HORDE_PRESSURE_COUNTER}],1u);}
 let kind=u32(clamp(p.state.z,0.0,5.0)+0.5);let tolerance=enemyCrushResistance(kind);
 // Exposure is physics-owned until this settlement consumes it.
 let brittle=select(1.0,1.7,p.status.y>0.0);
 let crush=max(0.0,p.status.z)*brittle/tolerance;
 let wasAlive=p.body.z>0.0;p.body.z-=crush;p.status.z=0;
 if(p.body.z<=0.0){p.body.z=0;p.body.w=-params.clock.y;p.state.w=-1;atomicAdd(&counters[0],1u);if(wasAlive&&crush>0){atomicAdd(&counters[1],1u);}else{let owner=atomicLoad(&owners[i]);if(owner>0u&&owner<=64u){atomicAdd(&counters[16u+owner-1u],1u);}}let bounty=enemyBountyPoints(kind);let prior=atomicAdd(&counters[15],bounty);let payout=(prior+bounty)/${ENEMY_BOUNTY_DIVISOR}u-prior/${ENEMY_BOUNTY_DIVISOR}u;if(payout>0u){atomicAdd(&counters[3],payout);}}
 else if(params.goal.w<.5&&distance(p.pos.xy,params.goal.xy)<params.goal.z){p.state.w=0;atomicAdd(&counters[2],enemyLeak(kind));}
 else{atomicAdd(&counters[4],1u);atomicMax(&counters[6],u32(clamp(p.state.x,0.0,1000.0)*1000.0));}
 if(p.state.w<.5){if(abs(p.state.w)<.5){heat[i]=Heat(vec4f(0));}atomicStore(&owners[i],0u);}
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
    {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:9,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  ]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=await Promise.all(['acquire','burn','hit','settle','hitBoss'].map(entryPoint=>device.createComputePipelineAsync({label:`Combat ${entryPoint}`,layout:pipelineLayout,compute:{module:shader,entryPoint}})));
  const bind=device.createBindGroup({layout,entries:[uniforms,shared.particles,towers,state,effects,shared.counters,bossBuffer,heat,ownership,tesla].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const aftermath=await createAftermathEvents(device,shared,{uniforms,towers,states:state,owners:ownership,effects,tesla});
  function dispatch(encoder:GPUCommandEncoder,index:number,groups:number){if(!groups)return;const pass=encoder.beginComputePass({label:['Target selection','Burn damage','Weapon effects','Settlement','Boss damage'][index]});pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();}
  return {
    shotState:state,
    encodeBefore(encoder,frame){
      if(frame.towers.length>MAX_TOWERS||frame.effects.length>MAX_EFFECTS)throw new Error('Combat command capacity exceeded');
      const u=new Float32Array([frame.dt,frame.tick,frame.count,frame.towers.length,frame.map.goal.x,frame.map.goal.y,frame.map.goalRadius,frame.lab?1:0,frame.tuning.crushDamage,0,frame.effects.length,0,0,0,0,0]);device.queue.writeBuffer(uniforms,0,u);
      const data=new Float32Array(Math.max(1,frame.towers.length)*12);
      frame.towers.forEach(({tower:t,definition:d},i)=>{data.set([t.x,t.y,d.range,towerBehavior(t.kind),d.cooldown,d.damage,d.force,d.radius,t.id,t.branch,t.kind==='tesla'?1:0,t.kind==='railgun'?1:0],i*12);});device.queue.writeBuffer(towers,0,data);
      if(frame.effects.length){const values=new Float32Array(frame.effects.length*12);frame.effects.forEach((e,i)=>values.set([e.x,e.y,e.radius,e.damage,e.direction.x,e.direction.y,e.cone,e.duration,['blast','push','slow','shot'].indexOf(e.kind),e.strength,e.source,0],i*12));device.queue.writeBuffer(effects,0,values);}
      aftermath.before(encoder,frame.count);
      encoder.clearBuffer(shared.counters,14*4,4);dispatch(encoder,0,Math.ceil(frame.towers.length/64));dispatch(encoder,1,Math.ceil(frame.count/128));dispatch(encoder,2,Math.ceil(frame.count/128));dispatch(encoder,4,1);
      aftermath.hits(encoder,frame.count);
    },
    encodeAfter(encoder,frame){encoder.clearBuffer(shared.counters,HORDE_PRESSURE_COUNTER*4,4);encoder.clearBuffer(shared.counters,16,4);encoder.clearBuffer(shared.counters,24,4);dispatch(encoder,3,Math.ceil(frame.count/128));aftermath.after(encoder,frame.count);},
    clearAftermath(){aftermath.reset();},
    reset(){device.queue.writeBuffer(tesla,0,new Uint8Array(tesla.size));device.queue.writeBuffer(state,0,new Float32Array(MAX_TOWERS*12));device.queue.writeBuffer(heat,0,new Float32Array(shared.capacity*4));device.queue.writeBuffer(ownership,0,new Uint32Array(shared.capacity));},
    resetAttribution(){device.queue.writeBuffer(shared.counters,16*4,new Uint32Array(MAX_TOWERS));},
    destroy(){aftermath.destroy();uniforms.destroy();towers.destroy();state.destroy();effects.destroy();tesla.destroy();heat.destroy();ownership.destroy();if(ownedBoss)bossBuffer.destroy();},
  };
}
