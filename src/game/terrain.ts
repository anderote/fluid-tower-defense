import {inGateFootprint,DAM_ID,DAM_GATES,sameRect} from '../content/dam.ts';
import type {Rect, Tower, Vec2, WorldMap} from '../contracts/index.ts';
import {validateEditorMap} from '../editor/index.ts';

export function clearPlayerTerrain(map:WorldMap,walls:readonly Rect[],wires:readonly Rect[],fences:readonly Rect[]=[]):WorldMap {
  const playerStructures=[...walls,...wires,...fences];
  const sameRect=(left:Rect,right:Rect)=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;
  return {...map,obstacles:map.obstacles.filter(obstacle=>!playerStructures.some(structure=>sameRect(obstacle,structure)))};
}

/** Keep saved player structures while rebasing default-map sessions onto current authored terrain. */
export function restoreSessionTerrain(
  savedMap:WorldMap,
  authoredMap:WorldMap,
  walls:readonly Rect[],
  wires:readonly (Rect & Partial<{breached:boolean}>)[],
  fences:readonly Rect[]=[],
):WorldMap {
  const base=savedMap.id===authoredMap.id?authoredMap:clearPlayerTerrain(savedMap,walls,wires,fences);
  // Wire is a damaging ground hazard, not solid terrain.  Older saves can
  // contain it in `obstacles`, but restored sessions deliberately keep only
  // walls and chain-link fences in the collision/navigation map.
  return {...base,obstacles:[...base.obstacles,...walls,...fences]};
}

/**
 * Give every wall cell one stable cap hardpoint. Every connected seam adds
 * an additional hardpoint, yielding evenly spaced mounts along a wall run.
 * Seam placement follows the component's main axis so vertical walls mount turrets
 * down their centreline instead of squeezing them side by side.
 */
export function wallMountCells(walls:readonly Rect[],size=4):Rect[] {
  if(!Number.isFinite(size)||size<=0)return [];
  const cells=new Map<string,{x:number;y:number}>();
  for(const wall of walls){
    const columns=Math.floor(wall.width/size),rows=Math.floor(wall.height/size);
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const x=wall.x+column*size,y=wall.y+row*size;
      cells.set(`${x}:${y}`,{x,y});
    }
  }
  const mounts:Rect[]=[],visited=new Set<string>(),point=(x:number,y:number)=>mounts.push({x:x-.01,y:y-.01,width:.02,height:.02});
  for(const [key,start] of cells){
    if(visited.has(key))continue;
    const component:{x:number;y:number}[]=[],queue=[start];visited.add(key);
    while(queue.length){
      const cell=queue.pop()!;component.push(cell);
      for(const [dx,dy] of [[size,0],[-size,0],[0,size],[0,-size]]){
        const nextKey=`${cell.x+dx}:${cell.y+dy}`,next=cells.get(nextKey);
        if(next&&!visited.has(nextKey)){visited.add(nextKey);queue.push(next);}
      }
    }
    const minX=Math.min(...component.map(cell=>cell.x)),maxX=Math.max(...component.map(cell=>cell.x));
    const minY=Math.min(...component.map(cell=>cell.y)),maxY=Math.max(...component.map(cell=>cell.y));
    const vertical=maxY-minY>maxX-minX;
    const ordered=[...component].sort((a,b)=>vertical?a.x-b.x||a.y-b.y:a.y-b.y||a.x-b.x);
    // The base mount never moves when a neighbor is added or removed.
    for(const cell of ordered)point(cell.x+size/2,cell.y+size*.3375);
    if(component.length<2)continue;
    for(const cell of ordered){
      const next=vertical?cells.get(`${cell.x}:${cell.y+size}`):cells.get(`${cell.x+size}:${cell.y}`);
      if(!next)continue;
      if(!component.includes(next))continue;
      point(vertical?cell.x+size/2:cell.x+size,vertical?cell.y+size*.8375:cell.y+size*.3375);
    }
  }
  return mounts;
}

/** Scenery is solid, but trees, houses and cliffs are not turret foundations. */
export function terrainMounts(map:WorldMap):Rect[]{
  if(map.id===DAM_ID)return (map.scenery?.mounts??[]).flatMap(rect=>{const mounts:Rect[]=[];for(let y=rect.y;y+4<=rect.y+rect.height;y+=4)for(let x=rect.x;x+4<=rect.x+rect.width;x+=4)mounts.push({x,y,width:4,height:4});return mounts;});
  const natural=map.scenery?.solids??[];
  return wallMountCells(map.obstacles.filter(rect=>!(map.id===DAM_ID&&DAM_GATES.some(g=>sameRect(g,rect)))&&!natural.some(other=>rect.x===other.x&&rect.y===other.y&&rect.width===other.width&&rect.height===other.height)));
}

export function snapToMount(point:Vec2,mounts:readonly Rect[]):Vec2 {
  const wall=mounts.map(rect=>({rect,distance:Math.hypot(point.x-rect.x-rect.width/2,point.y-rect.y-rect.height/2)})).filter(candidate=>candidate.distance<=1.4).sort((left,right)=>left.distance-right.distance)[0]?.rect;
  return wall?{x:wall.x+wall.width/2,y:wall.y+wall.height/2}:point;
}

export function structurePlacementIssue(map:WorldMap,towers:readonly Tower[],rect:Rect):string|undefined {
  if(inGateFootprint(map,rect))return 'Keep floodgate machinery clear.';
  if(map.obstacles.some(other=>rect.x<other.x+other.width&&rect.x+rect.width>other.x&&rect.y<other.y+other.height&&rect.y+rect.height>other.y))return 'That ground already contains a wall or wire.';
  if(towers.some(tower=>tower.kind==='crusher'&&rect.x<tower.x+4&&rect.x+rect.width>tower.x-4&&rect.y<tower.y+6&&rect.y+rect.height>tower.y-6))return 'Keep the crusher jaws and passage clear.';
  if(towers.some(tower=>Math.hypot(tower.x-Math.max(rect.x,Math.min(tower.x,rect.x+rect.width)),tower.y-Math.max(rect.y,Math.min(tower.y,rect.y+rect.height)))<1.25))return 'Place structures clear of deployed towers.';
  return validateEditorMap({...map,obstacles:[...map.obstacles,rect]});
}

/** Cache only the last preview; geometry changes invalidate it even after in-place edits. */
export function createStructurePreview(){
  let previousKey:string|undefined,previousIssue:string|undefined;
  return (map:WorldMap,towers:readonly Tower[],rect:Rect):string|undefined=>{
    const geometry=(r:Rect)=>[r.x,r.y,r.width,r.height];
    const key=JSON.stringify([map.id,map.width,map.height,geometry(map.spawn),map.goal,map.goalRadius,map.obstacles.map(geometry),towers.map(t=>[t.x,t.y,t.kind]),geometry(rect)]);
    if(key!==previousKey){previousIssue=structurePlacementIssue(map,towers,rect);previousKey=key;}
    return previousIssue;
  };
}

/** Fences remain movement obstacles but do not provide cover against weapons. */
export function firingObstacles(obstacles:readonly Rect[],fences:readonly Rect[]):Rect[]{
  return obstacles.filter(obstacle=>!fences.some(fence=>sameRect(obstacle,fence)));
}
