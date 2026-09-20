import type { GameAction, GameUI, UIState } from '../contracts/index.ts';
import { COMMAND_UPGRADES, compileTower, MAX_VETERANCY, TOWERS, veterancyLevel } from '../content/index.ts';
import './style.css';
import './popup.css';
import './tower-identity.css';

export function createUI(root: HTMLElement, onAction: (action: GameAction) => void): GameUI {
  const towerButton = (id:keyof typeof TOWERS) => {
    const tower=TOWERS[id];
    return `<button data-tower="${id}"><span class="tower-shape" aria-hidden="true"></span><b>${tower.name.toUpperCase()} <em></em></b><span class="cost">${tower.cost}</span></button>`;
  };
  root.innerHTML=`<main class="pf">
    <header>
      <div class="brand">PRESSURE <i>FRONT</i><small>FLUID DEFENSE COMMAND</small></div>
      <div class="hud" aria-label="Run telemetry">
        <div><span>METAL</span><b id="metal">000</b></div>
        <div><span>INTEGRITY</span><b id="base">100%</b></div>
        <div><span>LEVEL</span><b id="level">01</b></div>
        <div><span>WAVE</span><b id="wave">00 / 10</b></div>
        <div><span>KILLS</span><b id="kills">0000</b></div>
        <div><span>MAX PRESSURE</span><b id="pressure">0.00</b></div>
        <div><span>LIVE</span><b id="live">--</b></div>
      </div>
      <div class="status"><span class="led"></span><b id="phase">PREPARATION</b><span id="adapter">LOCAL GPU</span></div>
      <div class="metrics"><b id="fps">-- FPS</b><b id="ms">-- MS</b></div>
      <div class="view-actions"><button class="start-wave" data-action="start-wave">START WAVE</button><button data-view="full">FULLSCREEN</button></div>
    </header>
    <section class="body">
      <div class="arena"><canvas aria-label="Pressure Front battle arena"></canvas><div class="arena-label"><span>SECTOR 07 / CONTAINMENT GRID</span><span id="message">SYSTEM READY</span></div><p class="help" id="help">Select a tower, then place it on clear ground.</p></div>
      <aside aria-label="Build and research controls">
        <div class="tabs"><button id="build-tab" class="active">BUILD</button><button id="research-tab">RESEARCH</button></div>
        <section class="card controls"><label>SIMULATION CONTROL</label><div><button data-action="pause">PAUSE</button><button data-action="step">STEP</button><button data-action="reset">RESET</button></div></section>
        <section class="card tower"><label>DEFENSE BUILD ARRAY <span>1–8 SHORTCUTS</span></label><div class="defense-tools"><button data-action="wall-tool"><b>METAL WALL <em>[Q]</em></b><span class="cost">60</span></button><button data-action="wire-tool"><b>BARBED WIRE <em>[E]</em></b><span class="cost">45</span></button></div><div class="build-divider"><span>EMPLACEMENTS</span></div><div class="tower-grid">${(Object.keys(TOWERS) as (keyof typeof TOWERS)[]).map(towerButton).join('')}</div></section>
        <section class="card bonuses" id="bonuses" hidden><label>COMMAND BOON — CHOOSE ONE</label><div id="bonus-choices"></div></section>
        <section class="card selected"><label id="selected-name">TOWER INSPECTOR</label><div id="tower-stats" class="tower-stats">Select a deployed tower to view its combat record and upgrades.</div><div class="upgrade-buttons"><button data-upgrade="0">BRANCH A</button><button data-upgrade="1">BRANCH B</button></div><button class="danger wide" data-action="sell">SELL / RECOVER</button></section>
        <section class="card command"><label>COMMAND RESEARCH <span id="research-count">0 INSTALLED</span></label><div id="commands"></div></section>
        <div class="run-summary"><span>RUN RECORD</span><b id="crush">CRUSH 000</b><b id="leaks">BREACHES 000</b><b id="earned">SALVAGE +000</b></div>
      </aside>
    </section>
  </main>`;

  const canvas=root.querySelector('canvas')!;
  const shell=root.querySelector<HTMLElement>('.pf')!;
  const arena=root.querySelector<HTMLElement>('.arena')!;
  const selectedCard=root.querySelector<HTMLElement>('.selected')!;
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  arena.append(selectedCard);
  selectedCard.classList.add('selected-popup');

  const difficulty=document.createElement('label');
  difficulty.className='difficulty';
  difficulty.innerHTML='ZOMBIE FLOW <b id="difficulty-value">1×</b><input id="difficulty" type="range" min="1" max="40" value="1" aria-label="Zombie production multiplier">';
  shell.querySelector('header')!.insertBefore(difficulty,shell.querySelector('.status'));
  difficulty.querySelector<HTMLInputElement>('input')!.addEventListener('input',event=>{
    const value=+(event.target as HTMLInputElement).value;
    difficulty.querySelector('b')!.textContent=`${value}×`;
    onAction({type:'difficulty',value});
  });
  root.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((button,index)=>button.querySelector('em')!.textContent=`[${index+1}]`);

  const buildTab=$<HTMLButtonElement>('#build-tab');
  const researchTab=$<HTMLButtonElement>('#research-tab');
  let research=false;
  const setPanel=(next:boolean)=>{
    research=next;
    buildTab.classList.toggle('active',!next);
    researchTab.classList.toggle('active',next);
    for(const selector of ['.controls','.tower'])root.querySelector<HTMLElement>(selector)?.toggleAttribute('hidden',next);
    selectedCard.hidden=next||!selectedCard.classList.contains('has-selection');
    root.querySelector<HTMLElement>('.command')?.toggleAttribute('hidden',!next);
  };
  buildTab.onclick=()=>setPanel(false);
  researchTab.onclick=()=>setPanel(true);
  setPanel(false);

  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(!button||button.disabled)return;
    if(button.dataset.view==='full'){
      if(document.fullscreenElement)void document.exitFullscreen();
      else void shell.requestFullscreen();
      return;
    }
    const action=button.dataset.action;
    if(action)onAction({type:action as 'pause'|'step'|'reset'|'start-wave'|'sell'|'wall-tool'|'wire-tool'});
    if(button.dataset.tower)onAction({type:'select-tower',kind:button.dataset.tower as keyof typeof TOWERS});
    if(button.dataset.upgrade)onAction({type:'upgrade',branch:+button.dataset.upgrade});
    if(button.dataset.command)onAction({type:'buy-command',id:button.dataset.command});
    if(button.dataset.bonus)onAction({type:'bonus',id:button.dataset.bonus});
  });

  return {
    canvas,
    update(state:UIState){
      const locked=state.phase==='settling'||state.phase==='combat';
      const chosen=state.selected?TOWERS[state.selected.kind]:undefined;
      const upgrade=45+(state.selected?.level??0)*35;
      $('#phase').textContent=state.phase.toUpperCase();
      $('#adapter').textContent=state.adapter;
      $('#fps').textContent=`${state.fps|0} FPS`;
      $('#ms').textContent=`${state.frameMs.toFixed(1)} MS`;
      $('#message').textContent=state.message||'SYSTEM READY';
      $('#live').textContent=state.population.toLocaleString();
      $('#help').textContent=state.bonusChoices.length?'Choose a command boon before deploying the next wave.':'Build during preparation. Click a deployed tower to inspect its combat record and upgrades.';
      $('#metal').textContent=String(state.metal).padStart(3,'0');
      $('#base').textContent=`${state.baseHealth}%`;
      $('#level').textContent=String(state.level).padStart(2,'0');
      $('#wave').textContent=`${state.wave} / ${state.waveCount}`;
      $('#kills').textContent=String(state.kills).padStart(4,'0');
      $('#pressure').textContent=state.maxPressure.toFixed(2);
      $('#crush').textContent=`CRUSH ${state.crushKills.toLocaleString()}`;
      $('#leaks').textContent=`BREACHES ${state.leaks.toLocaleString()}`;
      $('#earned').textContent=`SALVAGE +${state.earned.toLocaleString()}`;
      $('#research-count').textContent=`${state.commandUpgrades.length} INSTALLED`;
      $('#selected-name').textContent=chosen?`${chosen.name.toUpperCase()} / LV ${state.selected!.level}`:'TOWER INSPECTOR';
      const stats=$('#tower-stats');
      if(state.selected&&chosen){
        const tower=state.selected;
        const definition=compileTower(tower,[],state.commandUpgrades);
        const rank=tower.veterancy??veterancyLevel(tower.veterancyXp??0);
        const xp=tower.veterancyXp??0;
        const next=rank>=MAX_VETERANCY?'MAX RANK':`${Math.ceil(40*(Math.pow(1.42,rank+1)-1)-xp)} XP TO RANK ${rank+1}`;
        const modifiers=[tower.level?`BRANCH: ${chosen.branches[tower.branch]}`:'BASE CONFIGURATION',...state.commandUpgrades.filter(id=>id==='targeting-grid'||id==='ammunition-forge'||id.startsWith('repulsor-impact-')).map(id=>COMMAND_UPGRADES.find(item=>item.id===id)?.name??id)];
        stats.innerHTML=`<div><span>KILLS</span><b>${(tower.kills??0).toLocaleString()}</b></div><div><span>VETERANCY</span><b>RANK ${rank} / ${MAX_VETERANCY}</b><small>${next}</small></div><div><span>OUTPUT</span><b>${definition.damage.toFixed(1)} DMG · ${definition.range.toFixed(0)} RANGE</b><small>${definition.force.toFixed(0)} FORCE · ${(1/definition.cooldown).toFixed(1)} PULSES/S</small></div><div><span>MODIFIERS</span><small>${modifiers.join(' · ')}</small></div>`;
      }else stats.textContent='Select a deployed tower to view its combat record and upgrades.';
      root.querySelectorAll('[data-tower]').forEach(element=>element.classList.toggle('active',(element as HTMLElement).dataset.tower===state.selectedKind));
      root.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button,index)=>{
        const unavailable=!chosen||state.selected!.level>=3||state.metal<upgrade||(state.selected!.branch>=0&&state.selected!.branch!==index);
        button.textContent=chosen?`${chosen.branches[index]} · ${upgrade} METAL`:`BRANCH ${index?'B':'A'}`;
        button.disabled=unavailable;
      });
      root.querySelector<HTMLButtonElement>('[data-action="pause"]')!.textContent=state.paused?'RESUME':'PAUSE';
      root.querySelector<HTMLButtonElement>('[data-action="step"]')!.disabled=!state.paused;
      root.querySelector<HTMLButtonElement>('[data-action="sell"]')!.disabled=!chosen;
      root.querySelectorAll<HTMLButtonElement>('[data-action="start-wave"]').forEach(button=>button.disabled=state.phase!=='preparation'||state.bonusChoices.length>0);
      const bonusCard=$('#bonuses');
      bonusCard.hidden=!state.bonusChoices.length;
      $('#bonus-choices').innerHTML=state.bonusChoices.map(choice=>`<button data-bonus="${choice.id}"><b>${choice.name.toUpperCase()}</b><small>${choice.description}</small></button>`).join('');
      $('#commands').innerHTML=COMMAND_UPGRADES.map(item=>`<button data-command="${item.id}" ${locked||state.commandUpgrades.includes(item.id)||state.metal<item.cost?'disabled':''}><b>${state.commandUpgrades.includes(item.id)?'INSTALLED · ':''}${item.name.toUpperCase()}</b><span class="cost">${item.cost} METAL</span><small>${item.description}</small></button>`).join('');
      setPanel(research);
    },
    destroy(){root.replaceChildren();},
  };
}
