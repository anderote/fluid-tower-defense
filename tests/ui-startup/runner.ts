import {createUI} from '../../src/ui/index.ts';
import type {GameAction} from '../../src/contracts/index.ts';

// Exercise real DOM hierarchy rules without requiring WebGPU or touching saves.
const result=document.querySelector<HTMLElement>('#result')!;
const root=document.querySelector<HTMLElement>('#game')!;
const actions:GameAction[]=[];
try {
  createUI(root,action=>actions.push(action));
  const controls=root.querySelectorAll<HTMLButtonElement>('.selected-popup .tower-actions > button');
  if(controls.length!==4||controls[0].dataset.action!=='move'||controls[1].dataset.action!=='set-ground-target'||controls[2].dataset.action!=='clear-ground-target'||controls[3].dataset.action!=='sell') {
    throw new Error('Tower inspector must retain move, targeting, and sell controls');
  }
  controls.forEach(control=>control.click());
  if(actions.map(action=>action.type).join(',')!=='move,set-ground-target,clear-ground-target,sell') {
    throw new Error('Tower controls did not dispatch their actions');
  }
  if(!root.querySelector('canvas')||!root.querySelector('aside > [data-action="start-wave"]')) {
    throw new Error('Game canvas or wave control was not initialized');
  }
  const dock=root.querySelector<HTMLElement>('aside')!,toggle=dock.querySelector<HTMLButtonElement>('.window-toggle')!,handle=dock.querySelector<HTMLButtonElement>('.window-handle')!;
  toggle.click();if(!dock.classList.contains('window-collapsed'))throw Error('Build menu must minimize');
  toggle.click();if(dock.classList.contains('window-collapsed'))throw Error('Build menu must expand');
  handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  if(dock.dataset.windowMoved!=='true'||dock.style.position!=='fixed')throw Error('Window must retain its moved position');
  const rect=dock.getBoundingClientRect();if(rect.left<0||rect.top<0)throw Error('Moved window must remain onscreen');
  result.textContent='PASS: UI initializes with working move, targeting, and sell controls';
} catch(error) {
  result.textContent=`FAIL: ${String(error)}`;
  throw error;
}
