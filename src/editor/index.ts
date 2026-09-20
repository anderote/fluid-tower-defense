import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation} from '../navigation/index.ts';
import type {Rect, Vec2, WorldMap} from '../contracts/index.ts';

const GRID=4, SAVE_KEY='pressure-front.customlevel.v1';
const clone=(map:WorldMap):WorldMap=>({...map,spawn:{...map.spawn},goal:{...map.goal},obstacles:map.obstacles.map(rect=>({...rect}))});
export const wallAtPoint=(map:WorldMap,point:Vec2):Rect=>({
  x:Math.max(0,Math.min(map.width-GRID,Math.floor(point.x/GRID)*GRID)),
  y:Math.max(0,Math.min(map.height-GRID,Math.floor(point.y/GRID)*GRID)),
  width:GRID,height:GRID,
});
function customId(map:WorldMap):string {
  let hash=2166136261;
  for (const wall of [...map.obstacles].sort((a,b)=>a.x-b.x||a.y-b.y)) for (const value of [wall.x,wall.y,wall.width,wall.height]) { hash^=Math.round(value*100);hash=Math.imul(hash,16777619); }
  return `custom-${(hash>>>0).toString(36)}`;
}

export function validateEditorMap(map:WorldMap):string|undefined {
  if(!Number.isFinite(map.width)||!Number.isFinite(map.height)||map.width<GRID||map.height<GRID) return `Maps must be at least ${GRID} × ${GRID}.`;
  for(const wall of map.obstacles) {
    if (!Number.isFinite(wall.x)||!Number.isFinite(wall.y)||!Number.isFinite(wall.width)||!Number.isFinite(wall.height)||wall.width<=0||wall.height<=0||wall.x<0||wall.y<0||wall.x+wall.width>map.width||wall.y+wall.height>map.height) return 'Walls must stay inside the map.';
    if(Math.hypot(wall.x+wall.width/2-map.goal.x,wall.y+wall.height/2-map.goal.y)<map.goalRadius+Math.hypot(wall.width,wall.height)/2) return 'Walls cannot cover the goal.';
  }
  const field=buildNavigation(map), minX=Math.floor(map.spawn.x/field.cellSize),maxX=Math.ceil((map.spawn.x+map.spawn.width)/field.cellSize),minY=Math.floor(map.spawn.y/field.cellSize),maxY=Math.ceil((map.spawn.y+map.spawn.height)/field.cellSize);
  for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)if(Number.isFinite(field.distances[y*field.width+x]))return undefined;
  return 'Walls must leave a route from the spawn area to the goal.';
}

export function createLevelEditor(mount:HTMLElement, initial:WorldMap, onApply:(map:WorldMap)=>void, onActive:(active:boolean)=>void) {
  let applied=clone(initial), map=clone(initial), active=false, erase=false;
  const root=document.createElement('section'); root.className='level-editor';
  const toggle=document.createElement('button'); toggle.textContent='LEVEL EDITOR';
  const panel=document.createElement('div'); panel.className='level-editor-panel';
  const status=document.createElement('p');
  const button=(label:string, handler:()=>void)=>{const element=document.createElement('button');element.textContent=label;element.onclick=handler;panel.append(element);return element;};
  const setActive=(next:boolean)=>{if(next)map=clone(applied);active=next;panel.hidden=!next;panel.style.display=next?'grid':'none';onActive(next);};
  const note=(message:string)=>{status.textContent=message;};
  toggle.onclick=()=>setActive(!active);
  const mapSize=document.createElement('div');mapSize.className='map-size';
  const width=document.createElement('input'),height=document.createElement('input');
  for(const input of [width,height]){input.type='number';input.min=String(GRID);input.step=String(GRID);input.inputMode='numeric';}
  const syncSize=()=>{width.value=String(map.width);height.value=String(map.height);};syncSize();
  mapSize.append('MAP ',width,' × ',height);panel.append(mapSize);
  button('Resize map',()=>{const nextWidth=Math.floor(Number(width.value)/GRID)*GRID,nextHeight=Math.floor(Number(height.value)/GRID)*GRID;if(!Number.isFinite(nextWidth)||!Number.isFinite(nextHeight)||nextWidth<GRID||nextHeight<GRID){note(`Use whole ${GRID}-cell dimensions.`);return;}if(map.obstacles.some(wall=>wall.x+wall.width>nextWidth||wall.y+wall.height>nextHeight)||map.spawn.x+map.spawn.width>nextWidth||map.spawn.y+map.spawn.height>nextHeight){note('Resize would cut off existing walls or the spawn area. Remove them first.');return;}map={...map,width:nextWidth,height:nextHeight,goal:{x:Math.min(map.goal.x,nextWidth),y:Math.min(map.goal.y,nextHeight)}};map.id=customId(map);syncSize();note(`Map resized to ${nextWidth} × ${nextHeight}.`);});
  panel.append(Object.assign(document.createElement('strong'),{textContent:'Walls snap to 4 × 4 cells — no wall limit'}));
  button('Wall tool',()=>{erase=false;note('Wall tool active. Keep at least one route from spawn to goal.');});
  button('Erase tool',()=>{erase=true;note('Erase tool active.');});
  button('Clear walls',()=>{const next={...map,obstacles:[]};map={...next,id:customId(next)};note('Walls cleared.');});
  button('Reset default',()=>{map=clone(DEFAULT_MAP);syncSize();note('Default map restored.');});
  button('Save level',()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(map));note('Saved locally.');}catch{note('Could not save this level.');}});
  button('Load level',()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw new Error();const candidate=JSON.parse(raw) as WorldMap;const issue=validateEditorMap(candidate);if(issue)throw new Error(issue);map=clone(candidate);note('Loaded local level.');}catch(error){note(error instanceof Error&&error.message?error.message:'No valid saved level.');}});
  button('Apply & Play',()=>{const issue=validateEditorMap(map);if(issue){note(issue);return;}applied=clone(map);onApply(clone(map));setActive(false);});
  button('Cancel',()=>{map=clone(applied);setActive(false);}); panel.append(status); root.append(toggle,panel); mount.append(root); panel.hidden=true; panel.style.display='none';
  return {
    setMap(next:WorldMap){applied=clone(next);map=clone(next);},
    get active(){return active;}, get map(){return clone(map);},
    resetToDefault(){applied=clone(DEFAULT_MAP);map=clone(DEFAULT_MAP);syncSize();erase=false;note('Default map restored.');},
    paint(point:Vec2, requestedErase=erase) {
      const wall=wallAtPoint(map,point),{x,y}=wall;
      const index=map.obstacles.findIndex(existing=>x>=existing.x&&x<existing.x+existing.width&&y>=existing.y&&y<existing.y+existing.height);
      if(requestedErase){if(index>=0){map.obstacles.splice(index,1);map.id=customId(map);}return;}
      if(index>=0)return;
      const candidate=clone(map);candidate.obstacles.push(wall);const issue=validateEditorMap(candidate);
      if(issue){note(issue);return;}map={...candidate,id:customId(candidate)};
    },
    destroy(){root.remove(); if(active)onActive(false);},
  };
}
