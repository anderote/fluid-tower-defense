import {FIRE_STATE_BYTES,FIRE_STATE_WGSL,FIRE_BURN_SECONDS} from '../../effects/fire.ts';
import {HEAVY_SALVO_SLOTS,impactTickOffset} from '../../effects/heavy-weapons.ts';
import {TESLA_STATE_WGSL,TESLA_LINKS,TESLA_HEADER_BYTES,TESLA_PARTICLE_BYTES} from '../../effects/tesla.ts';
import {createAftermathEvents} from '../../effects/aftermath.ts';
import { PARTICLE_WGSL, HORDE_PRESSURE_COUNTER, MAX_EFFECTS, MAX_INFANTRY_KILL_SLOTS, type Rect, type SharedGPU, type PhysicsFrame, type Tower, type TowerDef, type TowerKind } from '../../contracts/index.ts';
import { ENEMY_BOUNTY_DIVISOR, ENEMY_WGSL, towerBehavior } from '../../content/index.ts';
import {sameObstacles} from '../physics/obstacles.ts';
import {HORDE_APPROACH} from '../../contracts/index.ts';

const MAX_TOWERS=64;
const MAX_COMBAT_OBSTACLES=4096;
const HEAVY_ROUND_BYTES=80;
const TARGET_CELLS=256*256;
/** The largest per-shot reload variance, reserved for Tesla coils. */
export const RELOAD_JITTER=0.15;
export const RELOAD_VARIANCE:Record<TowerKind,number>={
  repulsor:.08,mortar:.10,autocannon:.04,cryo:.06,tesla:.15,rocket:.12,railgun:.12,incinerator:.07,crusher:0,
};

/** A stable per-shot firing cadence that prevents identical guns from firing in lockstep. */
export function reloadMultiplier(towerId:number,shot:number,variance=RELOAD_JITTER):number{
  let seed=(Math.imul(towerId,1103515245)+Math.imul(shot,12345))>>>0;
  seed=(seed^(seed>>>16))>>>0;
  return 1-variance+(seed&65535)/65535*(variance*2);
}

export interface CombatFrame extends PhysicsFrame { sightObstacles?:readonly Rect[]; towers:readonly {tower:Tower;definition:TowerDef}[] }
export interface ShotSnapshot { id:number;x:number;y:number;angle:number;fired:boolean }
export interface CombatModule { encodeBefore(encoder:GPUCommandEncoder,frame:CombatFrame):void;encodeAfter(encoder:GPUCommandEncoder,frame:CombatFrame):void;reset():void;clearAftermath():void;resetAttribution():void;destroy():void;readonly shotState:GPUBuffer }

/** GPU targeting and damage. Physics receives tower impulses directly in particle velocity. */
export async function createCombat(device:GPUDevice,shared:SharedGPU,options:{spatialTargets?:boolean;parallelTowers?:boolean}={}):Promise<CombatModule>{
  const spatialTargets=options.spatialTargets!==false;
  // Let independent towers be scheduled across GPU cores, rather than sharing
  // one workgroup whose lanes diverge behind long acquisition/chain searches.
  const parallelTowers=options.parallelTowers!==false;
  let obstacleSnapshot:Float32Array=new Float32Array(0);
  const uniforms=device.createBuffer({label:'Combat params',size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const towers=device.createBuffer({label:'Tower definitions and line-of-sight obstacles',size:(MAX_TOWERS+MAX_COMBAT_OBSTACLES)*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  // Preserve the 48-byte shot-state prefix consumed by rendering/readback; append in-flight salvos.
  const state=device.createBuffer({label:'Tower firing state',size:MAX_TOWERS*48+MAX_TOWERS*HEAVY_SALVO_SLOTS*HEAVY_ROUND_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const effects=device.createBuffer({label:'Effects and targeting spatial index',size:MAX_EFFECTS*48+(TARGET_CELLS+shared.capacity)*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const tesla=device.createBuffer({label:'Tesla chain and electrocution state',size:TESLA_HEADER_BYTES+shared.capacity*TESLA_PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  shared.teslaState=tesla;
  const heat=device.createBuffer({label:'Burn status',size:shared.capacity*FIRE_STATE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  shared.heatState=heat;
  const ownership=device.createBuffer({label:'Last tower damage owner',size:shared.capacity*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  shared.damageOwners=ownership;
  const ownedBoss=!shared.bossState;
  const bossBuffer=shared.bossState??device.createBuffer({label:'Inactive boss placeholder',size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const preamble=`${PARTICLE_WGSL}
${ENEMY_WGSL}
${TESLA_STATE_WGSL}
struct Params { clock:vec4f, goal:vec4f, damage:vec4f, reserved:vec4f };
struct Tower { position:vec4f, weapon:vec4f, flags:vec4f, order:vec4f };
struct TowerState { timing:vec4f, shot:vec4f, flags:vec4f };
struct Round { definition:Tower, aim:vec4f };
struct Firing { towers:array<TowerState,64>, rounds:array<Round,${MAX_TOWERS*HEAVY_SALVO_SLOTS}> };
struct Effect { position:vec4f, direction:vec4f, extra:vec4f };
struct EffectGrid {items:array<Effect,${MAX_EFFECTS}>,data:array<atomic<u32>>};
${FIRE_STATE_WGSL}
struct Boss { motion:vec4f, body:vec4f, mode:vec4f, flags:vec4f };
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(2) var<storage,read> towers:array<Tower>;
@group(0) @binding(3) var<storage,read_write> firing:Firing;
@group(0) @binding(4) var<storage,read_write> effectGrid:EffectGrid;
@group(0) @binding(5) var<storage,read_write> counters:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> boss:array<Boss>;
@group(0) @binding(7) var<storage,read_write> heat:array<Heat>;
@group(0) @binding(8) var<storage,read_write> owners:array<atomic<u32>>;
@group(0) @binding(9) var<storage,read_write> electricity:TeslaState;
fn safeDir(delta:vec2f)->vec2f { return delta/max(length(delta),0.0001); }
fn focusRadius(def:Tower)->f32 { return max(1.4,min(3.,def.weapon.w*.5)); }
fn requiresSight(def:Tower)->bool {let kind=u32(def.position.w);return kind==2u||kind==12u||kind==14u;}
fn targetCell(p:vec2f)->vec2i {return clamp(vec2i(floor((p+vec2f(${HORDE_APPROACH}.,0.))/max(1.,params.reserved.y))),vec2i(0),vec2i(params.reserved.zw)-1);}
fn targetBounds(p:vec2f,r:f32)->vec4i {if(params.reserved.y==0.){return vec4i(0);}return vec4i(targetCell(p-vec2f(r)),targetCell(p+vec2f(r)));}
fn targetHead(x:i32,y:i32)->u32 {if(params.clock.z<=0.){return 0u;}if(params.reserved.y==0.){return 1u;}return atomicLoad(&effectGrid.data[u32(y)*u32(params.reserved.z)+u32(x)]);}
fn targetNext(i:u32)->u32 {if(params.reserved.y==0.){return select(0u,i+2u,i+1u<u32(params.clock.z));}return atomicLoad(&effectGrid.data[${TARGET_CELLS}u+i]);}
@compute @workgroup_size(128) fn binTargets(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}let p=particles[i];if(p.state.w<.5||p.body.z<=0.){return;}
 let cell=targetCell(p.pos.xy);let previous=atomicExchange(&effectGrid.data[u32(cell.y)*u32(params.reserved.z)+u32(cell.x)],i+1u);atomicStore(&effectGrid.data[${TARGET_CELLS}u+i],previous);
}
fn visible(a:vec2f,b:vec2f)->bool {
 let delta=b-a;
 for(var j=0u;j<u32(params.reserved.x);j++){
  let w=towers[${MAX_TOWERS}u+j].position;if(a.x>=w.x&&a.x<=w.x+w.z&&a.y>=w.y&&a.y<=w.y+w.w){continue;}var lo=0.;var hi=1.;
  for(var k=0u;k<2u;k++){
   if(abs(delta[k])<.00001){if(a[k]<w[k]||a[k]>w[k+2u]){hi=-1.;}}
   else {let t0=(w[k]-a[k])/delta[k];let t1=(w[k]+w[k+2u]-a[k])/delta[k];lo=max(lo,min(t0,t1));hi=min(hi,max(t0,t1));}
  }
  if(hi>=lo&&hi>0.&&lo<1.){return false;}
 }return true;
}
fn reloadVariance(kind:u32,rail:bool)->f32 {
 if(kind==13u){return ${RELOAD_VARIANCE.tesla};}
 if(kind==12u){return ${RELOAD_VARIANCE.rocket};}
 if(kind==1u){return ${RELOAD_VARIANCE.mortar};}
 if(kind==2u){return select(${RELOAD_VARIANCE.autocannon},${RELOAD_VARIANCE.railgun},rail);}
 if(kind==0u){return ${RELOAD_VARIANCE.repulsor};}
 if(kind==3u){return ${RELOAD_VARIANCE.cryo};}
 return ${RELOAD_VARIANCE.incinerator};
}
fn reloadMultiplier(towerId:u32,shot:u32,variance:f32)->f32 {
 var seed=towerId*1103515245u+shot*12345u;
 seed=seed^(seed>>16u);
 return 1.-variance+f32(seed&65535u)/65535.*(variance*2.);
}
fn blastFalloff(distance:f32,radius:f32)->f32 {
 let safeRadius=max(radius,.0001);if(distance>=safeRadius){return 0.;}
 let coreRadius=safeRadius*.2;let inverseRadius=coreRadius/max(coreRadius,distance);
 let edgeTaper=1.-smoothstep(.8,1.,distance/safeRadius);
 return inverseRadius*edgeTaper;
}
`;
  const shader=device.createShaderModule({label:'Combat compute',code:preamble+`

fn roundFall(round:Round,point:vec2f,bodyRadius:f32)->vec3f {
 let rocket=u32(round.definition.position.w)==12u;
 let age=params.clock.y-round.aim.w;
 if(rocket){if(age!=${impactTickOffset("rocket",0)}.&&age!=${impactTickOffset("rocket",1)}.&&age!=${impactTickOffset("rocket",2)}.){return vec3f(0);}}else if(age!=${impactTickOffset("mortar")}.){return vec3f(0);}
 let side=vec2f(-sin(round.aim.z),cos(round.aim.z));
 let radius=round.definition.weapon.w*select(1.,.55,rocket);
 var prior=0.;var result=vec3f(0);
 for(var lane=0u;lane<select(1u,3u,rocket);lane++){
  let offsets=array<f32,3>(${impactTickOffset('rocket',0)}.,${impactTickOffset('rocket',1)}.,${impactTickOffset('rocket',2)}.);
  let due=round.aim.w+select(${impactTickOffset('mortar')}.,offsets[lane],rocket);
  let center=round.aim.xy+side*select(0.,(f32(lane)-1.)*round.definition.weapon.w*.48,rocket);
  let delta=point-center;let fall=blastFalloff(max(0.,length(delta)-bodyRadius),radius);
  // Preserve the salvo's strongest overlapping blast instead of tripling its damage.
  if(params.clock.y==due){result=vec3f(safeDir(delta),max(0.,fall-prior));}
  prior=max(prior,fall);
 }
 return result;
}

@compute @workgroup_size(${parallelTowers?1:64}) fn acquire(@builtin(global_invocation_id) gid:vec3u){
 let t=gid.x;if(t>=u32(params.clock.w)){return;}let def=towers[t];var s=firing.towers[t];
 if(s.flags.x!=def.flags.x){s=TowerState(vec4f(0),vec4f(0),vec4f(def.flags.x,0,0,0));electricity.charges[t]=vec4f(0);}
 if(s.timing.y>0.0 && s.timing.y!=def.weapon.x){s.timing.x=s.timing.x/s.timing.y*def.weapon.x;}
 if(u32(def.position.w)==15u){s.shot.x=0.;firing.towers[t]=s;return;}
 if(u32(def.position.w)==13u){electricity.charges[t].z=def.flags.w;}
 s.timing.y=def.weapon.x;s.timing.x=max(0.0,s.timing.x-params.clock.x);s.shot.x=0;
 if(s.timing.x>0.0){firing.towers[t]=s;return;}
 let order=def.order;let focused=order.z>.5&&distance(order.xy,def.position.xy)<=def.position.z;
 if(focused&&requiresSight(def)&&!visible(def.position.xy,order.xy)){firing.towers[t]=s;return;}
 var best=-1e20;var found=false;var selected=0u;
 let bounds=targetBounds(select(def.position.xy,order.xy,focused),select(def.position.z,focusRadius(def)+.6375,focused));
 for(var cy=bounds.y;cy<=bounds.w;cy++){for(var cx=bounds.x;cx<=bounds.z;cx++){var link=targetHead(cx,cy);loop{
  if(link==0u){break;}let i=link-1u;link=targetNext(i);
  let p=particles[i];if(p.state.w<0.5 || p.body.z<=0.0){continue;}
  let d=distance(p.pos.xy,def.position.xy);if(select(d>def.position.z,distance(p.pos.xy,order.xy)>focusRadius(def)+p.body.x,focused)){continue;}
  var score=-distance(p.pos.xy,params.goal.xy);
  if(focused){score=-distance(p.pos.xy,order.xy);}
  if(u32(def.position.w)==1u){score=p.state.x*12.0-d*.03;}
  if(u32(def.position.w)==0u||u32(def.position.w)==3u){score=-d;}
  if(focused){score=-distance(p.pos.xy,order.xy);}
  if(score>best||(found&&score==best&&i<selected)){if(requiresSight(def)&&!visible(def.position.xy,p.pos.xy)){continue;}best=score;selected=i;found=true;}
 }}}
 let b=boss[0];let bossDistance=distance(b.motion.xy,def.position.xy);
 let bossAtFocus=distance(b.motion.xy,order.xy)<=focusRadius(def)+b.body.x;
 let bossScore=select(-distance(b.motion.xy,params.goal.xy)+select(0.0,30.0,u32(def.position.w)==2u),-distance(b.motion.xy,order.xy),focused);
 let reload=def.weapon.x*reloadMultiplier(u32(def.flags.x),u32(s.flags.y+1.),reloadVariance(u32(def.position.w),def.flags.w>.5));
 if(b.mode.z>.5&&b.body.z>0&&select(bossDistance<=def.position.z,bossAtFocus,focused)&&(!requiresSight(def)||visible(def.position.xy,b.motion.xy))&&(!found||bossScore>best)){
  var aim=b.motion.xy;if(focused&&u32(def.position.w)!=13u){aim=order.xy;}s.timing=vec4f(reload,def.weapon.x,aim);s.shot=vec4f(1,-1,b.flags.x,atan2(aim.y-def.position.y,aim.x-def.position.x));s.flags.y+=1.;
 }else if(found){let p=particles[selected];var aim=p.pos.xy;if(focused&&u32(def.position.w)!=13u){aim=order.xy;}s.timing=vec4f(reload,def.weapon.x,aim);s.shot=vec4f(1,f32(selected),p.status.w,atan2(aim.y-def.position.y,aim.x-def.position.x));s.flags.y+=1.;}
 if(u32(def.position.w)==13u&&s.shot.x>.5){
  s.flags.z=params.clock.y+1.;
  let overloaded=def.flags.w>.5&&u32(s.flags.y)%6u==0u;
  electricity.charges[t]=vec4f(f32(u32(s.flags.y)%6u)/6.,select(0.,1.,overloaded),def.flags.w,0.);
  let base=t*${TESLA_LINKS}u;
  for(var hop=0u;hop<${TESLA_LINKS}u;hop++){electricity.links[base+hop]=vec4f(0,0,-2,0);}
  electricity.links[base]=vec4f(s.timing.zw,s.shot.y,s.shot.z);
  var origin=s.timing.zw;
  let limit=min(${TESLA_LINKS}u,u32(def.flags.z)+select(0u,8u,overloaded));
  for(var hop=1u;hop<limit;hop++){
   var nearest=def.weapon.w*select(1.35,1.8,overloaded);var candidate=-1;var generation=0.;var position=vec2f(0);
   let chainBounds=targetBounds(origin,nearest);
   for(var cy=chainBounds.y;cy<=chainBounds.w;cy++){for(var cx=chainBounds.x;cx<=chainBounds.z;cx++){var link=targetHead(cx,cy);loop{
    if(link==0u){break;}let i=link-1u;link=targetNext(i);
    let p=particles[i];if(p.state.w<.5||p.body.z<=0.){continue;}
    var visited=false;for(var prior=0u;prior<hop;prior++){if(electricity.links[base+prior].z==f32(i)){visited=true;}}
    if(visited||(focused&&distance(p.pos.xy,order.xy)>focusRadius(def)+p.body.x)){continue;}let d=distance(origin,p.pos.xy);
    if(d<nearest||(candidate>=0&&d==nearest&&i32(i)<candidate)){nearest=d;candidate=i32(i);generation=p.status.w;position=p.pos.xy;}
   }}}
   if(candidate<0){break;}
   electricity.links[base+hop]=vec4f(position,f32(candidate),generation);origin=position;
  }
 }
 if(s.shot.x>.5){
  s.flags.w=params.clock.y;
  let kind=u32(def.position.w);
  if(kind==1u||kind==12u){
   firing.rounds[t*${HEAVY_SALVO_SLOTS}u+u32(s.flags.y)%${HEAVY_SALVO_SLOTS}u]=Round(def,vec4f(s.timing.zw,s.shot.w,params.clock.y));
  }
 }
 firing.towers[t]=s;
}
@compute @workgroup_size(128) fn hit(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<0.5||p.body.z<=0){return;}
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=firing.towers[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==1u||kind==12u){continue;}
  let order=def.order;if(order.z>.5&&distance(p.pos.xy,order.xy)>focusRadius(def)+p.body.x){continue;}
  if(kind==2u){let rail=def.flags.w>.5;let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(rail){let offset=p.pos.xy-def.position.xy;let along=dot(offset,forward);let across=abs(offset.x*forward.y-offset.y*forward.x);if(along>=0.&&along<=def.position.z&&across<=1.05&&visible(def.position.xy,p.pos.xy)){let fall=max(.35,1.-along/max(def.position.z,.001));let kick=forward*def.weapon.z*fall/max(.1,p.body.y);p.body.z-=def.weapon.y*fall;atomicStore(&owners[i],t+1u);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;}}else if(s.shot.y>=0&&u32(s.shot.y)==i&&s.shot.z==p.status.w){let kick=forward*def.weapon.z/max(.1,p.body.y);p.body.z-=def.weapon.y;atomicStore(&owners[i],t+1u);p.pos.z=p.pos.z+kick.x;p.pos.w=p.pos.w+kick.y;p.status.x=max(p.status.x,select(.18,.55,def.flags.y==1));}continue;}
  if(kind==13u){
   for(var hop=0u;hop<${TESLA_LINKS}u;hop++){
    let link=electricity.links[t*${TESLA_LINKS}u+hop];
    if(link.z==f32(i)&&link.w==p.status.w&&p.body.z>0.){
     let normalPower=select(.52*pow(.82,f32(hop)-1.),1.,hop==0u);
     let power=select(normalPower,3.*pow(.9,f32(hop)),electricity.charges[t].y>.5);
     p.body.z-=def.weapon.y*power;atomicStore(&owners[i],t+1u);
     p.status.y=max(p.status.y,.8);p.status.x=max(p.status.x,.32);
     electricity.victims[i].shock=vec4f(params.clock.y+1.,p.status.w,select(0.,1.,p.body.z<=0.),power);
     if(p.body.z<=0.){electricity.victims[i].corpse=vec4f(p.pos.xy,p.body.x,params.clock.y+1.);}
    }
   }
   continue;
  }
  if(kind==14u){let delta=p.pos.xy-def.position.xy;let dist=length(delta);let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(dist<=def.position.z&&dot(safeDir(delta),forward)>=cos(clamp(def.weapon.w*.18,.25,1.35))&&visible(def.position.xy,p.pos.xy)){let fall=max(.2,1.-dist/max(def.position.z,.001));let previous=heat[i].burn;heat[i].burn=vec4f(${FIRE_BURN_SECONDS},max(select(0.,previous.y,fireActive(previous,p.status.w)),def.weapon.y*fall),p.status.w,select(params.clock.y+1.,previous.w,fireActive(previous,p.status.w)));atomicStore(&owners[i],t+1u);}continue;}
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
 for(var t=0u;t<u32(params.clock.w);t++){
  if(u32(towers[t].position.w)!=1u&&u32(towers[t].position.w)!=12u){continue;}
  for(var slot=0u;slot<${HEAVY_SALVO_SLOTS}u;slot++){
   let round=firing.rounds[t*${HEAVY_SALVO_SLOTS}u+slot];
   if(round.aim.w<=0.||round.definition.flags.x!=towers[t].flags.x||params.clock.y-round.aim.w>${impactTickOffset('rocket',2)}.){continue;}
   let blast=roundFall(round,p.pos.xy,0.);
   if(blast.z>0.){p.body.z-=round.definition.weapon.y*blast.z;atomicStore(&owners[i],t+1u);let kick=blast.xy*round.definition.weapon.z*blast.z/max(.1,p.body.y);p.pos.z+=kick.x;p.pos.w+=kick.y;}
  }
 }
 for(var e=0u;e<u32(params.damage.z);e++){
  let f=effectGrid.items[e];let delta=p.pos.xy-f.position.xy;
  if(f.extra.x==5.){
   if(p.body.z>0.&&abs(delta.x)<=f.position.z&&abs(delta.y)<=f.direction.z){
    p.body.z-=f.position.w;p.pos.z+=f.direction.x*f.extra.y/max(.1,p.body.y);p.status.x=max(p.status.x,.5);atomicStore(&owners[i],0u);
   }
   continue;
  }
  if(f.extra.x==6.){
   if(p.body.z>0.&&abs(delta.x)<=4.&&abs(delta.y)<=5.){
    p.body.z-=f.position.w*clamp(p.state.x,1.,2.)/enemyCrushResistance(u32(p.state.z));
    p.pos.w-=sign(delta.y)*f.extra.y/max(.1,p.body.y);p.status.x=max(p.status.x,.6);
    atomicStore(&owners[i],select(u32(f.extra.z),${MAX_TOWERS + MAX_INFANTRY_KILL_SLOTS}u+u32(f.extra.z),p.body.z<=0.));
   }
   continue;
  }
  let dist=length(delta);if(dist>f.position.z){continue;}
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
  let desired=(heading+side*panic*.85)*enemySpeedFor(u32(p.state.z),p.body.w)*1.65;
  p.pos=vec4f(p.pos.xy,mix(p.pos.zw,desired,min(1.,params.clock.x*7.)));
 }
 heat[i]=h;particles[i]=p;
}
@compute @workgroup_size(1) fn hitBoss(){
 var b=boss[0];if(b.mode.z<.5||b.body.z<=0){return;}
 let vulnerable=select(1.0,1.6,b.mode.x==1.0||b.mode.x==3.0);
 for(var t=0u;t<u32(params.clock.w);t++){
  let s=firing.towers[t];if(s.shot.x<.5){continue;}let def=towers[t];let kind=u32(def.position.w);
  if(kind==1u||kind==12u){continue;}
  let order=def.order;if(order.z>.5&&distance(b.motion.xy,order.xy)>focusRadius(def)+b.body.x){continue;}
  if(kind==2u){if(s.shot.y<0&&s.shot.z==b.flags.x){b.body.z-=def.weapon.y*vulnerable;}continue;}
  if(kind==13u){if(s.shot.y<0&&s.shot.z==b.flags.x){b.body.z-=def.weapon.y*select(1.,3.,electricity.charges[t].y>.5)*vulnerable;}continue;}
  let targetedBlast=kind==1u;let origin=select(def.position.xy,s.timing.zw,targetedBlast);let rad=select(def.position.z,def.weapon.w,targetedBlast);let delta=b.motion.xy-origin;let dist=max(0.0,length(delta)-b.body.x);if(dist>rad){continue;}
  let forward=vec2f(cos(s.shot.w),sin(s.shot.w));if(kind!=1u&&dot(safeDir(delta),forward)<cos(clamp(def.weapon.w*.18,.25,1.35))){continue;}
  let falloff=select(max(.25,1.0-dist/max(rad,.001)),blastFalloff(dist,rad),targetedBlast);
  b.body.z-=def.weapon.y*falloff*vulnerable;
  if(kind==3u){b.flags.w=max(b.flags.w,1.0);}
 }
 for(var t=0u;t<u32(params.clock.w);t++){
  if(u32(towers[t].position.w)!=1u&&u32(towers[t].position.w)!=12u){continue;}
  for(var slot=0u;slot<${HEAVY_SALVO_SLOTS}u;slot++){
   let round=firing.rounds[t*${HEAVY_SALVO_SLOTS}u+slot];
   if(round.aim.w<=0.||round.definition.flags.x!=towers[t].flags.x||params.clock.y-round.aim.w>${impactTickOffset('rocket',2)}.){continue;}
   let blast=roundFall(round,b.motion.xy,b.body.x);
   b.body.z-=round.definition.weapon.y*blast.z*vulnerable;
  }
 }
 for(var e=0u;e<u32(params.damage.z);e++){
  let f=effectGrid.items[e];if(f.extra.x==5.&&abs(b.motion.x-f.position.x)<=f.position.z+b.body.x&&abs(b.motion.y-f.position.y)<=f.direction.z+b.body.x){b.body.z-=f.position.w*vulnerable;}if(f.extra.x==6.&&abs(b.motion.x-f.position.x)<=4.+b.body.x&&abs(b.motion.y-f.position.y)<=5.+b.body.x){b.body.z-=f.position.w*vulnerable;}
 }
 boss[0]=b;
}
@compute @workgroup_size(128) fn settle(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u32(params.clock.z)){return;}var p=particles[i];if(p.state.w<.5){return;}
 if(p.pos.x < -10.0 && p.state.y > 40.0){atomicStore(&counters[${HORDE_PRESSURE_COUNTER}],1u);}
 let kind=u32(clamp(p.state.z,0.0,5.0)+0.5);let tolerance=enemyCrushResistanceFor(kind,p.body.w);
 // Exposure is physics-owned until this settlement consumes it.
 let brittle=select(1.0,1.7,p.status.y>0.0);
 let crush=max(0.0,p.status.z)*brittle/tolerance;
 let wasAlive=p.body.z>0.0;p.body.z-=crush;p.status.z=0;
 if(p.body.z<=0.0){p.body.z=0;p.body.w=-params.clock.y;p.state.w=-1;atomicAdd(&counters[0],1u);let owner=atomicLoad(&owners[i]);let gateKill=owner>${MAX_TOWERS + MAX_INFANTRY_KILL_SLOTS}u&&owner<=${MAX_TOWERS * 2 + MAX_INFANTRY_KILL_SLOTS}u;if((wasAlive&&crush>0)||gateKill){atomicAdd(&counters[1],1u);}if(gateKill){atomicAdd(&counters[16u+owner-${MAX_TOWERS + MAX_INFANTRY_KILL_SLOTS + 1}u],1u);}else if(!(wasAlive&&crush>0)&&owner>0u&&owner<=${MAX_TOWERS + MAX_INFANTRY_KILL_SLOTS}u){atomicAdd(&counters[16u+owner-1u],1u);}let bounty=enemyBountyPoints(kind);let prior=atomicAdd(&counters[15],bounty);let payout=(prior+bounty)/${ENEMY_BOUNTY_DIVISOR}u-prior/${ENEMY_BOUNTY_DIVISOR}u;if(payout>0u){atomicAdd(&counters[3],payout);}}
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
    {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:9,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
  ]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=await Promise.all(['acquire','burn','hit','settle','hitBoss'].map(entryPoint=>device.createComputePipelineAsync({label:`Combat ${entryPoint}`,layout:pipelineLayout,compute:{module:shader,entryPoint}})));
  const binPipeline=await device.createComputePipelineAsync({label:'Index combat targets',layout:pipelineLayout,compute:{module:shader,entryPoint:'binTargets'}});
  const bind=device.createBindGroup({layout,entries:[uniforms,shared.particles,towers,state,effects,shared.counters,bossBuffer,heat,ownership,tesla].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const aftermath=await createAftermathEvents(device,shared,{uniforms,towers,states:state,owners:ownership,effects,tesla});
  function dispatch(encoder:GPUCommandEncoder,index:number,groups:number){if(!groups)return;const pass=encoder.beginComputePass({label:['Target selection','Burn damage','Weapon effects','Settlement','Boss damage'][index]});pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();}
  return {
    shotState:state,
    encodeBefore(encoder,frame){
      const sightObstacles=frame.sightObstacles??frame.map.obstacles;
      if(frame.towers.length>MAX_TOWERS||frame.effects.length>MAX_EFFECTS||sightObstacles.length>MAX_COMBAT_OBSTACLES)throw new Error('Combat command capacity exceeded');
      const cellSize=Math.max(8,Math.ceil((frame.map.width+HORDE_APPROACH)/256),Math.ceil(frame.map.height/256)),columns=Math.ceil((frame.map.width+HORDE_APPROACH)/cellSize),rows=Math.ceil(frame.map.height/cellSize);
      const u=new Float32Array([frame.dt,frame.tick,frame.count,frame.towers.length,frame.map.goal.x,frame.map.goal.y,frame.map.goalRadius,frame.lab?1:0,frame.tuning.crushDamage,0,frame.effects.length,0,sightObstacles.length,spatialTargets?cellSize:0,columns,rows]);device.queue.writeBuffer(uniforms,0,u);
      const data=new Float32Array(Math.max(1,frame.towers.length)*16);
      frame.towers.forEach(({tower:t,definition:d},i)=>{data.set([t.x,t.y,d.range,towerBehavior(t.kind),d.cooldown,d.damage,d.force,d.radius,t.id,t.branch,d.chainTargets??(t.kind==='tesla'?(t.branch===1?6:4):0),t.kind==='railgun'||d.overload?1:0,t.groundTarget?.x??0,t.groundTarget?.y??0,t.groundTarget?1:0,0],i*16);});device.queue.writeBuffer(towers,0,data);
      if(!sameObstacles(obstacleSnapshot,sightObstacles)){obstacleSnapshot=new Float32Array(sightObstacles.length*4);const sightData=new Float32Array(sightObstacles.length*16);sightObstacles.forEach((o,i)=>{const rect=[o.x,o.y,o.width,o.height];sightData.set(rect,i*16);obstacleSnapshot.set(rect,i*4);});if(sightData.length)device.queue.writeBuffer(towers,MAX_TOWERS*64,sightData);}
      if(frame.effects.length){const values=new Float32Array(frame.effects.length*12);frame.effects.forEach((e,i)=>values.set([e.x,e.y,e.radius,e.damage,e.direction.x,e.direction.y,e.cone,e.duration,['blast','push','slow','shot','corpse-blast','flood','crush'].indexOf(e.kind),e.strength,e.source,0],i*12));device.queue.writeBuffer(effects,0,values);}
      aftermath.before(encoder,frame.count);
      if(spatialTargets&&frame.towers.length&&frame.count){encoder.clearBuffer(effects,MAX_EFFECTS*48,columns*rows*4);const pass=encoder.beginComputePass({label:'Index combat targets'});pass.setPipeline(binPipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(frame.count/128));pass.end();}
      encoder.clearBuffer(shared.counters,14*4,4);dispatch(encoder,0,Math.ceil(frame.towers.length/(parallelTowers?1:64)));dispatch(encoder,1,Math.ceil(frame.count/128));dispatch(encoder,2,Math.ceil(frame.count/128));dispatch(encoder,4,1);
      aftermath.hits(encoder,frame.count);
    },
    encodeAfter(encoder,frame){encoder.clearBuffer(shared.counters,HORDE_PRESSURE_COUNTER*4,4);encoder.clearBuffer(shared.counters,16,4);encoder.clearBuffer(shared.counters,24,4);dispatch(encoder,3,Math.ceil(frame.count/128));aftermath.after(encoder,frame.count);},
    clearAftermath(){aftermath.reset();},
    reset(){device.queue.writeBuffer(tesla,0,new Uint8Array(tesla.size));device.queue.writeBuffer(state,0,new Uint8Array(state.size));device.queue.writeBuffer(heat,0,new Float32Array(shared.capacity*4));device.queue.writeBuffer(ownership,0,new Uint32Array(shared.capacity));},
    resetAttribution(){device.queue.writeBuffer(shared.counters,16*4,new Uint32Array(MAX_TOWERS));},
    destroy(){aftermath.destroy();uniforms.destroy();towers.destroy();state.destroy();effects.destroy();tesla.destroy();heat.destroy();ownership.destroy();if(ownedBoss)bossBuffer.destroy();},
  };
}
