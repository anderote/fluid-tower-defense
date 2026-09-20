import type {Rect, Tower, Vec2, WorldMap} from '../contracts/index.ts';
import {validateEditorMap} from '../editor/index.ts';

export function clearPlayerTerrain(map:WorldMap,walls:readonly Rect[],wires:readonly Rect[]):WorldMap {
  const playerStructures=[...walls,...wires];
  const sameRect=(left:Rect,right:Rect)=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;
  return {...map,obstacles:map.obstacles.filter(obstacle=>!playerStructures.some(structure=>sameRect(obstacle,structure)))};
}

/** Keep saved player structures while rebasing default-map sessions onto current authored terrain. */
export function restoreSessionTerrain(
  savedMap:WorldMap,
  authoredMap:WorldMap,
  walls:readonly Rect[],
  wires:readonly (Rect & Partial<{breached:boolean}>)[],
):WorldMap {
  const base=savedMap.id===authoredMap.id?authoredMap:clearPlayerTerrain(savedMap,walls,wires);
  return {...base,obstacles:[...base.obstacles,...walls,...wires.filter(wire=>!wire.breached)]};
}

/** Split authored wall rectangles into the same 4 x 4 mounts used by built walls. */
export function wallMountCells(walls:readonly Rect[],size=4):Rect[] {
  if(!Number.isFinite(size)||size<=0)return [];
  const cells:Rect[]=[],seen=new Set<string>();
  for(const wall of walls){
    const columns=Math.floor(wall.width/size),rows=Math.floor(wall.height/size);
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const cell={x:wall.x+column*size,y:wall.y+row*size,width:size,height:size};
      const key=`${cell.x}:${cell.y}:${cell.width}:${cell.height}`;
      if(!seen.has(key)){seen.add(key);cells.push(cell);}
    }
  }
  return cells;
}

export function snapToMount(point:Vec2,mounts:readonly Rect[]):Vec2 {
  const wall=mounts.find(rect=>point.x>=rect.x&&point.x<rect.x+rect.width&&point.y>=rect.y&&point.y<rect.y+rect.height);
  return wall?{x:wall.x+wall.width/2,y:wall.y+wall.height/2}:point;
}

export function structurePlacementIssue(map:WorldMap,towers:readonly Tower[],rect:Rect):string|undefined {
  if(map.obstacles.some(other=>rect.x<other.x+other.width&&rect.x+rect.width>other.x&&rect.y<other.y+other.height&&rect.y+rect.height>other.y))return 'That ground already contains a wall or wire.';
  if(towers.some(tower=>Math.hypot(tower.x-Math.max(rect.x,Math.min(tower.x,rect.x+rect.width)),tower.y-Math.max(rect.y,Math.min(tower.y,rect.y+rect.height)))<1.25))return 'Place structures clear of deployed towers.';
  return validateEditorMap({...map,obstacles:[...map.obstacles,rect]});
}

/** Cache only the last preview; geometry changes invalidate it even after in-place edits. */
export function createStructurePreview(){
  let previousKey:string|undefined,previousIssue:string|undefined;
  return (map:WorldMap,towers:readonly Tower[],rect:Rect):string|undefined=>{
    const geometry=(r:Rect)=>[r.x,r.y,r.width,r.height];
    const key=JSON.stringify([map.id,map.width,map.height,geometry(map.spawn),map.goal,map.goalRadius,map.obstacles.map(geometry),towers.map(t=>[t.x,t.y]),geometry(rect)]);
    if(key!==previousKey){previousIssue=structurePlacementIssue(map,towers,rect);previousKey=key;}
    return previousIssue;
  };
}
