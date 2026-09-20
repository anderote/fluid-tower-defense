import type {NavigationField,Vec2,WorldMap} from '../contracts/index.ts';
import type {RunController} from '../game/index.ts';
import {hasSpawnRoute,mapWithTurretObstacles} from '../navigation/index.ts';
import {BARRACKS_COST,MAX_BARRACKS,SQUAD_SIZE,freshInfantry,infantryMap,infantryField,exitPoint,clearForSoldier,recruitInterval,rifleStats,infantryUpgradeCost,type Barracks} from './model.ts';
import './style.css';

export function createInfantryController(root:HTMLElement,run:RunController,getMap:()=>WorldMap,changed:()=>void,message:(text:string)=>void,cancelTools:()=>void){
  let selected:number|null=null,tool:'build'|'rally'|null=null,fieldKey='';
  const fields=new Map<number,NavigationField>();
  const state=()=>run.model.infantry??(run.model.infantry=freshInfantry());
  const map=()=>infantryMap(mapWithTurretObstacles(getMap(),run.model.towers),state());
  const panel=document.createElement('section');panel.className='card infantry-panel';panel.innerHTML=`<label>INFANTRY COMMAND</label><button data-infantry="build">INFANTRY BARRACKS · ${BARRACKS_COST}</button><p class="infantry-summary"></p><div class="infantry-details"></div>`;
  root.querySelector('aside .tower')!.append(panel);
  const summary=panel.querySelector<HTMLElement>('.infantry-summary')!,details=panel.querySelector<HTMLElement>('.infantry-details')!;
  let lastHTML='';
  const ended=()=>['won','lost'].includes(run.model.phase);
  const update=()=>{
    const b=state().buildings.find(b=>b.id===selected);if(!b)selected=null;
    summary.textContent=tool==='build'?'Click clear ground to place. Esc cancels.':tool==='rally'?'Click a reachable location for the firing line.':`${state().soldiers.filter(s=>s.health>0).length} riflemen · ${state().buildings.length}/${MAX_BARRACKS} barracks. Click a building to command it.`;
    panel.querySelector('button')!.classList.toggle('active',tool==='build');
    const track=(key:'production'|'training')=>{const rank=b![key],cost=infantryUpgradeCost(rank);return `<button data-infantry="${key}" ${rank>=5||run.model.metal<cost||ended()?'disabled':''}>${key==='production'?`PRODUCTION ${rank}/5 · ${recruitInterval(rank).toFixed(1)}s${rank<5?' → '+recruitInterval(rank+1).toFixed(1)+'s':''}`:`TRAINING ${rank}/5 · ${rifleStats(rank).health} HP / ${rifleStats(rank).damage} DMG${rank<5?' → '+rifleStats(rank+1).health+' / '+rifleStats(rank+1).damage:''}`}<small>${rank<5?cost+' METAL':'MAXIMUM'}</small></button>`;};
    const html=b?`<b>BARRACKS ${b.id} · ${state().soldiers.filter(s=>s.home===b.id&&s.health>0).length}/${SQUAD_SIZE} TROOPS</b><p>Recruit ${Math.floor(b.progress*100)}% · combat only.<br>Training applies to new recruits.</p>${track('production')}${track('training')}<button data-infantry="rally">SET RALLY POINT</button><button data-infantry="sell">SELL · ${Math.floor(b.spent/2)} METAL</button>`:'<p>Produces a rifleman every 8 combat seconds. Supports 8 troops. Recruits are free.</p>';
    if(html!==lastHTML){details.innerHTML=html;lastHTML=html;}
  };
  panel.addEventListener('click',event=>{
    const action=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-infantry]')?.dataset.infantry;if(!action)return;
    if(ended()){message('The run is over.');return;}
    const b=state().buildings.find(b=>b.id===selected);
    if(action==='build'){cancelTools();tool=tool==='build'?null:'build';}
    else if(b&&action==='rally'){cancelTools();tool='rally';}
    else if(b&&(action==='production'||action==='training')){const rank=b[action];if(rank>=5)return;const cost=infantryUpgradeCost(rank),result=run.spendMetal(cost);if(result.ok){b[action]++;b.spent+=cost;message(action==='production'?'Recruitment accelerated.':'New recruits receive improved training.');}else message(result.reason);}
    else if(b&&action==='sell'){state().buildings=state().buildings.filter(v=>v.id!==b.id);state().soldiers=state().soldiers.filter(s=>s.home!==b.id);run.refundMetal(Math.floor(b.spent/2));selected=null;tool=null;changed();message('Barracks sold; its squad stood down.');}
    update();
  });
  function ensureFields(){const active=map(),key=JSON.stringify([active.obstacles,state().buildings.map(b=>[b.id,b.rally])]);if(key!==fieldKey){fields.clear();for(const b of state().buildings)fields.set(b.id,infantryField(active,b.rally));fieldKey=key;}return active;}
  return {state,fields,ensureFields,update,get selected(){return selected;},get tool(){return tool;},cancel(){tool=null;selected=null;},reset(){tool=null;selected=null;fieldKey='';fields.clear();},
    preview(p:Vec2){const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};return {...at,valid:!ended()&&run.model.metal>=BARRACKS_COST&&state().buildings.length<MAX_BARRACKS&&clearForSoldier(map(),at,2.5)&&Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)>=getMap().goalRadius+3};},
    click(p:Vec2,select=true):boolean {
      if(ended())return !!tool;
      if(tool==='build'){
        if(state().buildings.length>=MAX_BARRACKS){message('Maximum eight barracks.');return true;}
        const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(!clearForSoldier(map(),at,2.5)||Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)<getMap().goalRadius+3){message('Barracks needs a clear 4 × 4 foundation.');return true;}
        const b:Barracks={...at,id:state().nextId,rally:{x:at.x-5,y:at.y+3},production:0,training:0,progress:0,spent:BARRACKS_COST};
        const candidate=infantryMap(map(),{...state(),buildings:[b]});
        if(!hasSpawnRoute(candidate)){message('That building would seal the zombie approach.');return true;}
        const rally=[b.rally,{x:at.x+5,y:at.y+3},{x:at.x,y:at.y+5},{x:at.x,y:at.y-5}].find(point=>clearForSoldier(candidate,point)&&exitPoint(candidate,b,infantryField(candidate,point)));
        if(!rally){message('Leave an accessible exit for recruits.');return true;}b.rally=rally;
        const paid=run.spendMetal(BARRACKS_COST);if(!paid.ok){message(paid.reason);return true;}
        state().nextId++;state().buildings.push(b);selected=b.id;tool=null;changed();message('Barracks ready. Set its rally point; recruitment begins in combat.');update();return true;
      }
      if(tool==='rally'){
        const b=state().buildings.find(b=>b.id===selected),active=map(),target={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(b&&clearForSoldier(active,target)){const field=infantryField(active,target);const reachable=exitPoint(active,b,field)&&state().soldiers.filter(s=>s.home===b.id&&s.health>0).every(s=>Number.isFinite(field.distances[Math.floor(s.y)*field.width+Math.floor(s.x)]));if(reachable){b.rally=target;fieldKey='';tool=null;message('Squad rally point updated.');update();return true;}}
        message('Choose a rally point reachable from the barracks and its squad.');return true;
      }
      if(select){const b=state().buildings.find(b=>Math.abs(b.x-p.x)<=2.5&&Math.abs(b.y-p.y)<=2.5);selected=b?.id??null;if(b){cancelTools();update();return true;}}
      return false;
    }
  };
}
