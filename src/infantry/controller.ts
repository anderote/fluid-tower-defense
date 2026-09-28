import {infantryVeterancyXpForLevel} from './model.ts';
import {MAX_VETERANCY} from '../content/index.ts';
import {dragFormation,formationPoint,type FormationPreview} from './formation.ts';
import {mapWithTurretObstacles} from '../navigation/index.ts';
import type {NavigationField,Vec2,WorldMap} from '../contracts/index.ts';
import type {RunController} from '../game/index.ts';
import {infantryAvailable,unlockedInfantryEra,INFANTRY_ERAS,infantryEra,formsFiringLine,INFANTRY,infantryStats,infantryCapacity,type InfantryKind,freshInfantry,infantryMap,infantryField,exitPoint,reachableRallyPoint,clearForSoldier,clearInfantryPath,recruitInterval,infantryUpgradeCost,type Barracks} from './model.ts';
import './style.css';
import {makeGameWindow} from '../ui/windows.ts';

export function createInfantryController(root:HTMLElement,run:RunController,getMap:()=>WorldMap,changed:()=>void,message:(text:string)=>void,cancelTools:()=>void,remote?:{send:(action:string,kind?:string)=>void;snapshot:()=>{state:ReturnType<typeof freshInfantry>;selected:number|null;tool:'build'|'rally'|null;buildKind:InfantryKind;selectedSoldiers?:number[]}|undefined}){
  let buildKind:InfantryKind='phalanx';
  let selected:number|null=null,tool:'build'|'rally'|null=null,fieldKey='',commandTarget:Vec2|null=null;
  let formationPreview:FormationPreview|undefined;
  const fields=new Map<number,NavigationField>(),orderFields=new Map<number,NavigationField>(),selectedSoldiers=new Set<number>(),selectedBuildings=new Set<number>();
  const state=()=>remote?.snapshot()?.state??run.model.infantry??(run.model.infantry=freshInfantry());
  const map=()=>infantryMap(mapWithTurretObstacles(getMap(),run.model.towers),state());
  const panel=document.createElement('section');panel.className='card infantry-panel buildings';panel.hidden=true;panel.innerHTML=`<label>INFANTRY COMMAND</label><div class="infantry-details"></div>${INFANTRY_ERAS.map(era=>`<details class="infantry-era" ${era.id==='classical'?'open':''}><summary>${era.name.toUpperCase()} <small>${era.kinds.length} buildings</small></summary><button data-infantry="unlock-era" data-era="${era.id}"></button>${era.kinds.map(kind=>`<button data-infantry="build" data-kind="${kind}"><span class="selection-icon unit-icon unit-icon-${kind}" aria-hidden="true"></span><span><b>${INFANTRY[kind].building.toUpperCase()} · ${INFANTRY[kind].cost}</b><small>${INFANTRY[kind].name} · ${INFANTRY[kind].interval.toFixed(1)}s / recruit</small><small>${INFANTRY[kind].role}</small></span></button>`).join("")}</details>`).join("")}<details class="infantry-era"><summary>UTILITY</summary><button data-infantry="build" data-kind="dog"><span class="selection-icon unit-icon unit-icon-dog" aria-hidden="true"></span><span><b>DOG KENNEL · ${INFANTRY.dog.cost}</b><small>Attack dogs · fast pursuit packs</small></span></button></details><p class="infantry-summary"></p>`;
  root.querySelector('aside')!.append(panel);
  const rallyHint=document.createElement('div');rallyHint.className='infantry-rally-hint';rallyHint.hidden=true;rallyHint.setAttribute('role','status');rallyHint.textContent='SET RALLY POINT — Click the battlefield where troops should gather. Esc keeps the current flag.';root.querySelector('.arena')!.append(rallyHint);
  const formationHint=document.createElement('div');formationHint.className='infantry-rally-hint formation-placement-hint';formationHint.hidden=true;root.querySelector('.arena')!.append(formationHint);
  root.addEventListener('build-panel-change',()=>{tool=null;cancelTools();});
  const summary=panel.querySelector<HTMLElement>('.infantry-summary')!,details=panel.querySelector<HTMLElement>('.infantry-details')!;
  const inspector=document.createElement('section');inspector.className='infantry-panel infantry-inspector';inspector.hidden=true;inspector.setAttribute('aria-label','Infantry building inspector');inspector.append(details);root.querySelector('.arena')!.append(inspector);
  const windowControls=makeGameWindow(inspector,'BUILDING INSPECTOR',()=>{selected=null;selectedBuildings.clear();tool=null;update();});
  const unitInspector=document.createElement('section');unitInspector.className='infantry-panel infantry-inspector infantry-unit-inspector';unitInspector.hidden=true;unitInspector.setAttribute('aria-label','Infantry unit inspector');
  const unitDetails=document.createElement('div');unitInspector.append(unitDetails);root.querySelector('.arena')!.append(unitInspector);
  const unitWindow=makeGameWindow(unitInspector,'UNIT INSPECTOR',()=>{if(remote)remote.send('deselect');else{clearSoldierSelection();update();}});
  unitInspector.querySelector<HTMLElement>('[aria-label="Close UNIT INSPECTOR"]')!.dataset.infantry='deselect';
  let inspectedUnitId:number|null=null,lastUnitHTML='';
  const selectedUnit=()=>selectedSoldiers.size===1?state().soldiers.find(s=>selectedSoldiers.has(s.id)&&s.health>0):undefined;
  let inspectedId:number|null=null;
  let lastHTML='';
  const ended=()=>['won','lost'].includes(run.model.phase);
  const update=()=>{
    const synced=remote?.snapshot();if(synced){selected=synced.selected;tool=synced.tool;buildKind=synced.buildKind;if(synced.selectedSoldiers){selectedSoldiers.clear();for(const id of synced.selectedSoldiers)selectedSoldiers.add(id);}}
    const unit=selectedUnit();unitInspector.hidden=!unit;
    if(unit){
      if(inspectedUnitId!==unit.id){inspectedUnitId=unit.id;unitWindow.expand();}
      const stats=infantryStats(unit.kind,unit.quality,unit.defense,unit.veterancy,run.researchModifiers()),rank=unit.veterancy??0,xp=unit.veterancyXp??0,next=infantryVeterancyXpForLevel(unit.kind,rank+1);
      const health=Math.max(0,Math.min(100,unit.health/stats.health*100));
      const stat=(label:string,value:string)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
      const html=`<div class="unit-identity"><span class="selection-icon unit-icon unit-icon-${unit.kind??'rifle'}" aria-hidden="true"></span><b>${INFANTRY[unit.kind??'rifle'].name.toUpperCase()}<small>#${unit.id} · RANK ${rank}${rank===MAX_VETERANCY?' · MAX':''}</small></b></div><div class="unit-health"><span>Health</span><b>${Math.ceil(unit.health)} / ${Math.round(stats.health)}</b></div><div class="unit-health-bar" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="${Math.round(stats.health)}" aria-valuenow="${Math.ceil(unit.health)}"><i style="width:${health}%;${health<30?'background:#ef8b70':''}"></i></div><div class="unit-record"><span>Kills <b>${unit.kills??0}</b></span><span title="${rank<MAX_VETERANCY?`${Math.max(0,Math.ceil(next-xp))} kills to next rank`:'Maximum rank'}">Experience <b>${Math.floor(xp)}${rank<MAX_VETERANCY?` / ${Math.ceil(next)}`:''} XP</b></span></div><dl class="unit-stat-grid">${stat('Damage',stats.damage.toFixed(1))}${stat('Attack',`${stats.cooldown.toFixed(2)}s`)}${stat('Range',stats.range.toFixed(1))}${stat('Armor',`${Math.round(stats.armor*100)}%`)}${stat('Speed',stats.speed.toFixed(1))}${unit.kind==='phalanx'?stat('Shield',`${Math.round((unit.brace??0)*75)}%`):''}</dl>`;
      if(html!==lastUnitHTML){unitDetails.innerHTML=html;lastUnitHTML=html;}
    }
    const b=state().buildings.find(b=>b.id===selected);if(!b)selected=null;
    formationHint.hidden=selectedSoldiers.size===0&&selectedBuildings.size===0;
    formationHint.textContent=selectedSoldiers.size===0&&selectedBuildings.size?`${selectedBuildings.size} BUILDING${selectedBuildings.size===1?'':'S'} SELECTED — Right-click clear ground to set rally points · Double-click selects this building type in view · Esc clears selection`:formationPreview?`${formationPreview.valid?'RELEASE TO PLACE':'BLOCKED — CHOOSE CLEAR GROUND'} · ${formationPreview.columns} files × ${formationPreview.rows} ranks · Arrow shows facing · Esc cancels`:'FORMATION — Right-drag: narrow for deep blocks, wide for firing lines · Reverse drag to turn · Right-click to move';
    inspector.hidden=!b;if(b&&inspectedId!==b.id){inspectedId=b.id;windowControls.expand();}
    rallyHint.hidden=tool!=='rally';root.querySelector('canvas')!.classList.toggle('setting-infantry-rally',tool==='rally');
    summary.textContent=tool==='build'?'Click clear ground to place. Esc cancels.':tool==='rally'?'SET RALLY POINT: click clear ground on the battlefield. Esc keeps the current flag.':`${state().soldiers.filter(s=>s.health>0).length} infantry · ${state().buildings.length} buildings. Click a building to command it.`;
    panel.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{button.classList.toggle('active',tool==='build'&&button.dataset.kind===buildKind);button.disabled=ended()||!infantryAvailable(state(),button.dataset.kind as InfantryKind)||run.model.metal<INFANTRY[button.dataset.kind as InfantryKind].cost;});
    panel.querySelectorAll<HTMLButtonElement>('[data-era]').forEach(button=>{
      const index=INFANTRY_ERAS.findIndex(era=>era.id===button.dataset.era),era=INFANTRY_ERAS[index],current=unlockedInfantryEra(state());
      button.hidden=index<=current;button.disabled=ended()||index!==current+1||run.model.metal<era.cost;
      button.textContent=index===current+1?`UNLOCK ${era.name.toUpperCase()} · ${era.cost.toLocaleString()} METAL`:`LOCKED · REQUIRES ${INFANTRY_ERAS[Math.max(0,index-1)].name.toUpperCase()} · ${era.cost.toLocaleString()} METAL`;
    });
    const track=(key:'production'|'training'|'defense')=>{const rank=b![key]??0,cost=infantryUpgradeCost(rank);return `<button data-infantry="${key}" ${rank>=5||run.model.metal<cost||ended()?'disabled':''}>${key==='production'?`PRODUCTION ${rank}/5 · ${recruitInterval(rank,b!.kind).toFixed(1)}s${rank<5?' → '+recruitInterval(rank+1,b!.kind).toFixed(1)+'s':''}`:key==='training'?`WEAPONS ${rank}/5 · ${Math.round(infantryStats(b!.kind,rank,b!.defense).damage)} DMG`:`ARMOR ${rank}/5 · ${infantryStats(b!.kind,b!.training,rank).health} HP / ${Math.round(infantryStats(b!.kind,b!.training,rank).armor*100)}% REDUCTION`}<small>${rank<5?cost+' METAL':'MAXIMUM'}</small></button>`;};
    const squad=state().soldiers.filter(s=>s.home===b?.id&&s.health>0),squadRank=squad.reduce((rank,s)=>Math.max(rank,s.veterancy??0),0);
    const html=b?`<div class="building-identity"><span class="selection-icon building-icon building-icon-${b.kind??'rifle'}" aria-hidden="true"></span><b>${infantryEra(b.kind??'rifle').name.toUpperCase()} · ${INFANTRY[b.kind??'rifle'].building.toUpperCase()} ${b.id} · <output class="infantry-count"></output>/<output class="infantry-capacity"></output> TROOPS · RANK <output class="infantry-rank"></output></b></div><button class="rally-action ${tool==='rally'?'active':''}" data-infantry="rally">${tool==='rally'?'⚑ CLICK THE BATTLEFIELD TO SET RALLY':'⚑ SET / CHANGE RALLY POINT'}</button><p>${b.kind==='phalanx'?'Hoplites form a three-rank shield wall at the flag, facing the enemy spawn. Double-click a trooper to select its squad; right-drag to set width and facing. Keep ranks together for stronger frontal blocking.':formsFiringLine(b.kind)?'Troops assemble into two firing ranks at the flag, facing the enemy approach. Right-drag a selected squad to change width and facing.':'Troops gather at the yellow flag.'} ${tool==='rally'?'Esc keeps the current flag.':'Click the button above, then a location on the map.'}</p><p>Recruit <output class="infantry-progress"></output> · combat only.<br>Weapons and armor upgrades equip new recruits.</p>${track('production')}${track('training')}${track('defense')}<button data-infantry="sell">SELL · ${Math.floor(b.spent/2)} METAL</button>`:'<p>Each building produces its own infantry type during combat. Limited squads; production upgrades expand the cap.</p>';
    if(html!==lastHTML){details.innerHTML=html;lastHTML=html;}
    if(b){details.querySelector<HTMLOutputElement>('.infantry-count')!.value=String(squad.length);details.querySelector<HTMLOutputElement>('.infantry-capacity')!.value=String(infantryCapacity(b.kind??'rifle',b.production));details.querySelector<HTMLOutputElement>('.infantry-rank')!.value=String(squadRank);details.querySelector<HTMLOutputElement>('.infantry-progress')!.value=`${Math.floor(b.progress*100)}%`;}
  };
  const handleClick=(event:MouseEvent)=>{
    const action=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-infantry]')?.dataset.infantry;if(!action)return;
    if(remote){remote.send(action,(event.target as HTMLElement).closest<HTMLElement>('[data-kind], [data-era]')?.getAttribute(action==='unlock-era'?'data-era':'data-kind')??undefined);return;}
    if(ended()){message('The run is over.');return;}
    const b=state().buildings.find(b=>b.id===selected);
    if(action==='unlock-era'){const result=run.unlockInfantryEra((event.target as HTMLElement).closest<HTMLElement>('[data-era]')!.dataset.era!);if(result.ok){changed();message(`${INFANTRY_ERAS[unlockedInfantryEra(state())].name} infantry unlocked.`);}else message(result.reason);}
    else if(action==='build'){const kind=(event.target as HTMLElement).closest<HTMLElement>('[data-kind]')!.dataset.kind as InfantryKind;if(!infantryAvailable(state(),kind)){message('Unlock this infantry era first.');return;}cancelTools();tool=tool==='build'&&buildKind===kind?null:'build';buildKind=kind;}
    else if(b&&action==='rally'){cancelTools();tool='rally';}
    else if(b&&(action==='production'||action==='training'||action==='defense')){const rank=b[action]??0;if(rank>=5)return;const cost=infantryUpgradeCost(rank),result=run.spendMetal(cost);if(result.ok){b[action]=rank+1;b.spent+=cost;changed();message(action==='production'?'Recruitment accelerated.':action==='defense'?'New recruits receive improved armor.':'New recruits receive improved weapons training.');}else message(result.reason);}
    else if(b&&action==='sell'){state().buildings=state().buildings.filter(v=>v.id!==b.id);state().soldiers=state().soldiers.filter(s=>s.home!==b.id);run.refundMetal(Math.floor(b.spent/2));selected=null;tool=null;changed();message('Building sold; its squad stood down.');}
    update();
  };
  panel.addEventListener('click',handleClick);inspector.addEventListener('click',handleClick);
  const livingSelected=()=>state().soldiers.filter(s=>s.health>0&&selectedSoldiers.has(s.id));
  const fieldReaches=(field:NavigationField,s:Vec2)=>{const x=Math.max(0,Math.min(field.width-1,Math.floor(s.x/field.cellSize))),y=Math.max(0,Math.min(field.height-1,Math.floor(s.y/field.cellSize)));return Number.isFinite(field.distances[y*field.width+x]);};
  const clearSoldierSelection=()=>{selectedSoldiers.clear();commandTarget=null;formationPreview=undefined;};
  const selectAt=(p:Vec2,additive=false,squadSelection=false)=>{
    const soldier=state().soldiers.filter(s=>s.health>0&&Math.hypot(s.x-p.x,s.y-p.y)<=1.35).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(!soldier){if(!additive)clearSoldierSelection();return false;}
    const squad=squadSelection?state().soldiers.filter(s=>s.health>0&&s.home===soldier.home):[soldier];
    const remove=additive&&squad.every(s=>selectedSoldiers.has(s.id));
    if(!additive)selectedSoldiers.clear();
    for(const s of squad)if(remove)selectedSoldiers.delete(s.id);else selectedSoldiers.add(s.id);
    selected=null;selectedBuildings.clear();tool=null;commandTarget=null;cancelTools();update();message(`${selectedSoldiers.size} infantry selected. Right-click to move; right-drag to set width and facing.`);return true;
  };
  const selectBuildingType=(p:Vec2,visible:(building:Vec2)=>boolean,additive=false)=>{
    const clicked=state().buildings.find(b=>Math.abs(b.x-p.x)<=2.5&&Math.abs(b.y-p.y)<=2.5);
    if(!clicked)return false;
    const matches=state().buildings.filter(b=>(b.kind??'rifle')===(clicked.kind??'rifle')&&visible(b));
    if(!additive)selectedBuildings.clear();
    clearSoldierSelection();
    for(const b of matches)selectedBuildings.add(b.id);
    selected=selectedBuildings.size===1?[...selectedBuildings][0]:null;
    tool=null;cancelTools();update();
    message(`${selectedBuildings.size} buildings selected. Right-click to set their rally points.`);
    return true;
  };
  const selectBox=(from:Vec2,to:Vec2,additive=false)=>{
    const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x),minY=Math.min(from.y,to.y),maxY=Math.max(from.y,to.y);
    const soldiers=state().soldiers.filter(s=>s.health>0&&s.x>=minX&&s.x<=maxX&&s.y>=minY&&s.y<=maxY);
    const buildings=state().buildings.filter(b=>b.x>=minX&&b.x<=maxX&&b.y>=minY&&b.y<=maxY);
    if(!additive){selectedSoldiers.clear();selectedBuildings.clear();}
    for(const s of soldiers)selectedSoldiers.add(s.id);
    for(const b of buildings)selectedBuildings.add(b.id);
    if(soldiers.length||buildings.length){selected=selectedBuildings.size===1?[...selectedBuildings][0]:null;tool=null;commandTarget=null;cancelTools();update();message(buildings.length&&!soldiers.length?`${selectedBuildings.size} barracks selected. Right-click to set rally points.`:`${selectedSoldiers.size} infantry selected. Right-click to move; right-drag to set width and facing.`);}
    return soldiers.length+buildings.length;
  };
  const command=(target:Vec2)=>{
    const soldiers=livingSelected().sort((a,b)=>a.id-b.id);if(!soldiers.length)return false;
    const active=map();if(!clearForSoldier(active,target)){message('Infantry need a clear destination.');return true;}
    const field=infantryField(active,target),retained=soldiers.find(s=>s.moveFormation)?.moveFormation;let ordered=0;
    for(const [slot,soldier] of soldiers.entries()){if(!fieldReaches(field,soldier))continue;soldier.moveTarget={...target};soldier.moveSlot=slot;if(retained)soldier.moveFormation={angle:retained.angle,columns:Math.min(retained.columns,soldiers.length)};orderFields.set(soldier.id,field);ordered++;}
    fieldKey='';commandTarget={...target};changed();message(ordered===soldiers.length?`${ordered} infantry moving.`:`${ordered} of ${soldiers.length} infantry can reach that position.`);return true;
  };
  const previewFormation=(from:Vec2,to:Vec2):FormationPreview=>{
    const soldiers=livingSelected().sort((a,b)=>a.id-b.id),active=map(),layout=dragFormation(from,to,soldiers.length);
    const positions=soldiers.map((_,i)=>{const p=formationPoint(layout.center,i,layout);return {...p,valid:clearForSoldier(active,p)&&clearInfantryPath(active,layout.center,p)};});
    const field=clearForSoldier(active,layout.center)?infantryField(active,layout.center):undefined;
    const valid=!ended()&&soldiers.length>0&&positions.every(p=>p.valid)&&!!field&&soldiers.every(s=>fieldReaches(field,s));
    formationPreview={...layout,positions,valid};return formationPreview;
  };
  const commandFormation=(from:Vec2,to:Vec2)=>{
    const placement=previewFormation(from,to);formationPreview=undefined;
    if(!placement.valid){message('Formation blocked or unreachable. Choose clear ground for every rank.');return false;}
    const soldiers=livingSelected().sort((a,b)=>a.id-b.id),field=infantryField(map(),placement.center);
    soldiers.forEach((s,slot)=>{s.moveTarget={...placement.center};s.moveSlot=slot;s.moveFormation={angle:placement.angle,columns:placement.columns};orderFields.set(s.id,field);});
    fieldKey='';commandTarget={...placement.center};changed();
    message(`${soldiers.length} troops forming ${placement.columns} files × ${placement.rows} ranks.`);return true;
  };
  const commandBuildings=(target:Vec2)=>{
    const buildings=state().buildings.filter(b=>selectedBuildings.has(b.id));if(!buildings.length)return false;
    if(ended()){message('The run is over.');return true;}
    const active=map(),rally={x:Math.floor(target.x)+.5,y:Math.floor(target.y)+.5};
    const valid=buildings.filter(b=>reachableRallyPoint(active,b,rally));
    if(valid.length!==buildings.length){message(valid.length?`That rally point is not reachable by ${buildings.length-valid.length} selected barracks.`:'Choose clear ground reachable from every selected barracks.');return true;}
    for(const b of valid){for(const s of state().soldiers)if(s.home===b.id&&!s.rallyTarget)s.rallyTarget={...b.rally};b.rally={...rally};}
    fieldKey='';commandTarget={...rally};changed();message(`${valid.length} rally points updated.`);update();return true;
  };
  function ensureFields(){const active=map(),orders=state().soldiers.filter(s=>s.health>0&&s.moveTarget),rallying=state().soldiers.filter(s=>s.health>0&&!s.moveTarget&&s.rallyTarget),key=JSON.stringify([active.obstacles,state().buildings.map(b=>[b.id,b.rally]),orders.map(s=>[s.id,s.moveTarget]),rallying.map(s=>[s.id,s.rallyTarget])]);if(key!==fieldKey){fields.clear();orderFields.clear();for(const b of state().buildings)fields.set(b.id,infantryField(active,b.rally));const cached=new Map<string,NavigationField>();for(const s of [...orders,...rallying]){const target=s.moveTarget??s.rallyTarget!;const targetKey=`${target.x},${target.y}`;let field=cached.get(targetKey);if(!field){field=infantryField(active,target);cached.set(targetKey,field);}orderFields.set(s.id,field);}fieldKey=key;}const living=new Set(state().soldiers.filter(s=>s.health>0).map(s=>s.id));for(const id of selectedSoldiers)if(!living.has(id))selectedSoldiers.delete(id);return active;}
  return {snapshot:()=>({state:state(),selected,tool,buildKind,selectedSoldiers:[...selectedSoldiers]}),state,fields,orderFields,ensureFields,update,inspector,unitInspector,get selectedUnit(){return selectedUnit();},selectAt,selectBuildingType,selectBox,previewFormation,commandFormation,clearFormationPreview(){formationPreview=undefined;},get formationPreview(){return formationPreview;},command:(target:Vec2)=>command(target)||commandBuildings(target),get selected(){return selected;},get selectedBuildings(){return selectedBuildings as ReadonlySet<number>;},get selectedSoldiers(){return selectedSoldiers as ReadonlySet<number>;},get commandTarget(){return commandTarget;},get tool(){return tool;},cancel(){tool=null;selected=null;selectedBuildings.clear();clearSoldierSelection();},reset(){tool=null;selected=null;selectedBuildings.clear();clearSoldierSelection();fieldKey='';fields.clear();orderFields.clear();},
    preview(p:Vec2){const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};return {...at,valid:!ended()&&infantryAvailable(state(),buildKind)&&run.model.metal>=INFANTRY[buildKind].cost&&clearForSoldier(map(),at,2.5)&&Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)>=getMap().goalRadius+3};},
    click(p:Vec2,select=true,additive=false):boolean {
      if(ended())return !!tool;
      if(tool==='build'){
        if(!infantryAvailable(state(),buildKind)){message('Unlock this infantry era first.');return true;}
        const at={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(!clearForSoldier(map(),at,2.5)||Math.hypot(at.x-getMap().goal.x,at.y-getMap().goal.y)<getMap().goalRadius+3){message('Building needs a clear 4 × 4 foundation.');return true;}
        const b:Barracks={...at,id:state().nextId,rally:{x:at.x-5,y:at.y+3},production:0,training:0,progress:0,kind:buildKind,defense:0,spent:INFANTRY[buildKind].cost};
        const candidate=infantryMap(map(),{...state(),buildings:[b]});
        const rally=[b.rally,{x:at.x+5,y:at.y+3},{x:at.x,y:at.y+5},{x:at.x,y:at.y-5}].find(point=>clearForSoldier(candidate,point)&&exitPoint(candidate,b,infantryField(candidate,point)));
        if(!rally){message('Leave an accessible exit for recruits.');return true;}b.rally=rally;
        const paid=run.spendMetal(INFANTRY[buildKind].cost);if(!paid.ok){message(paid.reason);return true;}
        state().nextId++;state().buildings.push(b);selected=b.id;selectedBuildings.clear();selectedBuildings.add(b.id);tool='rally';changed();message('Building deployed. Click the battlefield to set its rally point.');update();return true;
      }
      if(tool==='rally'){
        const b=state().buildings.find(b=>b.id===selected),active=map(),target={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5};
        if(b&&reachableRallyPoint(active,b,target)){for(const s of state().soldiers)if(s.home===b.id&&!s.rallyTarget)s.rallyTarget={...b.rally};b.rally=target;fieldKey='';tool=null;changed();message('Rally point set. New recruits will regroup at the yellow flag.');update();return true;}
        message('Choose clear ground that recruits can reach from the barracks.');return true;
      }
      if(select&&selectAt(p,additive))return true;
      if(select){const b=state().buildings.find(b=>Math.abs(b.x-p.x)<=2.5&&Math.abs(b.y-p.y)<=2.5);if(b){if(!additive){selectedBuildings.clear();selectedSoldiers.clear();}if(additive&&selectedBuildings.has(b.id))selectedBuildings.delete(b.id);else selectedBuildings.add(b.id);selected=selectedBuildings.size===1?[...selectedBuildings][0]:null;tool=null;cancelTools();update();message(`${selectedBuildings.size} barracks selected. Right-click to set rally points.`);return true;}if(!additive){selected=null;selectedBuildings.clear();clearSoldierSelection();}}
      return false;
    }
  };
}
