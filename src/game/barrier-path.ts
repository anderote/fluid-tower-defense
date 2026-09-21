import type {Rect,Vec2} from '../contracts/index.ts';

export type BarrierKind='fence'|'wire';
export type BarrierSegment=Rect&{from:Vec2;to:Vec2;run:number;kind:BarrierKind};

export const BARRIER_THICKNESS=.72;
export const BARRIER_SAMPLE=.65;
export const MIN_BARRIER_LENGTH=1;

const distance=(a:Vec2,b:Vec2)=>Math.hypot(b.x-a.x,b.y-a.y);
const copy=(point:Vec2):Vec2=>({x:point.x,y:point.y});

/** Keep a freehand stroke stable even when pointer events arrive at different rates. */
export function sampleBarrier(points:readonly Vec2[],point:Vec2,spacing=BARRIER_SAMPLE):Vec2[]{
  const previous=points.at(-1);if(!previous)return [copy(point)];
  const length=distance(previous,point);if(length<spacing)return [...points];
  const additions=Math.floor(length/spacing),result=[...points];
  for(let i=1;i<=additions;i++){const t=i*spacing/length;result.push({x:previous.x+(point.x-previous.x)*t,y:previous.y+(point.y-previous.y)*t});}
  return result;
}

/** Drop nearly-collinear cursor samples without changing intentional corners. */
export function simplifyBarrier(points:readonly Vec2[],tolerance=.18):Vec2[]{
  if(points.length<3)return points.map(copy);
  const result:Vec2[]=[copy(points[0])];
  for(let i=1;i<points.length-1;i++){
    const a=result.at(-1)!,b=points[i],c=points[i+1],base=distance(a,c);
    const offset=base<.0001?distance(a,b):Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/base;
    if(offset>=tolerance)result.push(copy(b));
  }
  result.push(copy(points.at(-1)!));return result;
}

/** A physical line is sampled into tiny collision rectangles, while `from/to` retain the true geometry for rendering. */
export function barrierSegments(kind:BarrierKind,run:number,points:readonly Vec2[],thickness=BARRIER_THICKNESS):BarrierSegment[]{
  const result:BarrierSegment[]=[];
  for(let index=1;index<points.length;index++){
    const from=points[index-1],to=points[index],length=distance(from,to);if(length<.001)continue;
    const pieces=Math.max(1,Math.ceil(length/BARRIER_SAMPLE));
    for(let piece=0;piece<pieces;piece++){
      const a=piece/pieces,b=(piece+1)/pieces,start={x:from.x+(to.x-from.x)*a,y:from.y+(to.y-from.y)*a},end={x:from.x+(to.x-from.x)*b,y:from.y+(to.y-from.y)*b};
      result.push({x:Math.min(start.x,end.x)-thickness/2,y:Math.min(start.y,end.y)-thickness/2,width:Math.abs(end.x-start.x)+thickness,height:Math.abs(end.y-start.y)+thickness,from:start,to:end,run,kind});
    }
  }
  return result;
}

export function barrierLength(points:readonly Vec2[]):number{return points.slice(1).reduce((total,point,index)=>total+distance(points[index],point),0);}

export function pointToBarrierDistance(point:Vec2,segment:Pick<BarrierSegment,'from'|'to'>):number{
  const dx=segment.to.x-segment.from.x,dy=segment.to.y-segment.from.y,length=dx*dx+dy*dy;
  const t=length<.0001?0:Math.max(0,Math.min(1,((point.x-segment.from.x)*dx+(point.y-segment.from.y)*dy)/length));
  return Math.hypot(point.x-(segment.from.x+dx*t),point.y-(segment.from.y+dy*t));
}
