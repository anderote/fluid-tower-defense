import type {NavigationField,Vec2,WorldMap} from '../contracts/index.ts';
import {MAX_VETERANCY,veterancyLevel,veterancyMultiplier} from '../content/index.ts';
import {buildNavigation} from '../navigation/index.ts';

export const BARRACKS_COST=600,MAX_BARRACKS=8,SQUAD_SIZE=8,MAX_INFANTRY=MAX_BARRACKS*SQUAD_SIZE;
export type InfantryKind='rifle'|'rocket'|'flame'|'samurai';
export const INFANTRY={
 rifle:{building:'Rifle Barracks',name:'Riflemen',cost:600,interval:8,health:40,damage:12,range:14,cooldown:1.05,armor:0,speed:3,role:'Single-shot rifles from a pressure-aware firing line'},
 rocket:{building:'Rocket Academy',name:'Rocket troops',cost:850,interval:12,health:55,damage:32,range:19,cooldown:2.5,armor:.1,speed:2.7,role:'Explosive splash against dense hordes'},
 flame:{building:'Flame Depot',name:'Flamethrowers',cost:750,interval:10,health:80,damage:8,range:7,cooldown:.3,armor:.2,speed:3,role:'Close-range cones of fire'},
 samurai:{building:'Samurai Dojo',name:'Samurai',cost:950,interval:12,health:150,damage:30,range:3.5,cooldown:.65,armor:.35,speed:6,role:'Armored melee fighters with sweeping sword slashes'},
} as const;
export const infantryStats=(kind:InfantryKind='rifle',quality=0,defense=0,veterancy=0,research:readonly string[]=[] )=>{const v=INFANTRY[kind],ranks=(id:string)=>research.filter(upgrade=>upgrade===id).length,experience=veterancyMultiplier(veterancy);return {...v,health:v.health+quality*12+defense*20,damage:v.damage*(1+quality/3)*experience*(1+ranks('damage')*.04),range:v.range*(1+ranks('range')*.03),cooldown:v.cooldown/(1+quality*.08)/(1+ranks('rate')*.035),armor:Math.min(.7,v.armor+defense*.06)};};
export interface Barracks extends Vec2 {kind?:InfantryKind;defense?:number;id:number;rally:Vec2;production:number;training:number;progress:number;spent:number}
export interface Soldier extends Vec2 {kind?:InfantryKind;defense?:number;id:number;home:number;quality:number;health:number;cooldown:number;angle:number;flash:number;walk:number;dead:number;kills?:number;veterancy?:number;veterancyXp?:number;moveTarget?:Vec2}
export interface InfantryState {nextId:number;buildings:Barracks[];soldiers:Soldier[]}
export interface Threat extends Vec2 {target:number;generation:number;contact:number;age:number}
export interface RifleShot {soldier:number;target:number;generation:number;damage:number;x:number;y:number}
export const freshInfantry=():InfantryState=>({nextId:1,buildings:[],soldiers:[]});
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
export function infantryFormationPoint(map:WorldMap,b:Barracks,slot:number):Vec2 {
  const travelX=b.rally.x-b.x,travelY=b.rally.y-b.y,length=Math.max(.001,Math.hypot(travelX,travelY)),forward={x:travelX/length,y:travelY/length},right={x:-forward.y,y:forward.x};
  const across=(slot%4-1.5)*1.25,depth=(Math.floor(slot/4)-.5)*1.4,offset={x:right.x*across+forward.x*depth,y:right.y*across+forward.y*depth};
  const candidate=(x:number,y:number,scale=1)=>({x:b.rally.x+x*scale,y:b.rally.y+y*scale});
  const candidates=[candidate(offset.x,offset.y),candidate(-offset.y,offset.x),candidate(offset.y,-offset.x),candidate(-offset.x,-offset.y),candidate(offset.x,offset.y,.55),b.rally];
  return candidates.find(point=>clearForSoldier(map,point)&&clearInfantryPath(map,b.rally,point))??b.rally;
}
export function exitPoint(map:WorldMap,b:Barracks,field:NavigationField):Vec2|undefined {
  return [{x:b.x,y:b.y+3},{x:b.x-3,y:b.y},{x:b.x+3,y:b.y},{x:b.x,y:b.y-3}].find(p=>clearForSoldier(map,p)&&Number.isFinite(field.distances[Math.floor(p.y)*field.width+Math.floor(p.x)]));
}

/** Small friendly squads use CPU navigation; threats and confirmed damage use GPU particle handles. */
export function advanceInfantry(state:InfantryState,map:WorldMap,fields:Map<number,NavigationField>,threats:Map<number,Threat>,dt:number,combat:boolean,research:readonly string[]=[],orderFields:Map<number,NavigationField>=new Map()):RifleShot[]{
  if(!combat)return [];
  const shots:RifleShot[]=[];
  for(const b of state.buildings){
    const field=fields.get(b.id);if(!field)continue;
    if(state.soldiers.filter(s=>s.home===b.id&&s.health>0).length>=SQUAD_SIZE)continue;
    b.progress=Math.min(1,b.progress+dt/recruitInterval(b.production,b.kind));
    if(b.progress>=1){const p=exitPoint(map,b,field);if(p){state.soldiers.push({...p,id:state.nextId++,home:b.id,kind:b.kind??'rifle',defense:b.defense??0,quality:b.training,health:infantryStats(b.kind,b.training,b.defense,0,research).health,cooldown:0,angle:Math.PI,flash:0,walk:0,dead:0,kills:0,veterancy:0,veterancyXp:0});b.progress=0;}}
  }
  for(const s of state.soldiers){
    s.flash=Math.max(0,s.flash-dt);
    if(s.health<=0){s.dead+=dt;continue;}
    const b=state.buildings.find(b=>b.id===s.home),field=s.moveTarget?orderFields.get(s.id):fields.get(s.home);if(!b||!field)continue;
    const threat=threats.get(s.id);if(threat)threat.age+=dt;
    const fresh=threat&&threat.age<.35?threat:undefined;
    s.health=Math.max(0,s.health-(fresh?.contact??0)*dt*(1-infantryStats(s.kind,s.quality,s.defense,s.veterancy,research).armor));
    if(s.health<=0){s.flash=0;continue;}
    const stats=infantryStats(s.kind,s.quality,s.defense,s.veterancy,research),distance=fresh&&fresh.target>=0?Math.hypot(fresh.x-s.x,fresh.y-s.y):Infinity;
    s.cooldown=Math.max(0,s.cooldown-dt);
    if(fresh&&fresh.target>=0&&distance<=stats.range){
      s.angle=Math.atan2(fresh.y-s.y,fresh.x-s.x);
      if(s.cooldown===0){shots.push({soldier:s.id,target:fresh.target,generation:fresh.generation,damage:stats.damage,x:fresh.x,y:fresh.y});s.cooldown=stats.cooldown;s.flash=s.kind==='samurai'?.28:s.kind==='flame'?.2:.1;}
    }
    const squad=state.soldiers.filter(other=>other.home===b.id&&other.health>0).sort((a,c)=>a.id-c.id),slot=Math.max(0,squad.findIndex(other=>other.id===s.id)),formation=s.moveTarget??infantryFormationPoint(map,b,slot),rallyDistance=Math.hypot(s.x-formation.x,s.y-formation.y),ordered=!!s.moveTarget;
    let dx=0,dy=0;
    if(!ordered&&s.kind==='samurai'&&fresh&&distance>2&&distance<12&&rallyDistance<10&&clearInfantryPath(map,s,fresh)){dx=(fresh.x-s.x)/distance;dy=(fresh.y-s.y)/distance;}
    else if(!ordered&&s.kind!=='samurai'&&fresh&&distance<2.5&&rallyDistance<6){dx=(s.x-fresh.x)/Math.max(.01,distance);dy=(s.y-fresh.y)/Math.max(.01,distance);}
    else if(rallyDistance>.4&&(ordered||distance>stats.range||rallyDistance>5)){
      if(clearInfantryPath(map,s,formation)){dx=(formation.x-s.x)/rallyDistance;dy=(formation.y-s.y)/rallyDistance;}
      else{
        const cellX=Math.max(0,Math.min(field.width-1,Math.floor(s.x/field.cellSize))),cellY=Math.max(0,Math.min(field.height-1,Math.floor(s.y/field.cellSize))),at=cellY*field.width+cellX,fieldX=field.vectors[at*2]??0,fieldY=field.vectors[at*2+1]??0;
        const waypoint={x:(cellX+.5)*field.cellSize+fieldX*field.cellSize,y:(cellY+.5)*field.cellSize+fieldY*field.cellSize},toWaypoint=Math.hypot(waypoint.x-s.x,waypoint.y-s.y);
        if(toWaypoint>.01){dx=(waypoint.x-s.x)/toWaypoint;dy=(waypoint.y-s.y)/toWaypoint;}
      }
    }
    // Gentle separation makes a firing line without making friendly units solid.
    if(rallyDistance<8)for(const other of state.soldiers){if(other.id===s.id||other.health<=0)continue;const d=Math.hypot(s.x-other.x,s.y-other.y);if(d>0&&d<1.25){dx+=(s.x-other.x)/d*.48;dy+=(s.y-other.y)/d*.48;}}
    const movement=Math.hypot(dx,dy);if(movement>0){dx/=Math.max(1,movement);dy/=Math.max(1,movement);const step=stats.speed*dt,candidates=[{x:s.x+dx*step,y:s.y+dy*step},{x:s.x+dx*step,y:s.y},{x:s.x,y:s.y+dy*step}];const p=candidates.find(point=>clearForSoldier(map,point));if(p){const movedX=p.x-s.x,movedY=p.y-s.y;s.x=p.x;s.y=p.y;s.walk+=dt*10;if(distance>stats.range)s.angle=Math.atan2(movedY,movedX);}}
  }
  state.soldiers=state.soldiers.filter(s=>s.health>0||s.dead<3);
  return shots;
}

export function awardInfantryKills(state:InfantryState,ids:readonly number[],kills:readonly number[]){
  ids.forEach((id,index)=>{const earned=Math.max(0,Math.floor(kills[index]??0)),soldier=state.soldiers.find(candidate=>candidate.id===id);if(!soldier||!earned)return;soldier.kills=(soldier.kills??0)+earned;soldier.veterancyXp=(soldier.veterancyXp??0)+earned;soldier.veterancy=veterancyLevel(soldier.veterancyXp);});
}

export function validInfantry(value:unknown,map:WorldMap):value is InfantryState{
  if(!value||typeof value!=='object')return false;const v=value as InfantryState;
  const n=(x:number)=>Number.isFinite(x)&&x>=0,rank=(x:number)=>Number.isInteger(x)&&x>=0&&x<=5;
  if(!Number.isSafeInteger(v.nextId)||v.nextId<1||!Array.isArray(v.buildings)||v.buildings.length>MAX_BARRACKS||!Array.isArray(v.soldiers)||v.soldiers.length>MAX_INFANTRY*2)return false;
  const ids=new Set<number>();const id=(x:number)=>Number.isSafeInteger(x)&&x>0&&x<v.nextId&&!ids.has(x)&&!!ids.add(x);
  for(const b of v.buildings){if(!b||!id(b.id)||!(b.kind===undefined||Object.hasOwn(INFANTRY,b.kind))||!rank(b.defense??0)||!rank(b.production)||!rank(b.training)||!n(b.progress)||b.progress>1||!b.rally||!clearForSoldier(map,b,2)||!clearForSoldier(map,b.rally)||!Number.isInteger(b.spent))return false;let spent:number=INFANTRY[b.kind??'rifle'].cost;for(const rank of [b.production,b.training,b.defense??0])for(let i=0;i<rank;i++)spent+=infantryUpgradeCost(i);if(b.spent!==spent)return false;}
  if(v.buildings.some((b,i)=>v.buildings.slice(i+1).some(o=>Math.abs(b.x-o.x)<4&&Math.abs(b.y-o.y)<4)))return false;
  for(const s of v.soldiers){if(!s||!id(s.id)||!v.buildings.some(b=>b.id===s.home&&(b.kind??'rifle')===(s.kind??'rifle'))||!rank(s.defense??0)||!rank(s.quality)||!n(s.x)||!n(s.y)||s.x>=map.width||s.y>=map.height||!n(s.health)||s.health>infantryStats(s.kind,s.quality,s.defense,s.veterancy??0).health||!n(s.cooldown)||!Number.isFinite(s.angle)||!n(s.flash)||!n(s.walk)||!n(s.dead)||!n(s.kills??0)||!n(s.veterancyXp??0)||!Number.isInteger(s.veterancy??0)||(s.veterancy??0)<0||(s.veterancy??0)>MAX_VETERANCY||!!s.moveTarget&&(!Number.isFinite(s.moveTarget.x)||!Number.isFinite(s.moveTarget.y)||s.moveTarget.x<0||s.moveTarget.y<0||s.moveTarget.x>=map.width||s.moveTarget.y>=map.height))return false;}
  return v.buildings.every(b=>v.soldiers.filter(s=>s.home===b.id&&s.health>0).length<=SQUAD_SIZE);
}
