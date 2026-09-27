import {inGateFootprint} from '../content/dam.ts';
import {MAX_BODY_RADIUS} from '../sim/physics/model.ts';
import {type NavigationField, type Tower, type Vec2, type WorldMap} from '../contracts/index.ts';

const CELL_SIZE = 1;
/** Turret placement and collision use the same 2.5-unit square footprint. */
export const TURRET_OBSTACLE_SIZE = 2.5;
let version = 0;
const inside = (map:WorldMap,x:number,y:number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
const blocked = (map:WorldMap,x:number,y:number) => map.obstacles.some(rect => x >= rect.x && x < rect.x+rect.width && y >= rect.y && y < rect.y+rect.height);

/** Converts deployed turret centers into solid navigation and physics obstacles. */
export function turretObstacles(towers:readonly (Pick<Tower,'x'|'y'>&Partial<Pick<Tower,'kind'>>)[]): {x:number;y:number;width:number;height:number}[] {
  return towers.flatMap(tower=>tower.kind==='crusher'?[{x:tower.x-4,y:tower.y-6,width:8,height:1},{x:tower.x-4,y:tower.y+5,width:8,height:1}]:[{x:tower.x-TURRET_OBSTACLE_SIZE/2,y:tower.y-TURRET_OBSTACLE_SIZE/2,width:TURRET_OBSTACLE_SIZE,height:TURRET_OBSTACLE_SIZE}]);
}

/** Keeps authored terrain separate while exposing every deployed turret as a solid. */
export function mapWithTurretObstacles(map:WorldMap,towers:readonly (Pick<Tower,'x'|'y'>&Partial<Pick<Tower,'kind'>>)[]):WorldMap {
  return {...map,obstacles:[...map.obstacles,...turretObstacles(towers)]};
}

/** True when at least one spawn cell can reach the goal in the supplied field. */
export function hasSpawnRoute(map:WorldMap):boolean {
  const field=buildNavigation(map),entries=map.entries??[{side:'west' as const,from:map.spawn.y,to:map.spawn.y+map.spawn.height}];
  return entries.some(entry=>{
    const from=Math.max(0,Math.floor(entry.from/field.cellSize)),to=Math.min(entry.side==='west'||entry.side==='east'?field.height:field.width,Math.ceil(entry.to/field.cellSize));
    for(let point=from;point<to;point++){
      const x=entry.side==='west'?0:entry.side==='east'?field.width-1:point;
      const y=entry.side==='north'?0:entry.side==='south'?field.height-1:point;
      if(Number.isFinite(field.distances[y*field.width+x]))return true;
    }
    return false;
  });
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
export function buildNavigation(map: WorldMap, clearance=MAX_BODY_RADIUS): NavigationField {
  const width=Math.ceil(map.width/CELL_SIZE), height=Math.ceil(map.height/CELL_SIZE), size=width*height;
  const distances=new Float32Array(size); distances.fill(Infinity);
  const vectors=new Float32Array(size*2);
  const alternateVectors=new Float32Array(size*2);
  const index=(x:number,y:number)=>y*width+x;
  // Match swept-body collision: a route must have room for the whole zombie.
  const solid=new Uint8Array(size);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const px=(x+.5)*CELL_SIZE,py=(y+.5)*CELL_SIZE;
    solid[index(x,y)]=Number(clearance===0?blocked(map,x*CELL_SIZE,y*CELL_SIZE):map.obstacles.some(r=>px>r.x-clearance&&px<r.x+r.width+clearance&&py>r.y-clearance&&py<r.y+r.height+clearance));
  }
  const goalX=Math.min(width-1,Math.max(0,Math.floor(map.goal.x/CELL_SIZE))), goalY=Math.min(height-1,Math.max(0,Math.floor(map.goal.y/CELL_SIZE)));
  const queueX=new Int32Array(size), queueY=new Int32Array(size); let head=0,tail=0;
  if (!solid[index(goalX,goalY)]) { distances[index(goalX,goalY)]=0; queueX[tail]=goalX;queueY[tail++]=goalY; }
  const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
  while(head<tail) {
    const x=queueX[head],y=queueY[head++],distance=distances[index(x,y)];
    for(const [dx,dy] of directions) { const nx=x+dx,ny=y+dy,at=index(nx,ny); if(inside(map,nx*CELL_SIZE,ny*CELL_SIZE) && !solid[at] && distances[at] === Infinity) { distances[at]=distance+1;queueX[tail]=nx;queueY[tail++]=ny; } }
  }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const at=index(x,y), current=distances[at]; if(!Number.isFinite(current) || current===0) continue;
    let best=current,bx=x,by=y,alternateX=x,alternateY=y;
    for(const [dx,dy] of directions) { const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=width||ny>=height)continue;const candidate=distances[index(nx,ny)];if(candidate<best){best=candidate;bx=nx;by=ny;alternateX=x;alternateY=y;}else if(candidate===best&&candidate<current){alternateX=nx;alternateY=ny;} }
    const length=Math.hypot(bx-x,by-y); vectors[at*2]=(bx-x)/length;vectors[at*2+1]=(by-y)/length;
    if(alternateX!==x||alternateY!==y){const alternateLength=Math.hypot(alternateX-x,alternateY-y);alternateVectors[at*2]=(alternateX-x)/alternateLength;alternateVectors[at*2+1]=(alternateY-y)/alternateLength;}
  }
  // Pressure and knockback can push bodies into the clearance band. Guide them
  // back to reachable ground instead of falling back to a line through a wall.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=index(x,y);if(Number.isFinite(distances[at]))continue;
    let nearest=Infinity,bx=x,by=y;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height||!Number.isFinite(distances[index(nx,ny)]))continue;
      const distance=dx*dx+dy*dy;
      if(distance<nearest){nearest=distance;bx=nx;by=ny;}
    }
    if(Number.isFinite(nearest)){const length=Math.hypot(bx-x,by-y);vectors[at*2]=(bx-x)/length;vectors[at*2+1]=(by-y)/length;}
  }
  return {width,height,cellSize:CELL_SIZE,vectors,alternateVectors,distances,version:++version};
}

/** Checks a circular emplacement footprint, allowing compact wall-cap hardpoints. */
export function canPlace(map: WorldMap, towers: readonly Tower[], position: Vec2 & {kind?:Tower['kind']}, footprint: number, mounts:readonly {x:number;y:number;width:number;height:number}[]=[]): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(footprint) || footprint <= 0) return false;
  if (position.x-footprint<0 || position.y-footprint<0 || position.x+footprint>map.width || position.y+footprint>map.height) return false;
  const overlaps=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const reserved=towers.filter(t=>t.kind==='crusher').map(t=>({x:t.x-4,y:t.y-6,width:8,height:12}));
  const area=position.kind==='crusher'?{x:position.x-4,y:position.y-6,width:8,height:12}:{x:position.x-footprint,y:position.y-footprint,width:footprint*2,height:footprint*2};
  if(inGateFootprint(map,area)||reserved.some(rect=>overlaps(rect,area)))return false;
  if(position.kind==='crusher')return area.x>=0&&area.y>=0&&area.x+area.width<=map.width&&area.y+area.height<=map.height&&!map.obstacles.some(rect=>overlaps(rect,area))&&!turretObstacles(towers).some(rect=>overlaps(rect,area))&&Math.hypot(position.x-map.goal.x,position.y-map.goal.y)>8+map.goalRadius;
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

/** New-placement guidance only: old saves may contain gates facing a dead end. */
export function crusherPassageIssue(map:WorldMap,towers:readonly Tower[],position:Vec2):string|undefined {
  const obstacles=[...map.obstacles,...turretObstacles(towers)];
  // Each mouth needs a body-wide straight approach extending three units past
  // the jaws. Sample across the opening so partially obstructed mouths work.
  for(const side of [-1,1]){
    const left=side<0?position.x-7:position.x+4;
    let clear=false;
    for(let offset=-4;offset<=4;offset+=.5){
      const y=position.y+offset,r=MAX_BODY_RADIUS;
      if(left-r<0||left+3+r>map.width||y-r<0||y+r>map.height)continue;
      if(!obstacles.some(o=>left-r<o.x+o.width&&left+3+r>o.x&&y-r<o.y+o.height&&y+r>o.y)){clear=true;break;}
    }
    if(!clear)return 'Crusher gates open left and right. Leave a clear approach on both sides; this mouth faces a wall.';
  }
}
