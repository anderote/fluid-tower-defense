import type {Vec2} from '../contracts/index.ts';

/** Project a ballistic path above the ground; tangent turns the nose down on descent. */
export function projectilePose(origin:Vec2,target:Vec2,progress:number,peak:number,startHeight=0){
 const t=Math.max(0,Math.min(1,progress)),dx=target.x-origin.x,dy=target.y-origin.y;
 const height=startHeight*(1-t)+4*peak*t*(1-t),ground={x:origin.x+dx*t,y:origin.y+dy*t};
 const angle=Math.atan2(dy+startHeight-4*peak*(1-2*t),dx);
 return {...ground,y:ground.y-height,ground,height,angle};
}
export const arrowFlight=(distance:number)=>Math.max(.45,Math.min(3,distance/12));
export const infantryRocketFlight=(distance:number)=>Math.max(.3,Math.min(2,distance/22));
