import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation} from '../navigation/index.ts';
import type {Rect, Vec2, WorldMap} from '../contracts/index.ts';

const GRID=4, SAVE_KEY='pressure-front.customlevel.v1';
const clone=(map:WorldMap):WorldMap=>({...map,spawn:{...map.spawn},goal:{...map.goal},obstacles:map.obstacles.map(rect=>({...rect}))});
const intersects=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const bossLane=(rect:Rect)=>rect.y<52.5&&rect.y+rect.height>47.5;

export function validateEditorMap(map:WorldMap):string|undefined {
  if (map.width!==160||map.height!==100||map.obstacles.length>64) return 'Maps must be 160 × 100 with at most 64 walls.';
  for(const wall of map.obstacles) {
    if (!Number.isFinite(wall.x)||!Number.isFinite(wall.y)||wall.width!==GRID||wall.height!==GRID||wall.x<0||wall.y<0||wall.x+GRID>160||wall.y+GRID>100) return 'Walls must be 4 × 4 grid cells inside the map.';
    if(intersects(wall,map.spawn)||Math.hypot(wall.x+2-map.goal.x,wall.y+2-map.goal.y)<map.goalRadius+2.5) return 'Walls cannot cover the spawn or goal.';
    if(bossLane(wall)) return 'The y=50 boss corridor must remain clear.';
  }
  const field=buildNavigation(map), x=Math.floor((map.spawn.x+map.spawn.width/2)/field.cellSize), y=Math.floor((map.spawn.y+map.spawn.height/2)/field.cellSize);
  return Number.isFinite(field.distances[y*field.width+x]) ? undefined : 'Walls must leave a route from spawn to goal.';
}

export function createLevelEditor(mount:HTMLElement, initial:WorldMap, onApply:(map:WorldMap)=>void, onActive:(active:boolean)=>void) {
  let map=clone(initial), active=false, erase=false;
  const root=document.createElement('section'); root.className='level-editor'; root.style.cssText='position:fixed;top:12px;right:12px;z-index:20;font:12px system-ui';
  const toggle=document.createElement('button'); toggle.textContent='LEVEL EDITOR';
  const panel=document.createElement('div'); panel.className='level-editor-panel'; panel.style.cssText='display:grid;gap:6px;width:190px;margin-top:6px;padding:10px;background:#101827;color:#e8f2ff;border:1px solid #4d6d8f;border-radius:8px';
  const status=document.createElement('p');
  const button=(label:string, handler:()=>void)=>{const element=document.createElement('button');element.textContent=label;element.style.cssText='padding:6px 8px;background:#1d3754;color:#fff;border:1px solid #6095c5;border-radius:4px;cursor:pointer';element.onclick=handler;panel.append(element);return element;};
  const setActive=(next:boolean)=>{active=next;panel.hidden=!next;onActive(next);};
  const note=(message:string)=>{status.textContent=message;};
  toggle.onclick=()=>setActive(!active);
  panel.append(Object.assign(document.createElement('strong'),{textContent:'Walls snap to 4 × 4 cells'}));
  button('Wall tool',()=>{erase=false;note('Wall tool active. Boss lane at y=50 stays clear.');});
  button('Erase tool',()=>{erase=true;note('Erase tool active.');});
  button('Clear walls',()=>{map={...map,id:'custom-level',obstacles:[]};note('Walls cleared.');});
  button('Reset default',()=>{map=clone(DEFAULT_MAP);note('Default map restored.');});
  button('Save level',()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(map));note('Saved locally.');}catch{note('Could not save this level.');}});
  button('Load level',()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw new Error();const candidate=JSON.parse(raw) as WorldMap;const issue=validateEditorMap(candidate);if(issue)throw new Error(issue);map=clone(candidate);note('Loaded local level.');}catch(error){note(error instanceof Error&&error.message?error.message:'No valid saved level.');}});
  button('Apply & Play',()=>{const issue=validateEditorMap(map);if(issue){note(issue);return;}onApply(clone(map));setActive(false);});
  button('Cancel',()=>{map=clone(initial);setActive(false);}); panel.append(status); root.append(toggle,panel); mount.append(root); panel.hidden=true;
  return {
    get active(){return active;}, get map(){return clone(map);},
    paint(point:Vec2, requestedErase=erase) {
      const x=Math.floor(point.x/GRID)*GRID,y=Math.floor(point.y/GRID)*GRID, wall={x,y,width:GRID,height:GRID};
      if(x<0||y<0||x+GRID>160||y+GRID>100)return;
      const index=map.obstacles.findIndex(existing=>existing.x===x&&existing.y===y);
      if(requestedErase){if(index>=0)map.obstacles.splice(index,1);return;}
      if(index>=0||map.obstacles.length>=64)return;
      const candidate=clone(map);candidate.obstacles.push(wall);const issue=validateEditorMap(candidate);
      if(issue){note(issue);return;}map={...candidate,id:'custom-level'};
    },
    destroy(){root.remove(); if(active)onActive(false);},
  };
}
