import type {NavigationField,Vec2,WorldMap} from '../contracts/index.ts';
import {MAX_VETERANCY,veterancyLevel,veterancyMultiplier} from '../content/index.ts';
import {buildNavigation} from '../navigation/index.ts';

export const BARRACKS_COST=120;
export type InfantryKind='rifle'|'rocket'|'flame'|'samurai'|'dog';
export const INFANTRY={
 rifle:{building:'Rifle Barracks',name:'Riflemen',cost:120,interval:5,capacity:100,health:40,damage:12,range:14,cooldown:1.05,armor:0,speed:4,role:'Mass rifle infantry · free continuous recruitment'},
 rocket:{building:'Rocket Academy',name:'Rocket troops',cost:200,interval:4,capacity:20,health:55,damage:22,range:16,cooldown:3.1,armor:.1,speed:3.5,role:'Deliberate splash volleys against dense hordes'},
 flame:{building:'Flame Depot',name:'Flamethrowers',cost:160,interval:3,capacity:20,health:80,damage:6,range:6,cooldown:.45,armor:.2,speed:4,role:'Short-range cones that punish crowded approaches'},
 samurai:{building:'Samurai Dojo',name:'Samurai',cost:240,interval:6,capacity:20,health:95,damage:18,range:2.6,cooldown:.9,armor:.2,speed:4.8,role:'Close-range shock troops with a focused sword sweep'},
 dog:{building:'Dog Kennel',name:'Attack dogs',cost:60,interval:1.5,capacity:40,health:25,damage:24,range:1.8,cooldown:.6,armor:0,speed:8,role:'Fast packs that chase and bite nearby zombies'},
} as const;
export const infantryCapacity=(kind:InfantryKind='rifle',production=0)=>INFANTRY[kind].capacity+Math.ceil(INFANTRY[kind].capacity*.2)*Math.max(0,Math.min(5,production));
const SAMURAI_HUNT_MEMORY=1.15;
export const infantryStats=(kind:InfantryKind='rifle',quality=0,defense=0,veterancy=0,research:readonly string[]=[] )=>{const v=INFANTRY[kind],rank=(id:string)=>research.filter(upgrade=>upgrade===id).length,experience=veterancyMultiplier(veterancy),veteranGain=experience-1,rifleFamily=kind==='rifle',flameFamily=kind==='flame',explosiveFamily=kind==='rocket',armorRank=rank('infantry-armor');return {...v,health:(v.health+quality*12+defense*20)*(1+armorRank*.02)*(1+veteranGain*.45),damage:v.damage*(1+quality/3)*experience*(1+rank('ballistics')*.01*Number(rifleFamily))*(1+rank('rifle-tech')*.02*Number(rifleFamily))*(1+rank('thermal-science')*.01*Number(flameFamily))*(1+rank('flame-tech')*.025*Number(flameFamily))*(1+rank('explosive-ordnance')*.01*Number(explosiveFamily))*(1+rank('high-explosives')*.02*Number(explosiveFamily)),range:v.range*(1+rank('precision-optics')*.015*Number(rifleFamily))*(1+veteranGain*.35),cooldown:v.cooldown/(1+quality*.08)/(1+veteranGain*.4),armor:Math.min(.85,v.armor+defense*.06+armorRank*.01+veteranGain*.04)};};
export interface Barracks extends Vec2 {kind?:InfantryKind;defense?:number;id:number;rally:Vec2;production:number;training:number;progress:number;spent:number;recruited?:number}
export interface Soldier extends Vec2 {kind?:InfantryKind;defense?:number;id:number;home:number;quality:number;health:number;cooldown:number;angle:number;flash:number;walk:number;dead:number;kills?:number;veterancy?:number;veterancyXp?:number;casualtyRecorded?:boolean;deathCause?:'enemy'|'friendly-fire';attackAge?:number;moving?:boolean;pressure?:number;moveTarget?:Vec2;moveSlot?:number;rallyTarget?:Vec2;rallySlot?:number}
export interface InfantryState {casualties?:number;friendlyFire?:number;nextId:number;buildings:Barracks[];soldiers:Soldier[]}
export interface Threat extends Vec2 {target:number;generation:number;contact:number;age:number;pushX?:number;pushY?:number;pressure?:number}
export interface RifleShot {soldier:number;target:number;generation:number;damage:number;x:number;y:number}
export const freshInfantry=():InfantryState=>({nextId:1,buildings:[],soldiers:[],casualties:0,friendlyFire:0});
/** Count the living-to-dead transition once, even while its corpse remains visible. */
export function recordInfantryCasualty(state:InfantryState,s:Soldier,cause:'enemy'|'friendly-fire'){
  if(s.health>0||s.casualtyRecorded)return;
  s.casualtyRecorded=true;s.deathCause=cause;
  state.casualties=(state.casualties??0)+1;
  if(cause==='friendly-fire')state.friendlyFire=(state.friendlyFire??0)+1;
}
export function damageInfantry(state:InfantryState,s:Soldier,damage:number,cause:'enemy'|'friendly-fire'){
  if(s.health<=0||!Number.isFinite(damage)||damage<=0)return;
  s.health=Math.max(0,s.health-damage);
  if(s.health===0)recordInfantryCasualty(state,s,cause);
}
export const recruitInterval=(rank:number,kind:InfantryKind='rifle')=>INFANTRY[kind].interval*Math.pow(.82,rank);
export const rifleStats=(rank:number)=>({health:40+rank*12,damage:9+rank*3,range:14,cooldown:.8/(1+rank*.08)});
export const infantryUpgradeCost=(rank:number)=>200+rank*150;
export const barracksRect=(b:Vec2)=>({x:b.x-2,y:b.y-2,width:4,height:4});
export const infantryMap=(map:WorldMap,state:InfantryState):WorldMap=>({...map,obstacles:[...map.obstacles,...state.buildings.map(barracksRect)]});
export function clearForSoldier(map:WorldMap,p:Vec2,r=.4){return p.x>=r&&p.y>=r&&p.x<map.width-r&&p.y<map.height-r&&!map.obstacles.some(o=>p.x+r>o.x&&p.x-r<o.x+o.width&&p.y+r>o.y&&p.y-r<o.y+o.height);}
export function infantryField(map:WorldMap,rally:Vec2){return buildNavigation({...map,goal:rally,obstacles:map.obstacles.map(o=>({x:o.x-.45,y:o.y-.45,width:o.width+.9,height:o.height+.9}))});}
export function clearInfantryPath(map:WorldMap,from:Vec2,to:Vec2,r=.4):boolean {
  if(!clearForSoldier(map,from,r)||!clearForSoldier(map,to,r))return false;
  const dx=to.x-from.x,dy=to.y-from.y;
  return !map.obstacles.some(obstacle=>{
    const minX=obstacle.x-r,maxX=obstacle.x+obstacle.width+r,minY=obstacle.y-r,maxY=obstacle.y+obstacle.height+r;
    let first=0,last=1;
    const axis=(origin:number,delta:number,min:number,max:number)=>{
      if(Math.abs(delta)<1e-8)return origin>min&&origin<max;
      const a=(min-origin)/delta,b=(max-origin)/delta;
      first=Math.max(first,Math.min(a,b));last=Math.min(last,Math.max(a,b));return first<last;
    };
    return axis(from.x,dx,minX,maxX)&&axis(from.y,dy,minY,maxY)&&first<1&&last>0;
  });
}
/**
 * Pulls a friendly soldier several visible cells along its navigation field.
 * The old follower aimed at only the next cell, which made squads take a
 * stair-step route and stall when a crowd reached a wall corner together.
 * Alternate field vectors let neighboring soldiers take equivalent sides of
 * a route without changing enemy navigation.
 */
export function infantryNavigationWaypoint(map:WorldMap,field:NavigationField,from:Vec2,to:Vec2,seed=0):Vec2 {
  if(clearInfantryPath(map,from,to))return to;
  let x=Math.max(0,Math.min(field.width-1,Math.floor(from.x/field.cellSize)));
  let y=Math.max(0,Math.min(field.height-1,Math.floor(from.y/field.cellSize)));
  let best:Vec2|undefined;
  for(let step=0;step<10;step++){
    const at=y*field.width+x;
    const candidates:Vec2[]=[];
    for(const vectors of seed%2?[field.alternateVectors,field.vectors]:[field.vectors,field.alternateVectors]){
      const dx=Math.round(vectors[at*2]??0),dy=Math.round(vectors[at*2+1]??0);
      if(!dx&&!dy)continue;
      const nextX=x+dx,nextY=y+dy;
      if(nextX<0||nextY<0||nextX>=field.width||nextY>=field.height)continue;
      const next=nextY*field.width+nextX;
      if(!Number.isFinite(field.distances[next]))continue;
      const point={x:(nextX+.5)*field.cellSize,y:(nextY+.5)*field.cellSize};
      if(!clearForSoldier(map,point)||!clearInfantryPath(map,from,point))continue;
      candidates.push(point);
    }
    // A soldier can be physically just beyond a blocked cell's edge even
    // though floor(cell) still names that blocked cell. Recover by looking
    // for the nearest lower-cost cardinal neighbor instead of treating the
    // zero vector as a dead end.
    if(!candidates.length){
      const currentDistance=field.distances[at]??Infinity;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
        const nextX=x+dx,nextY=y+dy;
        if(nextX<0||nextY<0||nextX>=field.width||nextY>=field.height)continue;
        const next=nextY*field.width+nextX;
        if(!Number.isFinite(field.distances[next])||field.distances[next]>=currentDistance)continue;
        const point={x:(nextX+.5)*field.cellSize,y:(nextY+.5)*field.cellSize};
        if(clearForSoldier(map,point)&&clearInfantryPath(map,from,point))candidates.push(point);
      }
    }
    const point=candidates[0];
    if(!point)break;
    best=point;x=Math.floor(point.x/field.cellSize);y=Math.floor(point.y/field.cellSize);
  }
  return best??from;
}
/** Stable sunflower slots turn a rally coordinate into a loose, quiet staging area. */
export function infantryFanPoint(map:WorldMap,center:Vec2,slot:number):Vec2 {
  if(slot<=0)return center;
  // Keep squads compact after a move while preserving enough room for each
  // soldier to settle without stacking on the same point.
  const radius=Math.min(8.5,Math.sqrt(slot)*.9),angle=slot*2.399963229728653;
  const candidates=[0,.7,-.7,1.4,-1.4].flatMap(turn=>[1,.72,.45].map(scale=>({x:center.x+Math.cos(angle+turn)*radius*scale,y:center.y+Math.sin(angle+turn)*radius*scale})));
  return candidates.find(point=>clearForSoldier(map,point)&&clearInfantryPath(map,center,point))??center;
}
export function exitPoint(map:WorldMap,b:Barracks,field:NavigationField):Vec2|undefined {
  return [{x:b.x,y:b.y+3},{x:b.x-3,y:b.y},{x:b.x+3,y:b.y},{x:b.x,y:b.y-3}].find(p=>clearForSoldier(map,p)&&Number.isFinite(field.distances[Math.floor(p.y)*field.width+Math.floor(p.x)]));
}
export function reachableRallyPoint(map:WorldMap,b:Barracks,target:Vec2):boolean {
  if(!clearForSoldier(map,target))return false;
  return !!exitPoint(map,b,infantryField(map,target));
}

type FormationSlot={centerX:number;centerY:number;slot:number;target:Vec2};
const formationCaches=new WeakMap<InfantryState,Map<number,FormationSlot>>();
const formationDestination=(state:InfantryState,map:WorldMap,soldier:Soldier,center:Vec2,slot:number):Vec2=>{
  let cache=formationCaches.get(state);if(!cache){cache=new Map();formationCaches.set(state,cache);}
  const saved=cache.get(soldier.id);
  if(saved&&saved.centerX===center.x&&saved.centerY===center.y&&saved.slot===slot&&clearForSoldier(map,saved.target))return saved.target;
  const target=infantryFanPoint(map,center,slot);cache.set(soldier.id,{centerX:center.x,centerY:center.y,slot,target});return target;
};

/** Spatial crowd separation and navigation; GPU supplies horde pressure and combat handles. */
export function advanceInfantry(state:InfantryState,map:WorldMap,fields:Map<number,NavigationField>,threats:Map<number,Threat>,dt:number,combat:boolean,research:readonly string[]=[],orderFields:Map<number,NavigationField>=new Map()):RifleShot[]{
  if(!combat)return [];
  const shots:RifleShot[]=[];
  for(const b of state.buildings){
    const field=fields.get(b.id);if(!field)continue;
    const kind=b.kind??'rifle',living=state.soldiers.filter(s=>s.home===b.id&&s.health>0).length;
    if(living<infantryCapacity(kind,b.production))b.progress=Math.min(1,b.progress+dt/recruitInterval(b.production,kind));
    if(b.progress>=1&&living<infantryCapacity(kind,b.production)){const p=exitPoint(map,b,field);if(p){const rallySlot=b.recruited??0;b.recruited=rallySlot+1;state.soldiers.push({...p,id:state.nextId++,home:b.id,kind,defense:b.defense??0,quality:b.training,health:infantryStats(kind,b.training,b.defense,0,research).health,cooldown:0,angle:Math.PI,flash:0,walk:0,dead:0,kills:0,veterancy:0,veterancyXp:0,rallyTarget:{...b.rally},rallySlot});b.progress=0;}}
  }
  const homes=new Map(state.buildings.map(b=>[b.id,b]));
  const cells=new Map<string,Soldier[]>(),key=(x:number,y:number)=>`${Math.floor(x/2)},${Math.floor(y/2)}`;
  for(const s of state.soldiers)if(s.health>0){const k=key(s.x,s.y),cell=cells.get(k);if(cell)cell.push(s);else cells.set(k,[s]);}
  for(const s of state.soldiers){
    s.moving=false;if(s.attackAge!==undefined)s.attackAge+=dt;
    s.flash=Math.max(0,s.flash-dt);
    if(s.health<=0){recordInfantryCasualty(state,s,s.deathCause??'enemy');s.dead+=dt;continue;}
    const b=homes.get(s.home),field=orderFields.get(s.id)??fields.get(s.home);if(!b||!field)continue;
    const threat=threats.get(s.id);if(threat)threat.age+=dt;
    const fresh=threat&&threat.age<.35?threat:undefined;
    // Samurai keep hunting the last known target between GPU sensing passes;
    // their role is to close on zombies, not drift back to the rally point.
    const pursuit=s.kind==='samurai'&&threat&&threat.target>=0&&threat.age<SAMURAI_HUNT_MEMORY?threat:fresh;
    s.pressure=fresh?.pressure??0;
    const stats=infantryStats(s.kind,s.quality,s.defense,s.veterancy,research);
    s.health=Math.max(0,s.health-(fresh?.contact??0)*dt*(1-stats.armor));
    if(s.health<=0){recordInfantryCasualty(state,s,'enemy');s.flash=0;continue;}
    const distance=pursuit&&pursuit.target>=0?Math.hypot(pursuit.x-s.x,pursuit.y-s.y):Infinity;
    s.cooldown=Math.max(0,s.cooldown-dt);
    if(fresh&&fresh.target>=0&&distance<=stats.range){
      s.angle=Math.atan2(fresh.y-s.y,fresh.x-s.x);
      if(s.cooldown===0){shots.push({soldier:s.id,target:fresh.target,generation:fresh.generation,damage:stats.damage,x:fresh.x,y:fresh.y});s.cooldown=stats.cooldown;s.attackAge=0;s.flash=s.kind==='samurai'?.28:s.kind==='dog'?.32:s.kind==='flame'?.2:.1;}
    }
    const center=s.moveTarget??s.rallyTarget??b.rally,slot=s.moveTarget?s.moveSlot??0:s.rallySlot??s.id,destination=formationDestination(state,map,s,center,slot),rallyDistance=Math.hypot(s.x-destination.x,s.y-destination.y),ordered=!!s.moveTarget,melee=s.kind==='samurai'||s.kind==='dog',settled=rallyDistance<=.7;
    // Hold a firing line instead of chasing every small target update. The
    // extra approach margin creates hysteresis; the tighter retreat threshold
    // prevents ranged troops from constantly stepping back and forth.
    const approachDistance=stats.range+(melee?.25:1.1),retreatDistance=melee?0:1.6;
    let dx=0,dy=0;
    if(!ordered&&pursuit&&distance>approachDistance&&clearInfantryPath(map,s,pursuit)){dx=(pursuit.x-s.x)/distance;dy=(pursuit.y-s.y)/distance;}
    else if(!ordered&&!melee&&fresh&&distance<retreatDistance&&rallyDistance<6){dx=(s.x-fresh.x)/Math.max(.01,distance);dy=(s.y-fresh.y)/Math.max(.01,distance);}
    else if(!settled&&(ordered||(!fresh&&(distance>stats.range||rallyDistance>5)))){
      if(clearInfantryPath(map,s,destination)){dx=(destination.x-s.x)/rallyDistance;dy=(destination.y-s.y)/rallyDistance;}
      else{
        const waypoint=infantryNavigationWaypoint(map,field,s,destination,s.id),toWaypoint=Math.hypot(waypoint.x-s.x,waypoint.y-s.y);
        if(toWaypoint>.01){dx=(waypoint.x-s.x)/toWaypoint;dy=(waypoint.y-s.y)/toWaypoint;}
      }
    }
    // Local soft-body pressure: dense crowds spread without fixed formation slots.
    for(let cy=-1;cy<=1;cy++)for(let cx=-1;cx<=1;cx++)for(const other of cells.get(key(s.x+cx*2,s.y+cy*2))??[]){
      if(other.id===s.id)continue;const ox=s.x-other.x,oy=s.y-other.y,d=Math.hypot(ox,oy);
      const spacing=settled?.52:.88;if(d<spacing){const angle=(s.id<other.id?1:-1),force=(spacing-d)*(settled?.8:1.5);dx+=(d>.001?ox/d:angle)*force;dy+=(d>.001?oy/d:0)*force;}
    }
    dx+=(fresh?.pushX??0);dy+=(fresh?.pushY??0);
    const length=Math.hypot(dx,dy);if(length>.04){dx/=Math.max(1,length);dy/=Math.max(1,length);const step=stats.speed*dt,oldX=s.x,oldY=s.y;
      if(clearForSoldier(map,{x:s.x+dx*step,y:s.y}))s.x+=dx*step;
      if(clearForSoldier(map,{x:s.x,y:s.y+dy*step}))s.y+=dy*step;
      s.moving=Math.hypot(s.x-oldX,s.y-oldY)>.001;if(s.moving){s.walk+=dt*10;if(distance>stats.range)s.angle=Math.atan2(dy,dx);}
    }
  }
  state.soldiers=state.soldiers.filter(s=>s.health>0||s.dead<3);
  const cache=formationCaches.get(state);if(cache&&cache.size>state.soldiers.length+64){const retained=new Set(state.soldiers.map(s=>s.id));for(const id of cache.keys())if(!retained.has(id))cache.delete(id);}
  return shots;
}

export function awardInfantryKills(state:InfantryState,ids:readonly number[],kills:readonly number[]){
  const soldiers=new Map(state.soldiers.map(s=>[s.id,s]));
  ids.forEach((id,index)=>{const earned=Math.max(0,Math.floor(kills[index]??0));if(!earned)return;const soldier=soldiers.get(id);if(!soldier)return;soldier.kills=(soldier.kills??0)+earned;soldier.veterancyXp=(soldier.veterancyXp??0)+earned;soldier.veterancy=veterancyLevel(soldier.veterancyXp);});
}

export function validInfantry(value:unknown,map:WorldMap):value is InfantryState{
  if(!value||typeof value!=='object')return false;const v=value as InfantryState;
  const n=(x:number)=>Number.isFinite(x)&&x>=0,rank=(x:number)=>Number.isInteger(x)&&x>=0&&x<=5;
  if(!Number.isSafeInteger(v.nextId)||v.nextId<1||!Array.isArray(v.buildings)||!Array.isArray(v.soldiers))return false;
  if(!Number.isSafeInteger(v.casualties??0)||(v.casualties??0)<0||!Number.isSafeInteger(v.friendlyFire??0)||(v.friendlyFire??0)<0||(v.friendlyFire??0)>(v.casualties??0))return false;
  const ids=new Set<number>();const id=(x:number)=>Number.isSafeInteger(x)&&x>0&&x<v.nextId&&!ids.has(x)&&!!ids.add(x);
  for(const b of v.buildings){if(!b||!id(b.id)||!(b.kind===undefined||Object.hasOwn(INFANTRY,b.kind))||!rank(b.defense??0)||!rank(b.production)||!rank(b.training)||!n(b.progress)||b.progress>1||!b.rally||!clearForSoldier(map,b,2)||!clearForSoldier(map,b.rally)||!Number.isInteger(b.spent)||(b.recruited!==undefined&&(!Number.isSafeInteger(b.recruited)||b.recruited<0)))return false;let spent:number=INFANTRY[b.kind??'rifle'].cost;for(const rank of [b.production,b.training,b.defense??0])for(let i=0;i<rank;i++)spent+=infantryUpgradeCost(i);const legacy={rifle:600,rocket:850,flame:750,samurai:950,dog:60}[b.kind??'rifle'];if(b.spent!==spent&&b.spent!==spent-INFANTRY[b.kind??'rifle'].cost+legacy)return false;}
  if(v.buildings.some((b,i)=>v.buildings.slice(i+1).some(o=>Math.abs(b.x-o.x)<4&&Math.abs(b.y-o.y)<4)))return false;
  for(const s of v.soldiers){if(!s||(s.casualtyRecorded!==undefined&&typeof s.casualtyRecorded!=='boolean')||(s.deathCause!==undefined&&!['enemy','friendly-fire'].includes(s.deathCause))||!id(s.id)||!v.buildings.some(b=>b.id===s.home&&(b.kind??'rifle')===(s.kind??'rifle'))||!rank(s.defense??0)||!rank(s.quality)||!n(s.x)||!n(s.y)||s.x>=map.width||s.y>=map.height||!n(s.health)||s.health>infantryStats(s.kind,s.quality,s.defense,s.veterancy??0).health||!n(s.cooldown)||!Number.isFinite(s.angle)||!n(s.flash)||!n(s.walk)||!n(s.dead)||!n(s.kills??0)||!n(s.veterancyXp??0)||!Number.isInteger(s.veterancy??0)||(s.veterancy??0)<0||(s.veterancy??0)>MAX_VETERANCY||(s.moveSlot!==undefined&&(!Number.isSafeInteger(s.moveSlot)||s.moveSlot<0))||(s.rallySlot!==undefined&&(!Number.isSafeInteger(s.rallySlot)||s.rallySlot<0))||!!s.moveTarget&&(!Number.isFinite(s.moveTarget.x)||!Number.isFinite(s.moveTarget.y)||s.moveTarget.x<0||s.moveTarget.y<0||s.moveTarget.x>=map.width||s.moveTarget.y>=map.height)||!!s.rallyTarget&&(!Number.isFinite(s.rallyTarget.x)||!Number.isFinite(s.rallyTarget.y)||s.rallyTarget.x<0||s.rallyTarget.y<0||s.rallyTarget.x>=map.width||s.rallyTarget.y>=map.height))return false;}
  return true;
}
