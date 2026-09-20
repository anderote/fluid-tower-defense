import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation} from '../navigation/index.ts';
import type {Rect, Vec2, WorldMap} from '../contracts/index.ts';

const GRID=4, SAVE_KEY='pressure-front.customlevel.v1';
const clone=(map:WorldMap):WorldMap=>({...map,spawn:{...map.spawn},goal:{...map.goal},obstacles:map.obstacles.map(rect=>({...rect}))});
function customId(map:WorldMap):string {
  let hash=2166136261;
  for (const wall of [...map.obstacles].sort((a,b)=>a.x-b.x||a.y-b.y)) for (const value of [wall.x,wall.y,wall.width,wall.height]) { hash^=Math.round(value*100);hash=Math.imul(hash,16777619); }
  return `custom-${(hash>>>0).toString(36)}`;
}

export function validateEditorMap(map:WorldMap):string|undefined {
  if (map.width!==160||map.height!==100||map.obstacles.length>64) return 'Maps must be 160 × 100 with at most 64 walls.';
  for(const wall of map.obstacles) {
    if (!Number.isFinite(wall.x)||!Number.isFinite(wall.y)||!Number.isFinite(wall.width)||!Number.isFinite(wall.height)||wall.width<=0||wall.height<=0||wall.x<0||wall.y<0||wall.x+wall.width>160||wall.y+wall.height>100) return 'Walls must stay inside the map.';
    if(Math.hypot(wall.x+wall.width/2-map.goal.x,wall.y+wall.height/2-map.goal.y)<map.goalRadius+Math.hypot(wall.width,wall.height)/2) return 'Walls cannot cover the goal.';
  }
  const field=buildNavigation(map), minX=Math.floor(map.spawn.x/field.cellSize),maxX=Math.ceil((map.spawn.x+map.spawn.width)/field.cellSize),minY=Math.floor(map.spawn.y/field.cellSize),maxY=Math.ceil((map.spawn.y+map.spawn.height)/field.cellSize);
  for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)if(Number.isFinite(field.distances[y*field.width+x]))return undefined;
  return 'Walls must leave a route from the spawn area to the goal.';
}

export function createLevelEditor(mount:HTMLElement, initial:WorldMap, onApply:(map:WorldMap)=>void, onActive:(active:boolean)=>void) {
  let applied=clone(initial), map=clone(initial), active=false, erase=false;
  const root=document.createElement('section'); root.className='level-editor'; root.style.cssText='position:relative;z-index:20;font:12px system-ui';
  const toggle=document.createElement('button'); toggle.textContent='LEVEL EDITOR';
  const panel=document.createElement('div'); panel.className='level-editor-panel'; panel.style.cssText='position:absolute;right:0;top:100%;display:grid;gap:6px;width:210px;margin-top:6px;padding:10px;background:#101827;color:#e8f2ff;border:1px solid #4d6d8f;border-radius:8px';
  const status=document.createElement('p');
  const button=(label:string, handler:()=>void)=>{const element=document.createElement('button');element.textContent=label;element.style.cssText='padding:6px 8px;background:#1d3754;color:#fff;border:1px solid #6095c5;border-radius:4px;cursor:pointer';element.onclick=handler;panel.append(element);return element;};
  const setActive=(next:boolean)=>{if(next)map=clone(applied);active=next;panel.hidden=!next;panel.style.display=next?'grid':'none';onActive(next);};
  const note=(message:string)=>{status.textContent=message;};
  toggle.onclick=()=>setActive(!active);
  panel.append(Object.assign(document.createElement('strong'),{textContent:'Walls snap to 4 × 4 cells'}));
  button('Wall tool',()=>{erase=false;note('Wall tool active. Keep at least one route from spawn to goal.');});
  button('Erase tool',()=>{erase=true;note('Erase tool active.');});
  button('Clear walls',()=>{const next={...map,obstacles:[]};map={...next,id:customId(next)};note('Walls cleared.');});
  button('Reset default',()=>{map=clone(DEFAULT_MAP);note('Default map restored.');});
  button('Save level',()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(map));note('Saved locally.');}catch{note('Could not save this level.');}});
  button('Load level',()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw new Error();const candidate=JSON.parse(raw) as WorldMap;const issue=validateEditorMap(candidate);if(issue)throw new Error(issue);map=clone(candidate);note('Loaded local level.');}catch(error){note(error instanceof Error&&error.message?error.message:'No valid saved level.');}});
  button('Apply & Play',()=>{const issue=validateEditorMap(map);if(issue){note(issue);return;}applied=clone(map);onApply(clone(map));setActive(false);});
  button('Cancel',()=>{map=clone(applied);setActive(false);}); panel.append(status); root.append(toggle,panel); mount.append(root); panel.hidden=true; panel.style.display='none';
  return {
    get active(){return active;}, get map(){return clone(map);},
    paint(point:Vec2, requestedErase=erase) {
      const x=Math.floor(point.x/GRID)*GRID,y=Math.floor(point.y/GRID)*GRID, wall={x,y,width:GRID,height:GRID};
      if(x<0||y<0||x+GRID>160||y+GRID>100)return;
      const index=map.obstacles.findIndex(existing=>x>=existing.x&&x<existing.x+existing.width&&y>=existing.y&&y<existing.y+existing.height);
      if(requestedErase){if(index>=0){map.obstacles.splice(index,1);map.id=customId(map);}return;}
      if(index>=0||map.obstacles.length>=64)return;
      const candidate=clone(map);candidate.obstacles.push(wall);const issue=validateEditorMap(candidate);
      if(issue){note(issue);return;}map={...candidate,id:customId(candidate)};
    },
    destroy(){root.remove(); if(active)onActive(false);},
  };
}
