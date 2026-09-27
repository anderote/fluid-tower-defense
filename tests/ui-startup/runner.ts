import {createUI} from '../../src/ui/index.ts';
import type {GameAction, UIState} from '../../src/contracts/index.ts';

// Exercise real DOM hierarchy rules without requiring WebGPU or touching saves.
const result=document.querySelector<HTMLElement>('#result')!;
const root=document.querySelector<HTMLElement>('#game')!;
const actions:GameAction[]=[];
try {
  const ui=createUI(root,action=>actions.push(action));
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
  const speeds=root.querySelectorAll<HTMLButtonElement>('header [data-simulation-speed]');
  if(Array.from(speeds).map(button=>button.textContent).join(',')!=='1×,2×,3×,5×')throw Error('Top bar speed presets missing');
  actions.length=0;speeds.forEach(button=>button.click());
  const pause=root.querySelector<HTMLButtonElement>('header .time-pause')!;pause.click();
  if(actions.map(action=>action.type==='simulation-speed'?action.value:action.type).join(',')!=='1,2,3,5,pause')throw Error('Time controls did not dispatch speed and pause actions');
  const dock=root.querySelector<HTMLElement>('aside')!,toggle=dock.querySelector<HTMLButtonElement>('.window-toggle')!,handle=dock.querySelector<HTMLButtonElement>('.window-handle')!;
  toggle.click();if(!dock.classList.contains('window-collapsed'))throw Error('Build menu must minimize');
  toggle.click();if(dock.classList.contains('window-collapsed'))throw Error('Build menu must expand');
  handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  if(dock.dataset.windowMoved!=='true'||dock.style.position!=='fixed')throw Error('Window must retain its moved position');
  const rect=dock.getBoundingClientRect();if(rect.left<0||rect.top<0)throw Error('Moved window must remain onscreen');
  const state:UIState={mode:'game',phase:'preparation',paused:false,fps:60,frameMs:16,population:0,capacity:5000,kills:5000,crushKills:0,leaks:0,earned:100,maxPressure:0,metal:3000,baseHealth:100,level:1,wave:3,waveCount:10,difficulty:1,streamWidth:60,selected:null,upgradeTarget:null,selectedKind:null,buildTool:null,upgradeMode:false,moveMode:false,targetMode:false,heatmap:false,tool:'inspect',message:'',adapter:'test',bonusChoices:[{id:'test-boon',name:'Test boon',description:'Increase defense strength'}],bonuses:[],commandUpgrades:[],statUpgrades:[],towerUnlocks:[]};
  toggle.click();dock.hidden=true;
  ui.update(state);
  const gate=root.querySelector<HTMLElement>('.boon-gate')!,choice=gate.querySelector<HTMLButtonElement>('[data-bonus]')!;
  if(gate.hidden||gate.closest('aside')||choice.closest('[hidden]'))throw Error('Boon must appear outside hidden/collapsed build controls');
  if(document.activeElement!==choice)throw Error('New boon popup must focus its first choice');
  actions.length=0;choice.click();
  if(actions.length!==1||actions[0].type!=='bonus'||actions[0].id!=='test-boon')throw Error('Boon choice must dispatch selection');
  ui.update({...state,bonusChoices:[]});
  if(!gate.hidden||root.querySelector<HTMLButtonElement>('.wave-control')!.disabled)throw Error('Choosing a boon must dismiss the popup and unlock the next wave');
  result.textContent='PASS: UI initializes with working tower controls and top bar speed/pause controls';
} catch(error) {
  result.textContent=`FAIL: ${String(error)}`;
  throw error;
}
