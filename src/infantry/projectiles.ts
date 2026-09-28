import type {InfantryProjectile,SoldierArrow} from '../contracts/index.ts';
import type {RifleShot,Soldier} from './model.ts';
import {arrowFlight,infantryRocketFlight} from '../effects/projectile-flight.ts';

/** Snapshot launch position, aim and damage: neither the shooter nor target can steer a round later. */
export function launchInfantryProjectile(s:Soldier,shot:RifleShot,tick:number):InfantryProjectile|undefined{
 const kind=s.kind==='archer'?'arrow':s.kind==='rocket'||s.kind==='bazooka'?'rocket':undefined;if(!kind)return;
 const distance=Math.hypot(shot.x-s.x,shot.y-s.y),serial=tick*10000+s.id;
 const scatter=kind==='arrow'?Math.min(.75,.12+distance*.018):0,angle=serial*2.399963229728653;
 const target={x:shot.x+Math.cos(angle)*scatter,y:shot.y+Math.sin(angle)*scatter};
 const life=Math.ceil((kind==='arrow'?arrowFlight(distance):infantryRocketFlight(distance))*60)/60;
 return {x:s.x,y:s.y,kind,target,age:0,life,launchTick:tick,serial,soldier:s.id,damage:shot.damage};
}
export function advanceInfantryProjectiles(projectiles:readonly InfantryProjectile[],tick:number,idleElapsed=0){
 const active:InfantryProjectile[]=[],impacts:InfantryProjectile[]=[];
 for(const p of projectiles){const next={...p,age:Math.max(p.age+Math.max(0,idleElapsed),(tick-p.launchTick)/60)};if(next.age+1e-9>=next.life)impacts.push(next);else active.push(next);}
 return {active,impacts};
}
export function groundedArrow(p:InfantryProjectile):SoldierArrow{
 return {...p.target,angle:Math.atan2(p.target.y-p.y,p.target.x-p.x),age:0,life:18,serial:p.serial};
}
