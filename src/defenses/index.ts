import {validateEditorMap} from '../editor/index.ts';
import type {Rect,Tower,WorldMap} from '../contracts/index.ts';

export const WALL_COST=60, WALL_REFUND=30, WIRE_COST=45, WIRE_REFUND=22;

const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const coversTower=(rect:Rect,tower:Tower)=>{
  const x=Math.max(rect.x,Math.min(tower.x,rect.x+rect.width));
  const y=Math.max(rect.y,Math.min(tower.y,rect.y+rect.height));
  return Math.hypot(tower.x-x,tower.y-y)<1.25;
};

/** One authoritative placement check shared by previews and clicks. */
export function defensePlacementIssue(map:WorldMap,towers:readonly Tower[],segment:Rect,metal:number,cost:number):string|undefined {
  if(map.obstacles.some(obstacle=>overlaps(obstacle,segment)))return 'That cell is already occupied.';
  if(towers.some(tower=>coversTower(segment,tower)))return 'Defenses cannot overlap a deployed tower.';
  const mapIssue=validateEditorMap({...map,obstacles:[...map.obstacles,segment]});
  if(mapIssue)return mapIssue;
  if(metal<cost)return `Requires ${cost} Metal.`;
  return undefined;
}
