import type {Rect,Vec2} from '../contracts/index.ts';

export type BarrierKind='fence'|'wire';
export type BarrierSegment=Rect&{from:Vec2;to:Vec2;run:number;kind:BarrierKind};

export const BARRIER_THICKNESS=.72;
export const BARRIER_SAMPLE=.65;
export const MIN_BARRIER_LENGTH=1;
/** One original 4-unit panel now covers five world units of a freeform run. */
export const BARRIER_COST_LENGTH=5;

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

/**
 * A physical line is sampled into centered collision tiles while `from/to`
 * retain the true geometry for rendering.  Extending an axis-aligned box from
 * each diagonal segment biases its outer edge, which made one side of a fence
 * stand farther away than the other.  The tile size is compensated for the
 * line's angle so its projected half-width stays `thickness / 2` on either
 * side of the painted centerline.
 */
export function barrierSegments(kind:BarrierKind,run:number,points:readonly Vec2[],thickness=BARRIER_THICKNESS):BarrierSegment[]{
  const result:BarrierSegment[]=[];
  for(let index=1;index<points.length;index++){
    const from=points[index-1],to=points[index],length=distance(from,to);if(length<.001)continue;
    const pieces=Math.max(1,Math.ceil(length/BARRIER_SAMPLE)),tile=thickness/(Math.abs((to.x-from.x)/length)+Math.abs((to.y-from.y)/length));
    for(let piece=0;piece<pieces;piece++){
      const a=piece/pieces,b=(piece+1)/pieces,start={x:from.x+(to.x-from.x)*a,y:from.y+(to.y-from.y)*a},end={x:from.x+(to.x-from.x)*b,y:from.y+(to.y-from.y)*b},center={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
      result.push({x:center.x-tile/2,y:center.y-tile/2,width:tile,height:tile,from:start,to:end,run,kind});
    }
  }
  return result;
}

export function barrierLength(points:readonly Vec2[]):number{return points.slice(1).reduce((total,point,index)=>total+distance(points[index],point),0);}

export function barrierCost(length:number,unitCost:number):number{return Math.ceil(Math.max(0,length)/BARRIER_COST_LENGTH)*unitCost;}

export function pointToBarrierDistance(point:Vec2,segment:Pick<BarrierSegment,'from'|'to'>):number{
  const dx=segment.to.x-segment.from.x,dy=segment.to.y-segment.from.y,length=dx*dx+dy*dy;
  const t=length<.0001?0:Math.max(0,Math.min(1,((point.x-segment.from.x)*dx+(point.y-segment.from.y)*dy)/length));
  return Math.hypot(point.x-(segment.from.x+dx*t),point.y-(segment.from.y+dy*t));
}

/** Pull either end of a new path onto the nearest existing endpoint in range. */
export function snapBarrierEndpoints(points:readonly Vec2[],targets:readonly Vec2[],radius=1.5):Vec2[]{
  if(points.length<2||targets.length===0)return points.map(copy);
  const result=points.map(copy);
  for(const index of [0,result.length-1]){
    const point=result[index];let best:Vec2|undefined,bestDistance=radius;
    for(const target of targets){const gap=distance(point,target);if(gap<bestDistance){best=target;bestDistance=gap;}}
    if(best)result[index]=copy(best);
  }
  return result;
}
