import type {HeavyProjectile, Vec2} from '../contracts/index.ts';

// Impact deadlines are quantized to the fixed simulation clock, shared by CPU visuals and GPU damage.
export const HEAVY_STEP=1/60;
export const MORTAR_FLIGHT=.54, ROCKET_FLIGHT=.5, ROCKET_DELAY=.045;
// Keep overlapping upgraded salvos alive independently of the tower firing state.
export const HEAVY_SALVO_SLOTS=8;
export const impactTickOffset=(kind:HeavyProjectile['kind'],index=0)=>Math.ceil(((kind==='mortar'?MORTAR_FLIGHT:ROCKET_FLIGHT)+index*ROCKET_DELAY)/HEAVY_STEP-1e-9);

export interface HeavyImpact extends Vec2 {
  kind:HeavyProjectile['kind'];
  direction:Vec2;
  serial:number;
  lane:number;
  peakPressureKpa:number;
}

export function createHeavyProjectiles(kind:HeavyProjectile['kind'], muzzles:readonly Vec2[], target:Vec2, serial:number,peakPressureKpa=kind==='rocket'?1250:650,radius=6.6,angle?:number):HeavyProjectile[]{
  const origin=muzzles[Math.floor(muzzles.length/2)]??target,dx=target.x-origin.x,dy=target.y-origin.y,length=Math.max(.001,Math.hypot(dx,dy));
  const forward=angle===undefined?{x:dx/length,y:dy/length}:{x:Math.cos(angle),y:Math.sin(angle)},side={x:-forward.y,y:forward.x};
  if(kind==='mortar')return [{...origin,kind,target:{...target},age:0,delay:0,flight:impactTickOffset(kind)*HEAVY_STEP,serial,lane:0,peakPressureKpa}];
  return [-1,0,1].map((lane,index)=>({...muzzles[index]??origin,kind,target:{x:target.x+side.x*lane*radius*.48,y:target.y+side.y*lane*radius*.48},age:0,delay:index*ROCKET_DELAY,flight:impactTickOffset(kind,index)*HEAVY_STEP-index*ROCKET_DELAY,serial:serial*3+index,lane,peakPressureKpa}));
}

export function advanceHeavyProjectiles(projectiles:readonly HeavyProjectile[],dt:number,tick?:number):{active:HeavyProjectile[];impacts:HeavyImpact[]}{
  const active:HeavyProjectile[]=[],impacts:HeavyImpact[]=[];
  for(const projectile of projectiles){
    const next={...projectile,age:tick!==undefined&&projectile.launchTick!==undefined?Math.max(projectile.age,(tick-projectile.launchTick)*HEAVY_STEP):projectile.age+Math.max(0,dt)},end=projectile.delay+projectile.flight;
    if(projectile.age<end&&next.age>=end){
      const dx=projectile.target.x-projectile.x,dy=projectile.target.y-projectile.y,length=Math.max(.001,Math.hypot(dx,dy));
      impacts.push({x:projectile.target.x,y:projectile.target.y,kind:projectile.kind,direction:{x:dx/length,y:dy/length},serial:projectile.serial,lane:projectile.lane,peakPressureKpa:projectile.peakPressureKpa});
    }else if(next.age<end)active.push(next);
  }
  return {active,impacts};
}
