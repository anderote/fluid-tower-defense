import type {Rect,Vec2} from '../contracts/index.ts';

const TAU=Math.PI*2;
const CORNER_EPSILON=1e-5;

const contains=(rect:Rect,point:Vec2)=>point.x>=rect.x&&point.x<=rect.x+rect.width&&point.y>=rect.y&&point.y<=rect.y+rect.height;

/** Distance to the first blocking rectangle along a normalized ray. */
export function lineOfSightDistance(origin:Vec2,direction:Vec2,range:number,obstacles:readonly Rect[]):number{
  let nearest=Math.max(0,range);
  for(const wall of obstacles){
    // A wall-mounted turret must be able to see away from its supporting wall.
    // This is the same exception used by the combat shader.
    if(contains(wall,origin))continue;
    let enter=0,leave=nearest;
    for(const axis of ['x','y'] as const){
      const start=origin[axis],delta=direction[axis],low=wall[axis],high=low+wall[axis==='x'?'width':'height'];
      if(Math.abs(delta)<1e-9){if(start<low||start>high){leave=-1;break;}continue;}
      const first=(low-start)/delta,last=(high-start)/delta;
      enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));
    }
    if(leave>=enter&&leave>0&&enter<nearest)nearest=Math.max(0,enter);
  }
  return nearest;
}

/**
 * A range-limited, star-shaped visibility polygon. Regular samples keep its
 * outer edge round; rays bracketing every obstacle corner produce hard cover
 * shadows without letting the overlay bleed around a wall.
 */
export function lineOfSightPolygon(origin:Vec2,range:number,obstacles:readonly Rect[],radialSamples=192):Vec2[]{
  if(!(range>0))return [];
  const angles:number[]=[];
  for(let i=0;i<Math.max(24,radialSamples);i++)angles.push(i/Math.max(24,radialSamples)*TAU);
  for(const wall of obstacles){
    if(contains(wall,origin))continue;
    for(const corner of [
      {x:wall.x,y:wall.y},{x:wall.x+wall.width,y:wall.y},
      {x:wall.x+wall.width,y:wall.y+wall.height},{x:wall.x,y:wall.y+wall.height},
    ]){
      const angle=Math.atan2(corner.y-origin.y,corner.x-origin.x);
      angles.push(angle-CORNER_EPSILON,angle,angle+CORNER_EPSILON);
    }
  }
  angles.sort((left,right)=>left-right);
  return angles.map(angle=>{
    const direction={x:Math.cos(angle),y:Math.sin(angle)};
    const distance=lineOfSightDistance(origin,direction,range,obstacles);
    return {x:origin.x+direction.x*distance,y:origin.y+direction.y*distance};
  });
}
