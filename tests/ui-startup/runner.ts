import {COMMAND_UPGRADES} from '../../src/content/index.ts';
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
  if(!root.querySelector('canvas')||!root.querySelector('.wave-command > [data-action="start-wave"]')) {
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
  dock.hidden=false;toggle.click();
  const selected={id:1,kind:'repulsor' as const,x:30,y:30,level:0,branch:-1,angle:0,cooldown:0,spent:100};
  const inspector=root.querySelector<HTMLElement>('.selected-popup')!;
  for(const tab of ['#build-tab','#buildings-tab','#research-tab']){
    root.querySelector<HTMLButtonElement>(tab)!.click();
    ui.update({...state,bonusChoices:[],selected});
    if(inspector.hidden||getComputedStyle(inspector).display==='none')throw Error(`Inspector hidden on ${tab}`);
    ui.update({...state,bonusChoices:[],selected:null});
    if(!inspector.hidden)throw Error(`Deselected inspector visible on ${tab}`);
  }
  ui.update({...state,bonusChoices:[],selected});
  toggle.click();
  if(inspector.closest('aside')||inspector.hidden)throw Error('Collapsed build menu must not hide inspector');
  toggle.click();
  for(const mode of ['upgradeMode','targetMode']){
    ui.update({...state,bonusChoices:[],selected,[mode]:true});
    if(!inspector.hidden)throw Error(`Inspector must yield during ${mode}`);
  }
  ui.update({...state,bonusChoices:[],selected:null});
  const nodes=root.querySelectorAll<HTMLButtonElement>('#commands .tech-node');
  if(nodes.length!==COMMAND_UPGRADES.length||root.querySelectorAll('.research-group').length!==5)throw Error('Research grouping omitted technologies');
  if([...nodes].some(node=>!node.querySelector('svg.research-icon path')))throw Error('Every technology needs an icon');
  actions.length=0;
  root.querySelector<HTMLButtonElement>('[data-command="ballistics"]')!.click();
  const purchase=actions.at(-1);
  if(purchase?.type!=='buy-command'||purchase.id!=='ballistics')throw Error('Research purchase action broken');
  result.textContent='PASS: tower inspector works across tabs and collapsed menus; grouped research icons and purchases work';
} catch(error) {
  result.textContent=`FAIL: ${String(error)}`;
  throw error;
}
