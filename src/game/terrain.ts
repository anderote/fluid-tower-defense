import type {Rect, Tower, Vec2, WorldMap} from '../contracts/index.ts';
import {validateEditorMap} from '../editor/index.ts';

export function clearPlayerTerrain(map:WorldMap,walls:readonly Rect[],wires:readonly Rect[]):WorldMap {
  const playerStructures=new Set([...walls,...wires]);
  return {...map,obstacles:map.obstacles.filter(obstacle=>!playerStructures.has(obstacle))};
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
