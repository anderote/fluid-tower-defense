import {INFANTRY,infantryStats,type Soldier,type InfantryKind} from '../infantry/model.ts';

// Extra transparent padding accommodates long spears without scaling troop bodies.
export const INFANTRY_FRAME=64,INFANTRY_FRAMES=31,INFANTRY_FACINGS=8;
export const INFANTRY_PIVOT={x:32,y:40};
export const INFANTRY_PIXEL=.1;
export const INFANTRY_KINDS=Object.keys(INFANTRY) as InfantryKind[];
// Tile kinds into columns to stay within WebGPU's default 8192 texture limit.
export const INFANTRY_ATLAS_ROWS=8;
export const infantryAtlasOrigin=(kind:InfantryKind,facing:number,frame:number)=>{
 const index=INFANTRY_KINDS.indexOf(kind);
 return {x:Math.floor(index/INFANTRY_ATLAS_ROWS)*INFANTRY_FRAME*INFANTRY_FRAMES+frame*INFANTRY_FRAME,y:((index%INFANTRY_ATLAS_ROWS)*8+facing)*INFANTRY_FRAME};
};
// Shared atlas layout: idle, six run frames, sixteen attack slots, eight collapse frames.
export const INFANTRY_ATTACK=7,INFANTRY_DEATH=23;
export const SAMURAI_ATTACK_DURATION=.64;
export const infantryFacing=(angle:number)=>((Math.round(angle/(Math.PI/4))%8)+8)%8;
// Westwood frames start north and turn counterclockwise; our world starts east.
export const classicInfantryFacing=(facing:number)=>(6-facing+8)%8;
export const attackFrames=(kind:InfantryKind)=>kind==='dog'?4:kind==='flame'||kind==='samurai'?16:8;
/** A readable three-beat cut: coil, fast crescent, then a held follow-through. */
export function samuraiSlashPhase(age:number){
  const progress=Math.max(0,Math.min(1,age/SAMURAI_ATTACK_DURATION));
  return {progress,anticipation:Math.min(1,progress/.22),cut:Math.max(0,Math.min(1,(progress-.22)/.38)),followThrough:Math.max(0,(progress-.6)/.4)};
}
export interface InfantryPose {facing:number;frame:number;alpha:number;moving:boolean}
type Motion={x:number;y:number;time:number;phase:number;heading:number;cooldown:number;flash:number;attackTime:number;interval:number;pose:InfantryPose};

/** Render-only state: animation follows actual travel, without changing saves or combat. */
export function createInfantryAnimator(){
  const motion=new Map<number,Motion>();let lastTime=-1;
  return {
    prepare(soldiers:readonly Soldier[],time:number){
      if(time<lastTime)motion.clear();lastTime=time;
      const active=new Set(soldiers.map(s=>s.id));
      for(const id of motion.keys())if(!active.has(id))motion.delete(id);
      return soldiers.map(s=>{
        const old=motion.get(s.id);
        if(old&&time===old.time)return old.pose;
        const dt=old?time-old.time:0,dx=old?s.x-old.x:0,dy=old?s.y-old.y:0,distance=Math.hypot(dx,dy);
        const moving=dt>0&&distance/dt>.12&&distance<6;
        const phase=moving?((old?.phase??0)+distance/1.8)%1:(old?.phase??(s.id*.381966)%1);
        const kind=s.kind??'rifle',stats=infantryStats(kind,s.quality,s.defense,s.veterancy);
        // Detect actual attacks, including research-altered reload rates, rather than
        // inferring the pose from the unmodified weapon's cooldown.
        const shot=s.flash>0&&(!old||s.flash>old.flash+.0001)||!!old&&s.cooldown>old.cooldown+.0001;
        const attackTime=shot?time:old?.attackTime??(s.cooldown>0?time-Math.max(0,stats.cooldown-s.cooldown):-Infinity);
        const interval=shot&&s.cooldown>0?s.cooldown:old?.interval??stats.cooldown;
        const duration=Math.min(kind==='dog'?.32:kind==='rocket'?.64:kind==='flame'?.8:kind==='samurai'?SAMURAI_ATTACK_DURATION:.52,interval*.8);
        const elapsed=time-attackTime;
        const firing=s.health>0&&(s.flash>0||elapsed<duration);
        let heading=s.angle;
        if(moving&&!firing){
          const target=Math.atan2(dy,dx),previous=old?.heading??target;
          const turn=Math.atan2(Math.sin(target-previous),Math.cos(target-previous));
          heading=previous+Math.max(-dt*12,Math.min(dt*12,turn));
        }
        let frame=moving?1+Math.min(5,Math.floor(phase*6)):0;
        if(firing){
          const progress=kind==='flame'?((time+s.id*.137)% .8)/.8:Math.min(.999,elapsed/duration);
          frame=INFANTRY_ATTACK+Math.floor(progress*attackFrames(kind));
        }
        if(s.health<=0)frame=INFANTRY_DEATH+Math.min(7,Math.floor(s.dead/.08));
        const pose={facing:infantryFacing(heading),frame,alpha:s.health>0?1:Math.max(0,Math.min(1,(3-s.dead)/.8)),moving};
        motion.set(s.id,{x:s.x,y:s.y,time,phase,heading,cooldown:s.cooldown,flash:s.flash,attackTime,interval,pose});return pose;
      });
    },
  };
}

/** Effects use the same snapped facing and elevation as the sprite weapon. */
export function infantryMuzzle(s:Pick<Soldier,'x'|'y'|'angle'|'kind'>){
  const angle=infantryFacing(s.angle)*Math.PI/4,dx=Math.cos(angle),dy=Math.sin(angle);
  const reach=s.kind==='rocket'?.85:.75;
  return {x:s.x+dx*reach,y:s.y-.85+dy*reach*.6,dx,dy};
}

/** Rifle brass follows a short ballistic arc from the weapon's ejection side. */
export function infantryCasing(s:Pick<Soldier,'x'|'y'|'angle'|'kind'|'attackAge'>){
  const age=s.attackAge;if((s.kind??'rifle')!=='rifle'||age===undefined||age<0||age>.72)return;
  const {dx,dy}=infantryMuzzle(s),side={x:-dy,y:dx},vx=side.x*2.2-dx*.25,vy=side.y*1.1-2.5;
  return {x:s.x+side.x*.38+vx*age,y:s.y-.82+side.y*.25+vy*age+4.4*age*age,angle:s.angle+age*20,alpha:(1-age/.72)**2};
}

/** Map normalized dog poses to untouched OpenRA dog and pounce frames. */
export function classicDogFrame(facing:number,frame:number){
  const direction=classicInfantryFacing(facing);
  if(frame===0)return {sprite:'dog',frame:direction};
  if(frame<INFANTRY_ATTACK)return {sprite:'dog',frame:56+direction*6+frame-1};
  if(frame<INFANTRY_DEATH)return {sprite:'dogbullt',frame:direction*4+Math.min(3,frame-INFANTRY_ATTACK)};
  return {sprite:'dog',frame:236+Math.min(5,frame-INFANTRY_DEATH)};
}
