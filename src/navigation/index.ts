import {type NavigationField, type Tower, type Vec2, type WorldMap} from '../contracts/index.ts';

const CELL_SIZE = 1;
let version = 0;
const inside = (map:WorldMap,x:number,y:number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
const blocked = (map:WorldMap,x:number,y:number) => map.obstacles.some(rect => x >= rect.x && x < rect.x+rect.width && y >= rect.y && y < rect.y+rect.height);

export function snapToMount(position:Vec2,mounts:readonly {x:number;y:number;width:number;height:number}[]):Vec2 {
  const mount=mounts.find(rect=>position.x>=rect.x&&position.x<rect.x+rect.width&&position.y>=rect.y&&position.y<rect.y+rect.height);
  return mount?{x:mount.x+mount.width/2,y:mount.y+mount.height/2}:position;
}

/** A reverse breadth-first field. Distances are in cells and vectors point to the goal. */
export function buildNavigation(map: WorldMap): NavigationField {
  const width=Math.ceil(map.width/CELL_SIZE), height=Math.ceil(map.height/CELL_SIZE), size=width*height;
  const distances=new Float32Array(size); distances.fill(Infinity);
  const vectors=new Float32Array(size*2);
  const alternateVectors=new Float32Array(size*2);
  const index=(x:number,y:number)=>y*width+x;
  const goalX=Math.min(width-1,Math.max(0,Math.floor(map.goal.x/CELL_SIZE))), goalY=Math.min(height-1,Math.max(0,Math.floor(map.goal.y/CELL_SIZE)));
  const queueX=new Int32Array(size), queueY=new Int32Array(size); let head=0,tail=0;
  if (!blocked(map,goalX*CELL_SIZE,goalY*CELL_SIZE)) { distances[index(goalX,goalY)]=0; queueX[tail]=goalX;queueY[tail++]=goalY; }
  const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
  while(head<tail) {
    const x=queueX[head],y=queueY[head++],distance=distances[index(x,y)];
    for(const [dx,dy] of directions) { const nx=x+dx,ny=y+dy,at=index(nx,ny); if(inside(map,nx*CELL_SIZE,ny*CELL_SIZE) && !blocked(map,nx*CELL_SIZE,ny*CELL_SIZE) && distances[at] === Infinity) { distances[at]=distance+1;queueX[tail]=nx;queueY[tail++]=ny; } }
  }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const at=index(x,y), current=distances[at]; if(!Number.isFinite(current) || current===0) continue;
    let best=current,bx=x,by=y,alternateX=x,alternateY=y;
    for(const [dx,dy] of directions) { const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=width||ny>=height)continue;const candidate=distances[index(nx,ny)];if(candidate<best){best=candidate;bx=nx;by=ny;alternateX=x;alternateY=y;}else if(candidate===best&&candidate<current){alternateX=nx;alternateY=ny;} }
    const length=Math.hypot(bx-x,by-y); vectors[at*2]=(bx-x)/length;vectors[at*2+1]=(by-y)/length;
    if(alternateX!==x||alternateY!==y){const alternateLength=Math.hypot(alternateX-x,alternateY-y);alternateVectors[at*2]=(alternateX-x)/alternateLength;alternateVectors[at*2+1]=(alternateY-y)/alternateLength;}
  }
  return {width,height,cellSize:CELL_SIZE,vectors,alternateVectors,distances,version:++version};
}

/** Checks a circular emplacement footprint, allowing a centered player-built wall to act as its mount. */
export function canPlace(map: WorldMap, towers: readonly Tower[], position: Vec2, footprint: number, mounts:readonly {x:number;y:number;width:number;height:number}[]=[]): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(footprint) || footprint <= 0) return false;
  if (position.x-footprint<0 || position.y-footprint<0 || position.x+footprint>map.width || position.y+footprint>map.height) return false;
  const circleRect=(rect:{x:number;y:number;width:number;height:number})=>{ const x=Math.max(rect.x,Math.min(position.x,rect.x+rect.width)),y=Math.max(rect.y,Math.min(position.y,rect.y+rect.height)); return Math.hypot(position.x-x,position.y-y) < footprint; };
  const mount=mounts.find(rect=>footprint<=Math.min(rect.width,rect.height)/2&&Math.abs(position.x-(rect.x+rect.width/2))<.001&&Math.abs(position.y-(rect.y+rect.height/2))<.001);
  const sameRect=(left:{x:number;y:number;width:number;height:number},right:{x:number;y:number;width:number;height:number})=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;
  if (map.obstacles.some(rect=>(!mount||!sameRect(rect,mount))&&circleRect(rect))) return false;
  if (Math.hypot(position.x-map.goal.x,position.y-map.goal.y) < footprint+map.goalRadius) return false;
  return towers.every(tower=>Math.hypot(position.x-tower.x,position.y-tower.y) >= footprint+1.25);
}
