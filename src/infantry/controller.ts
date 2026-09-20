import type {NavigationField,Vec2,WorldMap} from '../contracts/index.ts';
import type {RunController} from '../game/index.ts';
import {hasSpawnRoute,mapWithTurretObstacles} from '../navigation/index.ts';
import {INFANTRY,infantryStats,type InfantryKind,MAX_BARRACKS,SQUAD_SIZE,freshInfantry,infantryMap,infantryField,exitPoint,clearForSoldier,recruitInterval,infantryUpgradeCost,type Barracks} from './model.ts';
import './style.css';
import {makeGameWindow} from '../ui/windows.ts';

export function createInfantryController(root:HTMLElement,run:RunController,getMap:()=>WorldMap,changed:()=>void,message:(text:string)=>void,cancelTools:()=>void){
  let buildKind:InfantryKind='rifle';
  let selected:number|null=null,tool:'build'|'rally'|null=null,fieldKey='';
  const fields=new Map<number,NavigationField>();
  const state=()=>run.model.infantry??(run.model.infantry=freshInfantry());
  const map=()=>infantryMap(mapWithTurretObstacles(getMap(),run.model.towers),state());
  const panel=document.createElement('section');panel.className='card infantry-panel buildings';panel.hidden=true;panel.innerHTML=`<label>INFANTRY COMMAND</label><div class="infantry-details"></div>${(Object.keys(INFANTRY) as InfantryKind[]).map(kind=>`<button data-infantry="build" data-kind="${kind}"><b>${INFANTRY[kind].building.toUpperCase()} · ${INFANTRY[kind].cost}</b><small>${INFANTRY[kind].name} · ${INFANTRY[kind].interval}s / recruit</small><small>${INFANTRY[kind].role}</small></button>`).join("")}<p class="infantry-summary"></p>`;
  root.querySelector('aside')!.append(panel);
  const rallyHint=document.createElement('div');rallyHint.className='infantry-rally-hint';rallyHint.hidden=true;rallyHint.setAttribute('role','status');rallyHint.textContent='SET RALLY POINT — Click the battlefield where troops should gather. Esc keeps the current flag.';root.querySelector('.arena')!.append(rallyHint);
  root.addEventListener('build-panel-change',()=>{tool=null;cancelTools();});
  const summary=panel.querySelector<HTMLElement>('.infantry-summary')!,details=panel.querySelector<HTMLElement>('.infantry-details')!;
  const inspector=document.createElement('section');inspector.className='infantry-panel infantry-inspector';inspector.hidden=true;inspector.setAttribute('aria-label','Infantry building inspector');inspector.append(details);root.querySelector('.arena')!.append(inspector);
  const windowControls=makeGameWindow(inspector,'BUILDING INSPECTOR',()=>{selected=null;tool=null;update();});
  let inspectedId:number|null=null;
  let lastHTML='';
  const ended=()=>['won','lost'].includes(run.model.phase);
  const update=()=>{
    const b=state().buildings.find(b=>b.id===selected);if(!b)selected=null;
    inspector.hidden=!b;if(b&&inspectedId!==b.id){inspectedId=b.id;windowControls.expand();}
    rallyHint.hidden=tool!=='rally';root.querySelector('canvas')!.classList.toggle('setting-infantry-rally',tool==='rally');
    summary.textContent=tool==='build'?'Click clear ground to place. Esc cancels.':tool==='rally'?'SET RALLY POINT: click clear ground on the battlefield. Esc keeps the current flag.':`${state().soldiers.filter(s=>s.health>0).length} infantry · ${state().buildings.length}/${MAX_BARRACKS} buildings. Click a building to command it.`;
    panel.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{button.classList.toggle('active',tool==='build'&&button.dataset.kind===buildKind);button.disabled=ended()||state().buildings.length>=MAX_BARRACKS||run.model.metal<INFANTRY[button.dataset.kind as InfantryKind].cost;});
    const track=(key:'production'|'training'|'defense')=>{const rank=b![key]??0,cost=infantryUpgradeCost(rank);return `<button data-infantry="${key}" ${rank>=5||run.model.metal<cost||ended()?'disabled':''}>${key==='production'?`PRODUCTION ${rank}/5 · ${recruitInterval(rank,b!.kind).toFixed(1)}s${rank<5?' → '+recruitInterval(rank+1,b!.kind).toFixed(1)+'s':''}`:key==='training'?`WEAPONS ${rank}/5 · ${Math.round(infantryStats(b!.kind,rank,b!.defense).damage)} DMG`:`ARMOR ${rank}/5 · ${infantryStats(b!.kind,b!.training,rank).health} HP / ${Math.round(infantryStats(b!.kind,b!.training,rank).armor*100)}% REDUCTION`}<small>${rank<5?cost+' METAL':'MAXIMUM'}</small></button>`;};
    const squad=state().soldiers.filter(s=>s.home===b?.id&&s.health>0),squadRank=Math.max(0,...squad.map(s=>s.veterancy??0));
    const html=b?`<b>${INFANTRY[b.kind??'rifle'].building.toUpperCase()} ${b.id} · ${squad.length}/${SQUAD_SIZE} TROOPS · RANK ${squadRank}</b><button class="rally-action ${tool==='rally'?'active':''}" data-infantry="rally">${tool==='rally'?'⚑ CLICK THE BATTLEFIELD TO SET RALLY':'⚑ SET / CHANGE RALLY POINT'}</button><p>Troops gather at the yellow flag. ${tool==='rally'?'Esc keeps the current flag.':'Click the button above, then a location on the map.'}</p><p>Recruit <output class="infantry-progress">${Math.floor(b.progress*100)}%</output> · combat only.<br>Weapons train new recruits. Armor equips living troops too.</p>${track('production')}${track('training')}${track('defense')}<button data-infantry="sell">SELL · ${Math.floor(b.spent/2)} METAL</button>`:'<p>Each building produces its own infantry type during combat. Eight troops per building; replacements are free. Select a deployed building to upgrade it.</p>';
    if(html!==lastHTML){details.innerHTML=html;lastHTML=html;}
    if(b)details.querySelector<HTMLOutputElement>('.infantry-progress')!.value=`${Math.floor(b.progress*100)}%`;
  };
  const handleClick=(event:MouseEvent)=>{
    const action=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-infantry]')?.dataset.infantry;if(!action)return;
    if(ended()){message('The run is over.');return;}
    const b=state().buildings.find(b=>b.id===selected);
    if(action==='build'){const kind=(event.target as HTMLElement).closest<HTMLElement>('[data-kind]')!.dataset.kind as InfantryKind;cancelTools();tool=tool==='build'&&buildKind===kind?null:'build';buildKind=kind;}
    else if(b&&action==='rally'){cancelTools();tool='rally';}
    else if(b&&(action==='production'||action==='training'||action==='defense')){const rank=b[action]??0;if(rank>=5)return;const cost=infantryUpgradeCost(rank),result=run.spendMetal(cost);if(result.ok){b[action]=rank+1;b.spent+=cost;if(action==='defense')for(const s of state().soldiers.filter(s=>s.home===b.id&&s.health>0)){const old=infantryStats(s.kind,s.quality,s.defense).health;s.defense=b.defense;s.health*=infantryStats(s.kind,s.quality,s.defense).health/old;}changed();message(action==='production'?'Recruitment accelerated.':action==='defense'?'Squad health and armor improved.':'New recruits receive improved weapons training.');}else message(result.reason);}
    else if(b&&action==='sell'){state().buildings=state().buildings.filter(v=>v.id!==b.id);state().soldiers=state().soldiers.filter(s=>s.home!==b.id);run.refundMetal(Math.floor(b.spent/2));selected=null;tool=null;changed();message('Building sold; its squad stood down.');}
    update();
  };
  panel.addEventListener('click',handleClick);inspector.addEventListener('click',handleClick);
  function ensureFields(){const active=map(),key=JSON.stringify([active.obstacles,state().buildings.map(b=>[b.id,b.rally])]);if(key!==fieldKey){fields.clear();for(const b of state().buildings)fields.set(b.id,infantryField(active,b.rally));fieldKey=key;}return active;}
  return {state,fields,ensureFields,update,inspector,get selected(){return selected;},get tool(){return tool;},cancel(){tool=null;selected=null;},reset(){tool=null;selected=null;fieldKey='';fields.clear();},
    preview(p:Vec2){const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};return {...at,valid:!ended()&&run.model.metal>=INFANTRY[buildKind].cost&&state().buildings.length<MAX_BARRACKS&&clearForSoldier(map(),at,2.5)&&Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)>=getMap().goalRadius+3};},
    click(p:Vec2,select=true):boolean {
      if(ended())return !!tool;
      if(tool==='build'){
        if(state().buildings.length>=MAX_BARRACKS){message('Maximum eight infantry buildings.');return true;}
        const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(!clearForSoldier(map(),at,2.5)||Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)<getMap().goalRadius+3){message('Building needs a clear 4 × 4 foundation.');return true;}
        const b:Barracks={...at,id:state().nextId,rally:{x:at.x-5,y:at.y+3},production:0,training:0,progress:0,kind:buildKind,defense:0,spent:INFANTRY[buildKind].cost};
        const candidate=infantryMap(map(),{...state(),buildings:[b]});
        if(!hasSpawnRoute(candidate)){message('That building would seal the zombie approach.');return true;}
        const rally=[b.rally,{x:at.x+5,y:at.y+3},{x:at.x,y:at.y+5},{x:at.x,y:at.y-5}].find(point=>clearForSoldier(candidate,point)&&exitPoint(candidate,b,infantryField(candidate,point)));
        if(!rally){message('Leave an accessible exit for recruits.');return true;}b.rally=rally;
        const paid=run.spendMetal(INFANTRY[buildKind].cost);if(!paid.ok){message(paid.reason);return true;}
        state().nextId++;state().buildings.push(b);selected=b.id;tool='rally';changed();message('Building ready — now click the battlefield to set its rally point. Esc keeps the default flag.');update();return true;
      }
      if(tool==='rally'){
        const b=state().buildings.find(b=>b.id===selected),active=map(),target={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(b&&clearForSoldier(active,target)){const field=infantryField(active,target);if(exitPoint(active,b,field)){b.rally=target;fieldKey='';tool=null;changed();message('Rally point set. Troops will regroup at the yellow flag.');update();return true;}}
        message('Choose clear ground that recruits can reach from the barracks.');return true;
      }
      if(select){const b=state().buildings.find(b=>Math.abs(b.x-p.x)<=2.5&&Math.abs(b.y-p.y)<=2.5);selected=b?.id??null;if(b){cancelTools();windowControls.expand();update();return true;}}
      return false;
    }
  };
}
