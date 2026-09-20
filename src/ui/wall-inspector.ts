import type {Rect,SharedGPU} from '../contracts/index.ts';
import {wallKey} from '../effects/blood-surfaces.ts';
import {makeGameWindow} from './windows.ts';
export function createWallInspector(root:HTMLElement,device:GPUDevice,shared:SharedGPU){
 const panel=document.createElement('section');panel.className='infantry-panel infantry-inspector';panel.hidden=true;
 panel.innerHTML='<b>METAL WALL</b><p class="wall-health"></p><p>CRUSH ASSISTS · <strong class="wall-assists">0</strong></p><small>Nearest contacted wall per pressure death. Current battlefield only; visual stains persist until the battlefield resets.</small>';
 root.querySelector('.arena')!.append(panel);let selected:(Rect&{health:number;maxHealth:number})|undefined,last=0,busy=false,version=0;
 const controls=makeGameWindow(panel,'WALL INSPECTOR',()=>{selected=undefined;panel.hidden=true;version++;});
 const staging=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 return {select(wall:typeof selected){selected=wall;version++;panel.hidden=!wall;if(wall){panel.querySelector('.wall-assists')!.textContent='…';controls.expand();last=0;}},
 update(now:number,walls:readonly Rect[]){
  if(!selected)return;if(!walls.includes(selected)){selected=undefined;panel.hidden=true;version++;return;}
  panel.querySelector('.wall-health')!.textContent='INTEGRITY · '+Math.round(selected.health/selected.maxHealth*100)+'%';
  const slot=shared.bloodWallSlots?.get(wallKey(selected));if(slot===undefined||!shared.bloodWalls||busy||now-last<500)return;
  last=now;busy=true;const token=version,e=device.createCommandEncoder();e.copyBufferToBuffer(shared.bloodWalls,16+slot*64+16,staging,0,16);device.queue.submit([e.finish()]);
  void staging.mapAsync(GPUMapMode.READ).then(()=>{const sum=new Uint32Array(staging.getMappedRange()).reduce((a,b)=>a+b,0);if(token===version)panel.querySelector('.wall-assists')!.textContent=sum.toLocaleString();staging.unmap();}).catch(()=>{}).finally(()=>{busy=false;});
 }};
}
