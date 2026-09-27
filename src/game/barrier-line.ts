import type {Rect} from '../contracts/index.ts';

/** Rasterize a continuous barrier preview between two snapped grid cells. */
export function barrierLine(start:Rect,end:Rect,step=2):Rect[]{
  const startX=Math.round(start.x/step),startY=Math.round(start.y/step),targetX=Math.round(end.x/step),targetY=Math.round(end.y/step);
  const horizontal=Math.abs(targetX-startX)>=Math.abs(targetY-startY),distance=horizontal?targetX-startX:targetY-startY,direction=Math.sign(distance)||1;
  return Array.from({length:Math.abs(distance)+1},(_,index)=>({x:(startX+(horizontal?index*direction:0))*step,y:(startY+(horizontal?0:index*direction))*step,width:start.width,height:start.height}));
}
