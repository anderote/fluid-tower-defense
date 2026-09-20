import type {HeavyProjectile, Vec2} from '../contracts/index.ts';

export interface HeavyImpact extends Vec2 {
  kind:HeavyProjectile['kind'];
  direction:Vec2;
  serial:number;
  lane:number;
  peakPressureKpa:number;
}

export function createHeavyProjectiles(kind:HeavyProjectile['kind'], muzzles:readonly Vec2[], target:Vec2, serial:number,peakPressureKpa=kind==='rocket'?1250:650):HeavyProjectile[]{
  const origin=muzzles[Math.floor(muzzles.length/2)]??target,dx=target.x-origin.x,dy=target.y-origin.y,length=Math.max(.001,Math.hypot(dx,dy));
  const forward={x:dx/length,y:dy/length},side={x:-forward.y,y:forward.x};
  if(kind==='mortar')return [{...origin,kind,target:{...target},age:0,delay:0,flight:.54,serial,lane:0,peakPressureKpa}];
  return [-1,0,1].map((lane,index)=>({...muzzles[index]??origin,kind,target:{x:target.x+side.x*lane*2.1,y:target.y+side.y*lane*2.1},age:0,delay:index*.045,flight:.5,serial:serial*3+index,lane,peakPressureKpa}));
}

export function advanceHeavyProjectiles(projectiles:readonly HeavyProjectile[],dt:number):{active:HeavyProjectile[];impacts:HeavyImpact[]}{
  const active:HeavyProjectile[]=[],impacts:HeavyImpact[]=[];
  for(const projectile of projectiles){
    const next={...projectile,age:projectile.age+Math.max(0,dt)},end=projectile.delay+projectile.flight;
    if(projectile.age<end&&next.age>=end){
      const dx=projectile.target.x-projectile.x,dy=projectile.target.y-projectile.y,length=Math.max(.001,Math.hypot(dx,dy));
      impacts.push({x:projectile.target.x,y:projectile.target.y,kind:projectile.kind,direction:{x:dx/length,y:dy/length},serial:projectile.serial,lane:projectile.lane,peakPressureKpa:projectile.peakPressureKpa});
    }else if(next.age<end)active.push(next);
  }
  return {active,impacts};
}
