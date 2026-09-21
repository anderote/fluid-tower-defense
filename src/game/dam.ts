import type {Effect,Tower,WorldMap} from '../contracts/index.ts';
import {DAM_GATES,DAM_CHANNELS,DAM_ID,sameRect} from '../content/dam.ts';
import {hasSpawnRoute,mapWithTurretObstacles} from '../navigation/index.ts';
export const FLOOD_SECONDS=3.2;
export function toggleDamGate(map:WorldMap,index:0|1,towers:readonly Tower[]):string|undefined{
 const d=map.dam;if(map.id!==DAM_ID||!d)return 'This map has no floodgates.';
 if(d.surge>0)return 'Wait for the surge to pass before moving gates.';
 if(d.switchCooldown>0)return 'Gate machinery is cycling.';
 const gate=DAM_GATES[index],closing=!d.closed[index];
 const obstacles=map.obstacles.filter(r=>!sameRect(r,gate));if(closing)obstacles.push({...gate});
 if(!hasSpawnRoute(mapWithTurretObstacles({...map,obstacles},towers)))return 'Keep a clear spillway route before closing this gate.';
 map.obstacles=obstacles;d.closed[index]=closing;d.switchCooldown=3;return undefined;
}
export function releaseFlood(map:WorldMap):boolean{
 const d=map.dam;if(map.id!==DAM_ID||!d||d.reservoir<100||d.surge>0)return false;
 d.reservoir=0;d.surge=FLOOD_SECONDS;return true;
}
export function advanceDam(map:WorldMap,dt:number,combat:boolean):Effect[]{
 const d=map.dam;if(!d||!combat||!Number.isFinite(dt)||dt<=0)return [];
 d.switchCooldown=Math.max(0,d.switchCooldown-dt);
 if(d.surge<=0){d.reservoir=Math.min(100,d.reservoir+dt*100/30);return [];}
 const step=Math.min(dt,d.surge);d.surge=Math.max(0,d.surge-step);if(d.surge<1e-6)d.surge=0;
 if(d.surge===0)d.reservoir=Math.min(100,d.reservoir+(dt-step)*100/30);
 const x=132-(1-d.surge/FLOOD_SECONDS)*104;
 return DAM_CHANNELS.flatMap((channel,i)=>{
  // Closed side gates stop their surge at the shutter; the center always flows.
  if(i!==1&&d.closed[i===0?0:1]&&x<68)return [];
  return [{x,y:channel.y+channel.height/2,kind:'flood' as const,radius:10,strength:95*step,damage:110*step,direction:{x:-1,y:0},cone:8,duration:step,source:0,peakPressureKpa:650}];
 });
}
