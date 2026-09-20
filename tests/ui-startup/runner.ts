import {createUI} from '../../src/ui/index.ts';
import type {GameAction} from '../../src/contracts/index.ts';

// Exercise real DOM hierarchy rules without requiring WebGPU or touching saves.
const result=document.querySelector<HTMLElement>('#result')!;
const root=document.querySelector<HTMLElement>('#game')!;
const actions:GameAction[]=[];
try {
  createUI(root,action=>actions.push(action));
  const controls=root.querySelectorAll<HTMLButtonElement>('.selected-popup .tower-actions > button');
  if(controls.length!==2||controls[0].dataset.action!=='move'||controls[1].dataset.action!=='sell') {
    throw new Error('Tower inspector must retain both move and sell controls');
  }
  controls.forEach(control=>control.click());
  if(actions.map(action=>action.type).join(',')!=='move,sell') {
    throw new Error('Tower controls did not dispatch their actions');
  }
  if(!root.querySelector('canvas')||!root.querySelector('aside > [data-action="start-wave"]')) {
    throw new Error('Game canvas or wave control was not initialized');
  }
  result.textContent='PASS: UI initializes with working move and sell controls';
} catch(error) {
  result.textContent=`FAIL: ${String(error)}`;
  throw error;
}
