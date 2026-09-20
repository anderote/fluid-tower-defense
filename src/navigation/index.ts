import {type NavigationField, type Tower, type Vec2, type WorldMap} from '../contracts/index.ts';

const CELL_SIZE = 1;
/** Turret placement and collision use the same 2.5-unit square footprint. */
export const TURRET_OBSTACLE_SIZE = 2.5;
let version = 0;
const inside = (map:WorldMap,x:number,y:number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
const blocked = (map:WorldMap,x:number,y:number) => map.obstacles.some(rect => x >= rect.x && x < rect.x+rect.width && y >= rect.y && y < rect.y+rect.height);

/** Converts deployed turret centers into solid navigation and physics obstacles. */
export function turretObstacles(towers:readonly Pick<Tower,'x'|'y'>[]): {x:number;y:number;width:number;height:number}[] {
  return towers.map(tower=>({x:tower.x-TURRET_OBSTACLE_SIZE/2,y:tower.y-TURRET_OBSTACLE_SIZE/2,width:TURRET_OBSTACLE_SIZE,height:TURRET_OBSTACLE_SIZE}));
}

/** Keeps authored terrain separate while exposing every deployed turret as a solid. */
export function mapWithTurretObstacles(map:WorldMap,towers:readonly Pick<Tower,'x'|'y'>[]):WorldMap {
  return {...map,obstacles:[...map.obstacles,...turretObstacles(towers)]};
}

/** True when at least one spawn cell can reach the goal in the supplied field. */
export function hasSpawnRoute(map:WorldMap):boolean {
  const field=buildNavigation(map);
  const minX=Math.max(0,Math.floor(map.spawn.x/field.cellSize)),maxX=Math.min(field.width,Math.ceil((map.spawn.x+map.spawn.width)/field.cellSize));
  const minY=Math.max(0,Math.floor(map.spawn.y/field.cellSize)),maxY=Math.min(field.height,Math.ceil((map.spawn.y+map.spawn.height)/field.cellSize));
  for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)if(Number.isFinite(field.distances[y*field.width+x]))return true;
  return false;
}

const MOUNT_PICKUP_RADIUS=1.4;
const WALL_MOUNT_SPACING=1.5;
const mountCenter=(rect:{x:number;y:number;width:number;height:number}):Vec2=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
const mountedAt=(position:Vec2,mounts:readonly {x:number;y:number;width:number;height:number}[])=>mounts.find(rect=>Math.abs(position.x-mountCenter(rect).x)<.001&&Math.abs(position.y-mountCenter(rect).y)<.001);

/** Snaps to the nearest wall-cap hardpoint or keeps the footprint flush inside the map edge. */
export function resolvePlacement(map:WorldMap,position:Vec2,footprint:number,mounts:readonly {x:number;y:number;width:number;height:number}[]=[]):Vec2 {
  if(!Number.isFinite(position.x)||!Number.isFinite(position.y)||!Number.isFinite(footprint)||footprint<=0)return position;
  const mount=mounts.map(rect=>({rect,distance:Math.hypot(position.x-mountCenter(rect).x,position.y-mountCenter(rect).y)})).filter(candidate=>candidate.distance<=MOUNT_PICKUP_RADIUS).sort((left,right)=>left.distance-right.distance)[0]?.rect;
  if(mount)return mountCenter(mount);
  return {x:Math.max(footprint,Math.min(map.width-footprint,position.x)),y:Math.max(footprint,Math.min(map.height-footprint,position.y))};
}

export function snapToMount(position:Vec2,mounts:readonly {x:number;y:number;width:number;height:number}[]):Vec2 {
  const mount=mounts.map(rect=>({rect,distance:Math.hypot(position.x-mountCenter(rect).x,position.y-mountCenter(rect).y)})).filter(candidate=>candidate.distance<=MOUNT_PICKUP_RADIUS).sort((left,right)=>left.distance-right.distance)[0]?.rect;
  return mount?mountCenter(mount):position;
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

/** Checks a circular emplacement footprint, allowing compact wall-cap hardpoints. */
export function canPlace(map: WorldMap, towers: readonly Tower[], position: Vec2, footprint: number, mounts:readonly {x:number;y:number;width:number;height:number}[]=[]): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(footprint) || footprint <= 0) return false;
  if (position.x-footprint<0 || position.y-footprint<0 || position.x+footprint>map.width || position.y+footprint>map.height) return false;
  const circleRect=(rect:{x:number;y:number;width:number;height:number})=>{ const x=Math.max(rect.x,Math.min(position.x,rect.x+rect.width)),y=Math.max(rect.y,Math.min(position.y,rect.y+rect.height)); return Math.hypot(position.x-x,position.y-y) < footprint; };
  const mount=mountedAt(position,mounts);
  const containsRect=(outer:{x:number;y:number;width:number;height:number},inner:{x:number;y:number;width:number;height:number})=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
  // A shared hardpoint can straddle the seam between connected wall cells.
  // Any obstacle carrying a hardpoint is part of the supporting wall cap.
  const supportsMount=(rect:{x:number;y:number;width:number;height:number})=>mount&&mounts.some(candidate=>containsRect(rect,candidate));
  if (map.obstacles.some(rect=>!supportsMount(rect)&&circleRect(rect))) return false;
  if (Math.hypot(position.x-map.goal.x,position.y-map.goal.y) < footprint+map.goalRadius) return false;
  return towers.every(tower=>{
    const otherMount=mountedAt(tower,mounts);
    const minimum=mount&&otherMount?WALL_MOUNT_SPACING:footprint+1.25;
    return Math.hypot(position.x-tower.x,position.y-tower.y)>=minimum;
  });
}
