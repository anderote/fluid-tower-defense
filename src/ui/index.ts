import {canFinishWaveEarly} from '../game/wave-progress.ts';
import {commandUpgradeAvailability,researchCost,researchRank} from "../game/research.ts";
import {TOWER_MOVE_COST} from "../game/index.ts";
import {makeGameWindow} from './windows.ts';
import {bossStatus} from "./boss-status.ts";
import type { GameAction, GameUI, UIState } from "../contracts/index.ts";
import {
  COMMAND_UPGRADES,
  compileTower,
  MAX_TOWER_LEVEL,
  MAX_VETERANCY,
  TOWERS,
  towerUpgradeCost,
  veterancyLevel,
  veterancyXpForLevel,
} from "../content/index.ts";
import { previewNextWave } from "../game/wave-preview.ts";
import {allBattlefields} from "../content/battlefields.ts";
import {formatPressure,pressureKpa} from "../sim/pressure/model.ts";
import {BASE_FENCE_PRESSURE_RESISTANCE, BASE_WALL_PRESSURE_RESISTANCE, CHAINLINK_FENCE_COST, METAL_WALL_COST} from "../sim/walls/model.ts";
import {audioSettings,onAudioSettingsChange,setAudioSetting,type AudioSetting} from "../audio/settings.ts";
import "./style.css";
import "./popup.css";
import "./tower-identity.css";

export function createUI(
  root: HTMLElement,
  onAction: (action: GameAction) => void,
): GameUI {
  const battlefieldOptions=allBattlefields().map(map=>`<option value="${map.id}">${map.scenery?.title??map.id}</option>`).join("");
  // Telemetry refreshes frequently; keep unchanged controls alive for keyboard focus.
  const markup = new WeakMap<HTMLElement, string>();
  const renderMarkup = (element: HTMLElement, html: string) => {
    if (markup.get(element) === html) return;
    element.innerHTML = html;
    markup.set(element, html);
  };
  const tower = (id: keyof typeof TOWERS) => {
    const t = TOWERS[id];
    return `<button data-tower="${id}"><span class="tower-shape" aria-hidden="true"></span><b>${t.name.toUpperCase()} <em></em></b><span class="cost">${t.cost}</span></button>`;
  };
  root.innerHTML = `<main class="pf"><header><div class="brand">PRESSURE <i>FRONT</i><small>FLUID DEFENSE COMMAND</small></div><div class="hud" aria-label="Run telemetry"><div><span>METAL</span><b id="metal">000</b></div><div><span>INTEGRITY</span><b id="base">100%</b></div><div><span>LEVEL</span><b id="level">01</b></div><div class="kill-counts" aria-label="Kill counts"><b><strong id="kills">0000</strong> TOTAL KILLS</b></div><div class="kill-counts casualty-counts" aria-label="Friendly casualties"><b><strong id="casualties">0000</strong> CASUALTIES</b><small title="Allied deaths caused by your weapons"><strong id="friendly-fire">0000</strong> FRIENDLY FIRE</small></div><div><span>WAVE</span><b id="wave">00 / 10</b></div><div><span>MAX PRESSURE</span><b id="pressure">0 kPa</b></div><div><span>LIVE</span><b id="live">--</b></div></div><div class="status"><span class="led"></span><b id="phase">PREPARATION</b></div><div class="metrics"><b id="fps">-- FPS</b><b id="ms">-- MS</b></div><section class="soundtrack" aria-label="Red Alert music player"></section><div class="view-actions"><button class="view-menu-toggle" aria-label="More options" aria-expanded="false" aria-controls="view-menu" title="More options"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button><div id="view-menu" class="view-menu" hidden><button data-settings-open>SETTINGS</button><button data-action="restart-wave">RESTART WAVE</button><button data-action="reset">RESTART LEVEL</button><button data-action="new-game">NEW GAME</button><button data-view="hide">HIDE UI</button><button data-view="full">FULLSCREEN</button></div></div><button class="start-wave-top" data-action="start-wave">START WAVE</button></header><section class="body"><div class="arena"><canvas aria-label="Pressure Front battle arena"></canvas></div><aside><section class="card battlefield-picker"><label for="battlefield-select">BATTLEFIELD</label><select id="battlefield-select" aria-label="Battlefield" title="Separate saves. Switching during a wave resumes from the last preparation save.">${battlefieldOptions}</select><small id="battlefield-help">Each battlefield keeps its own defense.</small></section><section class="card wave-status" id="wave-status" aria-label="Wave progress"><b id="wave-status-title"></b><p id="wave-status-count"></p><small id="wave-status-detail"></small></section><section class="card crusher-controls" id="crusher-controls" hidden><b>HYDRAULIC CRUSHERS</b><p id="crusher-status"></p><button data-action="slam-gates">SLAM GATES [G]</button><small>Let the lane pack, then slam. Dense crowds take extra crush damage.</small></section><section class="card dam-controls" id="dam-controls" hidden><b>THUNDERHEAD DAM</b><small>NORTH + SOUTH: floodable spillways. CENTER: always-open spillway.</small><div class="reservoir"><span id="reservoir-fill"></span></div><p id="reservoir-status"></p><div class="gate-buttons"><button data-action="dam-north">NORTH GATE</button><button data-action="dam-south">SOUTH GATE</button></div><button class="flood-release" data-action="dam-flood">RELEASE FLOOD [F]</button><small>Floods sweep all three water channels toward the inlet. Closed gates stop water too. Refills in 30 combat seconds.</small></section><div class="tabs"><button id="build-tab" class="active">TOWERS</button><button id="buildings-tab">BUILDINGS</button><button id="research-tab">RESEARCH</button></div><section class="card extraction" id="extraction" hidden><label>EXTRACTION WINDOW</label><p>Secure the level now, or retain every defense and push into endless escalation.</p><div><button data-action="finish-run" id="finish-run">FINISH LEVEL</button><button data-action="continue-run">CONTINUE</button></div></section><section class="card tower"><label>DEFENSE BUILD ARRAY <span>1–9 SHORTCUTS</span></label><div class="defense-tools"><button data-action="wall-tool"><b>METAL WALL <em>[Q]</em></b><small>${formatPressure(BASE_WALL_PRESSURE_RESISTANCE)} STRUCTURAL YIELD</small><span class="cost">${METAL_WALL_COST}</span></button><button data-action="fence-tool"><b>CHAIN-LINK FENCE <em>[F]</em></b><small>${formatPressure(BASE_FENCE_PRESSURE_RESISTANCE)} YIELD · SOLID</small><span class="cost">${CHAINLINK_FENCE_COST}</span></button><button data-action="wire-tool"><b>BARBED WIRE <em>[E]</em></b><small>7.0 kPa BREACH RATING</small><span class="cost">45</span></button><button data-action="upgrade-tool"><b>UPGRADE <em>[U]</em></b><small>HOVER TOWERS</small></button><button class="danger" data-action="demolish-tool"><b>DEMOLISH <em>[R]</em></b><small>WALLS + FENCES + WIRE</small></button></div><div class="build-divider"><span>EMPLACEMENTS</span></div><div class="tower-grid">${(Object.keys(TOWERS) as (keyof typeof TOWERS)[]).map(tower).join("")}</div></section><section class="card bonuses" id="bonuses" hidden><label>COMMAND BOON — CHOOSE ONE</label><div id="bonus-choices"></div></section><section class="card selected"><label id="selected-name">TOWER INSPECTOR</label><div id="tower-stats" class="tower-stats">Select a deployed tower to view its combat record and upgrades.</div><div class="upgrade-buttons"><button data-upgrade="0">BRANCH A</button><button data-upgrade="1">BRANCH B</button></div><button class="danger wide" data-action="sell">SELL / RECOVER</button></section><section class="card command"><label>RUN UPGRADES <span id="research-metal">0 METAL</span></label><p class="research-help">Spend Metal between waves. Every upgrade lasts for this run.</p><div id="stat-upgrades"></div><label>COMMAND SYSTEMS <span id="research-count">0 INSTALLED</span></label><p class="research-help">Sequential systems advance one rank at a time.</p><div id="commands"></div></section></aside></section><footer><div class="run-summary"><span>RUN RECORD</span><b id="crush">CRUSH 000</b><b id="leaks">BREACHES 000</b><b id="earned">SALVAGE +000</b></div><div class="spacer"></div><button data-action="save">SAVE</button><button data-action="load">LOAD</button></footer></main>`;
  root.querySelector<HTMLElement>('[data-action="fence-tool"] small')!.textContent='DRAG A LINE · SOLID';
  root.querySelector<HTMLElement>('[data-action="wire-tool"] small')!.textContent='DRAG A PATH · SLOW';
  const researchCard=root.querySelector<HTMLElement>('.command')!,researchLabels=researchCard.querySelectorAll<HTMLLabelElement>(':scope > label'),researchHelp=researchCard.querySelectorAll<HTMLParagraphElement>('.research-help');
  researchLabels[0].innerHTML='TECHNOLOGY TREE <span id="research-metal">0 METAL</span>';
  researchLabels[1].remove(); researchHelp[0].textContent='Research persists for this run. Unlock foundations before their specialist technologies.'; researchHelp[1].remove();
  researchCard.querySelector('#stat-upgrades')?.remove();
  const sellButton=root.querySelector<HTMLButtonElement>('[data-action="sell"]')!,towerActions=document.createElement('div'),moveButton=document.createElement('button'),targetButton=document.createElement('button'),clearTargetButton=document.createElement('button');
  towerActions.className='tower-actions';
  moveButton.dataset.action='move';
  targetButton.dataset.action='set-ground-target';
  clearTargetButton.dataset.action='clear-ground-target';
  // Insert the wrapper before moving its anchor button into it.
  sellButton.before(towerActions);
  towerActions.append(moveButton,targetButton,clearTargetButton,sellButton);
  root.insertAdjacentHTML('beforeend','<div class="settings-gate" id="settings-gate" hidden role="dialog" aria-modal="true" aria-labelledby="settings-title"><section><header><label id="settings-title">AUDIO SETTINGS</label><button data-settings-close aria-label="Close settings">×</button></header><p>Changes are saved on this device.</p><label class="audio-setting">MUSIC <output data-audio-value="music">30%</output><input data-audio-setting="music" type="range" min="0" max="1" step="0.05" aria-label="Music volume"></label><label class="audio-setting">SOUND EFFECTS <output data-audio-value="effects">48%</output><input data-audio-setting="effects" type="range" min="0" max="1" step="0.05" aria-label="Sound effects volume"></label><button data-settings-close>DONE</button></section></div>');
  root.insertAdjacentHTML('beforeend','<div class="reset-gate" id="reset-gate" hidden role="dialog" aria-modal="true" aria-labelledby="reset-title"><section><label id="reset-title">RESTART CURRENT LEVEL?</label><p>Restart this level from wave one with starting Metal. This removes placed towers, Metal Walls, Barbed Wire, and run research upgrades.</p><div><button data-reset-choice="cancel">CANCEL</button><button class="danger" data-reset-choice="confirm">RESTART LEVEL</button></div></section></div>');
  const canvas = root.querySelector("canvas")!,
    shell = root.querySelector<HTMLElement>(".pf")!,
    arena = root.querySelector<HTMLElement>(".arena")!,
    selectedCard = root.querySelector<HTMLElement>(".selected")!,
    $ = <T extends HTMLElement = HTMLElement>(s: string) =>
      root.querySelector<T>(s)!;
  // Required choices must stay visible even when the build window is hidden or collapsed.
  const boonGate = document.createElement('div');
  boonGate.className = 'boon-gate';
  boonGate.hidden = true;
  boonGate.setAttribute('role', 'dialog');
  boonGate.setAttribute('aria-modal', 'true');
  boonGate.setAttribute('aria-labelledby', 'boon-title');
  const boonCard = $("#bonuses");
  boonCard.querySelector('label')!.id = 'boon-title';
  boonGate.append(boonCard);
  shell.append(boonGate);
  arena.append(selectedCard);
  const targetHint=document.createElement('div');targetHint.className='turret-target-hint';targetHint.hidden=true;targetHint.textContent='FOCUS GROUND — CLICK WITHIN RANGE · ESC CANCELS';arena.append(targetHint);
  selectedCard.classList.add("selected-popup");
  const upgradeCard = document.createElement("section");
  upgradeCard.className = "upgrade-hover-card";
  upgradeCard.hidden = true;
  upgradeCard.setAttribute("aria-live", "polite");
  arena.append(upgradeCard);
  const upgradeContent=document.createElement("div");upgradeCard.append(upgradeContent);
  const selectedWindow=makeGameWindow(selectedCard,"TOWER INSPECTOR");makeGameWindow(upgradeCard,"TOWER UPGRADES");
  makeGameWindow(root.querySelector<HTMLElement>("#settings-gate > section")!,"SETTINGS");
  makeGameWindow(root.querySelector<HTMLElement>("#reset-gate > section")!,"RESTART LEVEL");
  root.querySelector<HTMLSelectElement>('#battlefield-select')!.addEventListener('change',event=>{
    const map=(event.target as HTMLSelectElement).value;
    onAction({type:'select-map',map});
  });
  const difficulty = document.createElement("label");
  difficulty.className = "difficulty";
  difficulty.innerHTML =
    'HORDE INTENSITY <b id="difficulty-value">1×</b><input id="difficulty" type="range" min="1" max="40" value="1" aria-label="Horde packing intensity">';
  shell
    .querySelector("header")!
    .insertBefore(difficulty, shell.querySelector(".status"));
  difficulty
    .querySelector<HTMLInputElement>("input")!
    .addEventListener("input", (event) => {
      const value = +(event.target as HTMLInputElement).value;
      difficulty.querySelector("b")!.textContent = `${value}×`;
      onAction({ type: "difficulty", value });
    });
  const streamWidth = document.createElement("label");
  streamWidth.className = "difficulty";
  streamWidth.innerHTML =
    'STREAM WIDTH <b>60 WIDE</b><input type="range" min="1" max="100" value="60" aria-label="Zombie stream width">';
  shell.querySelector("header")!.insertBefore(streamWidth, shell.querySelector(".status"));
  streamWidth.querySelector<HTMLInputElement>("input")!.addEventListener("input", (event) => {
    const value = +(event.target as HTMLInputElement).value;
    streamWidth.querySelector("b")!.textContent = `${value} WIDE`;
    onAction({type:'stream-width',value});
  });
  const header = shell.querySelector("header")!,
    headerStack = document.createElement("div"),
    telemetry = document.createElement("div"),
    headerActions = document.createElement("div");
  headerStack.className = "header-stack";
  telemetry.className = "header-telemetry";
  headerActions.className = "header-actions";
  telemetry.append($(".hud"));
  $("#view-menu").append(difficulty, streamWidth);
  headerStack.append(telemetry);
  const timeControls=document.createElement('div');
  timeControls.className='time-controls';timeControls.setAttribute('role','group');timeControls.setAttribute('aria-label','Simulation speed');
  timeControls.innerHTML=`<button data-action="pause" class="time-pause" aria-label="Pause simulation" aria-pressed="false" title="Pause or resume [Space]">PAUSE</button>${[1,2,3,5].map(speed=>`<button data-simulation-speed="${speed}" aria-label="${speed}× simulation speed" aria-pressed="${speed===1}" title="Run at ${speed}× speed">${speed}×</button>`).join('')}`;
  headerActions.append($(".status"), $(".metrics"), timeControls, $(".soundtrack"), $(".view-actions"));
  // Move the wave control before replacing the header so it stays in the DOM.
  const waveButton = $<HTMLButtonElement>(".start-wave-top"),
    buildDock = root.querySelector<HTMLElement>("aside")!;
  waveButton.classList.add("wave-control");
  buildDock.insertBefore(waveButton, buildDock.firstChild);
  header.replaceChildren($(".brand"), headerStack, headerActions);
  makeGameWindow(buildDock,"BUILD COMMAND");
  root
    .querySelectorAll<HTMLButtonElement>("[data-tower]")
    .forEach(
      (button, index) =>
        (button.querySelector("em")!.textContent = `[${index + 1}]`),
    );
  root.querySelector<HTMLElement>("footer")!.hidden = true;
  const menuToggle = $<HTMLButtonElement>(".view-menu-toggle");
  const menu = $("#view-menu");
  const settingsGate=$("#settings-gate"),settingsOpen=$<HTMLButtonElement>("[data-settings-open]");
  const syncAudioSettings=(settings:Readonly<Record<AudioSetting,number>>)=>{
    (Object.entries(settings) as [AudioSetting,number][]).forEach(([setting,value])=>{
      $<HTMLInputElement>(`[data-audio-setting="${setting}"]`).value=String(value);
      $<HTMLOutputElement>(`[data-audio-value="${setting}"]`).value=`${Math.round(value*100)}%`;
    });
  };
  syncAudioSettings(audioSettings());
  onAudioSettingsChange(syncAudioSettings);
  const openSettings=()=>{syncAudioSettings(audioSettings());settingsGate.hidden=false;$<HTMLInputElement>('[data-audio-setting="music"]').focus();};
  const closeSettings=()=>{settingsGate.hidden=true;menuToggle.focus();};
  settingsOpen.addEventListener('click',openSettings);
  settingsGate.addEventListener('input',event=>{const input=(event.target as HTMLElement).closest<HTMLInputElement>('[data-audio-setting]');if(input)setAudioSetting(input.dataset.audioSetting as AudioSetting,Number(input.value));});
  settingsGate.addEventListener('click',event=>{if(event.target===settingsGate||((event.target as HTMLElement).closest('[data-settings-close]')))closeSettings();});
  const closeMenu = (restoreFocus = false) => {
    menu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) menuToggle.focus();
  };
  menuToggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", event => {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button) closeMenu(!button.dataset.settingsOpen);
  });
  root.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node) || !menu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
  root.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && !menu.contains(event.relatedTarget) && !menuToggle.contains(event.relatedTarget)) closeMenu();
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !settingsGate.hidden) { event.preventDefault();closeSettings();return; }
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });
  const buildTab = $<HTMLButtonElement>("#build-tab"),
    researchTab = $<HTMLButtonElement>("#research-tab");
  let research = false;
  let buildings = false;
  const buildingsTab=$<HTMLButtonElement>("#buildings-tab");
  let hoveredUpgrade: number | null = null;
  let hoveredQuickBranch: number | null = null;
  let lastQuickTowerId: number | null = null;
  let lastSelectedTowerId: number | null = null;
  let latestState: UIState | null = null;
  const statDelta = (value: number, precision: number) => {
    const rounded = Number(value.toFixed(precision));
    if (!rounded) return "";
    return `<em class="stat-delta ${rounded > 0 ? "gain" : "loss"}">${rounded > 0 ? "+" : ""}${rounded.toFixed(precision)}</em>`;
  };
  const rankInsignia = (rank: number) => {
    const stars = Math.min(5, Math.floor(rank / 20)),
      chevrons = Math.min(3, Math.floor((rank % 20) / 5)),
      stripes = rank % 5,
      title = rank === MAX_VETERANCY ? "LEGEND" : rank >= 75 ? "HEROIC" : rank >= 50 ? "ELITE" : rank >= 20 ? "VETERAN" : rank ? "FIELD" : "RECRUIT";
    return `<div class="rank-insignia rank-${rank}" role="img" aria-label="${title}, veterancy rank ${rank}"><span class="rank-marks">${Array.from({length:stars},()=>'<i class="rank-star"></i>').join("")}${Array.from({length:chevrons},()=>'<i class="rank-chevron"></i>').join("")}${Array.from({length:stripes},()=>'<i class="rank-stripe"></i>').join("") || '<i class="rank-recruit"></i>'}</span><small>${title}</small></div>`;
  };
  const renderTowerStats = (s: UIState) => {
    const chosen = s.selected ? TOWERS[s.selected.kind] : undefined;
    const stats = $("#tower-stats");
    if (!s.selected || !chosen) {
      stats.textContent = "Select a deployed tower to view its combat record and upgrades.";
      return;
    }
    const t = s.selected,
      statUpgrades = s.statUpgrades.flatMap((upgrade) => Array(upgrade.rank).fill(upgrade.id)),
      d = compileTower(t, s.bonuses, s.commandUpgrades, statUpgrades),
      upgraded = compileTower({...t,veterancy:0,veterancyXp:0},s.bonuses,s.commandUpgrades,statUpgrades),
      preview = hoveredUpgrade !== null && t.level < MAX_TOWER_LEVEL
        ? compileTower({...t, level:t.level + 1, branch:t.branch < 0 ? hoveredUpgrade : t.branch}, s.bonuses, s.commandUpgrades, statUpgrades)
        : undefined,
      rank = t.veterancy ?? veterancyLevel(t.veterancyXp ?? 0),
      xp = t.veterancyXp ?? 0,
      next = rank >= MAX_VETERANCY
        ? "MAX RANK"
        : `${Math.max(0,Math.ceil(veterancyXpForLevel(rank + 1) - xp))} KILLS TO RANK ${rank + 1}`,
      mods = [
        t.level ? `BRANCH: ${chosen.branches[t.branch]}` : "BASE CONFIGURATION",
        t.groundTarget ? `FOCUS: ${t.groundTarget.x.toFixed(1)}, ${t.groundTarget.y.toFixed(1)}` : "TARGETING: AUTO",
        ...s.commandUpgrades
          .filter((id) => (["tesla-overload","chain-conduction"].includes(id) && t.kind === "tesla") || id === "targeting-grid" || id === "ammunition-forge" || id.startsWith("repulsor-impact-"))
          .map((id) => COMMAND_UPGRADES.find((x) => x.id)?.name ?? id),
      ];
    const recordRow = (label:string,value:string) => `<div class="record-row"><span>${label}</span><b>${value}</b></div>`,
      signed=(value:number,format:(value:number)=>string,threshold=.005)=>Math.abs(value)<threshold?'<em class="stat-zero">—</em>':`<em class="${value>0?'gain':'loss'}">${value>0?'+':'−'}${format(Math.abs(value))}</em>`,
      statRow=(label:string,base:number,withoutVeterancy:number,total:number,format:(value:number)=>string,nextTotal?:number)=>`<div class="stat-row"><span>${label}</span><b>${format(base)}</b><b>${signed(withoutVeterancy-base,format)}</b><b>${signed(total-withoutVeterancy,format)}</b><b class="stat-total">${format(total)}${nextTotal===undefined?'':statDelta(nextTotal-total,label==='RATE'||label==='RADIUS'?1:0)}</b></div>`,
      number1=(value:number)=>value.toFixed(1),pressure=(value:number)=>formatPressure(value),rate=(value:number)=>`${value.toFixed(1)}/S`;
    stats.innerHTML = `${t.kind==='crusher'?`<p>MANUAL [G] · 8 × 10 jaw zone · ${d.damage.toFixed(0)} damage · ${d.cooldown.toFixed(1)}s recharge</p>`:''}<div class="rank-banner">${rankInsignia(rank)}<div><span>COMBAT RECORD</span><b>RANK ${rank} / ${MAX_VETERANCY}</b></div></div><div class="record-grid">${recordRow("KILLS",(t.kills ?? 0).toLocaleString())}${recordRow("VETERANCY",`RANK ${rank}`)}${recordRow("NEXT",next)}</div><div class="stat-table"><div class="stat-head"><span>STAT</span><span>BASE</span><span>UPGRADE</span><span>VET</span><span>TOTAL</span></div>${statRow("DAMAGE",chosen.damage,upgraded.damage,d.damage,number1,preview?.damage)}${statRow("PEAK",chosen.peakPressureKpa,upgraded.peakPressureKpa,d.peakPressureKpa,pressure,preview?.peakPressureKpa)}${statRow("RANGE",chosen.range,upgraded.range,d.range,number1,preview?.range)}${statRow("IMPULSE",chosen.force,upgraded.force,d.force,number1,preview?.force)}${statRow("RATE",1/chosen.cooldown,1/upgraded.cooldown,1/d.cooldown,rate,preview?1/preview.cooldown:undefined)}${statRow("RADIUS",chosen.radius,upgraded.radius,d.radius,number1,preview?.radius)}${t.kind==='tesla'?statRow("CHAIN",4,upgraded.chainTargets!,d.chainTargets!,value=>String(value),preview?.chainTargets):''}</div><div class="tower-config"><span>CONFIG</span><small>${mods.join(" · ")}</small></div>`;
  };
  const renderUpgradeCard = (s:UIState) => {
    const tower=s.upgradeMode?s.upgradeTarget:null;
    upgradeCard.hidden=!tower;
    if(!tower)return;
    if(lastQuickTowerId!==tower.id){lastQuickTowerId=tower.id;hoveredQuickBranch=null;}
    const chosen=TOWERS[tower.kind],branch=tower.branch>=0?tower.branch:hoveredQuickBranch??0,cost=towerUpgradeCost(tower.level),maxed=tower.level>=MAX_TOWER_LEVEL,
      statUpgrades=s.statUpgrades.flatMap(upgrade=>Array(upgrade.rank).fill(upgrade.id)),current=compileTower(tower,s.bonuses,s.commandUpgrades,statUpgrades),next=maxed?null:compileTower({...tower,level:tower.level+1,branch},s.bonuses,s.commandUpgrades,statUpgrades),
      blocked=maxed||s.phase==="won"||s.phase==="lost"||s.metal<cost;
    const value=(before:string,after:string,changed:boolean)=>`<b><span>${before}</span><i>→</i><strong class="${changed?'':'unchanged'}">${after}</strong></b>`,
      row=(label:string,before:number,after:number,format:(value:number)=>string,threshold=.001)=>`<div><span>${label}</span>${value(format(before),format(after),Math.abs(after-before)>threshold)}</div>`,
      stats=next?[row("DAMAGE",current.damage,next.damage,value=>value.toFixed(1)),row("PRESSURE",current.peakPressureKpa,next.peakPressureKpa,formatPressure,.5),row("RANGE",current.range,next.range,value=>value.toFixed(1)),row("RATE",1/current.cooldown,1/next.cooldown,value=>`${value.toFixed(2)}/s`),row("IMPULSE",current.force,next.force,value=>value.toFixed(2)),row("RADIUS",current.radius,next.radius,value=>value.toFixed(3)),...(tower.kind==='tesla'?[row("CHAIN",current.chainTargets!,next.chainTargets!,value=>String(value))]:[])].join(""):"<p>MAXIMUM OUTPUT</p>",
      button=(candidate:number,label:string)=>`<button data-quick-upgrade="${tower.id}" data-quick-branch="${candidate}" ${blocked?"disabled":""}><b>${label} <em>[${candidate===0?'Q':'E'}]</em></b><span>${maxed?"MAX":`${cost.toLocaleString()} M`}</span></button>`;
    renderMarkup(upgradeContent,`<header><span>${chosen.name.toUpperCase()}</span><b>LV ${tower.level}${maxed?" · MAX":` → ${tower.level+1}`}</b></header><div class="quick-stats">${stats}</div><div class="quick-upgrade-actions">${tower.branch<0?chosen.branches.map((name,index)=>button(index,name.toUpperCase())).join(""):button(tower.branch,"UPGRADE")}</div>`);
  };
  const renderCommandSystems = (s: UIState) => {
    const availability = (id: string) => commandUpgradeAvailability({phase:s.phase,metal:s.metal,commandUpgrades:s.commandUpgrades}, id);
    return COMMAND_UPGRADES.map(upgrade => {
      const rank=researchRank(s.commandUpgrades,upgrade.id),maxRank=upgrade.maxRank??1,ready=availability(upgrade.id),prerequisites=(upgrade.requires??[]).map(id=>COMMAND_UPGRADES.find(node=>node.id===id)!.name),maxed=rank>=maxRank;
      const state=maxed?'installed':ready.ok?'available':'locked',cost=researchCost(upgrade,rank),progress=Array.from({length:maxRank},(_,index)=>`<i class="${index<rank?'installed':''}"></i>`).join('');
      return `<button class="command-system tech-node ${state}" ${maxed||!ready.ok?'disabled':`data-command="${upgrade.id}"`}><b><em>${upgrade.category??'COMMAND'} · ${rank}/${maxRank}</em>${upgrade.name.toUpperCase()}</b><span class="cost">${maxed?'MAX':`${cost} METAL`}</span><small>${upgrade.description}</small><span class="tech-progress" aria-label="${rank} of ${maxRank} ranks researched">${progress}</span>${prerequisites.length?`<span class="tech-requires">↳ ${prerequisites.join(' + ')} rank 3</span>`:''}</button>`;
    }).join("");
  };
  const setPanel = (next: boolean) => {
    research = next;
    buildTab.classList.toggle("active", !next&&!buildings);
    buildingsTab.classList.toggle("active",buildings);
    root.querySelector<HTMLElement>(".buildings")?.toggleAttribute("hidden",!buildings);
    researchTab.classList.toggle("active", next);
    $(".tower").toggleAttribute("hidden", next||buildings);
    selectedCard.hidden =
      next || buildings || latestState?.upgradeMode === true || latestState?.targetMode === true || !latestState?.selected;
    root
      .querySelector<HTMLElement>(".command")
      ?.toggleAttribute("hidden", !next);
  };
  const changePanel=(next:boolean,showBuildings=false)=>{buildings=showBuildings;setPanel(next);root.dispatchEvent(new Event("build-panel-change"));};
  buildTab.onclick = () => changePanel(false);
  buildingsTab.onclick = () => changePanel(false,true);
  researchTab.onclick = () => changePanel(true);
  setPanel(false);
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button || button.disabled) return;
    if (button.dataset.view === "hide") {
      const hidden = shell.classList.toggle("controls-hidden");
      root.querySelector<HTMLElement>("aside")!.hidden = hidden;
      root.querySelector<HTMLElement>("footer")!.hidden = true;
      root.querySelector<HTMLElement>(".body")!.style.gridTemplateColumns =
        hidden ? "1fr" : "";
      button.textContent = hidden ? "SHOW UI" : "HIDE UI";
      return;
    }
    if (button.dataset.view === "full") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void shell.requestFullscreen();
      return;
    }
    if(button.dataset.quickUpgrade){
      onAction({type:"upgrade-tower",id:+button.dataset.quickUpgrade,branch:+button.dataset.quickBranch!});
      return;
    }
    if(button.dataset.simulationSpeed){onAction({type:'simulation-speed',value:Number(button.dataset.simulationSpeed) as 1|2|3|5});return;}
    const action = button.dataset.action;
    if (action === "reset") { $("#reset-gate").hidden = false; return; }
    const resetChoice=button.dataset.resetChoice;
    if(resetChoice){$("#reset-gate").hidden=true;if(resetChoice==='confirm')onAction({type:'reset'});return;}
    if (action === "new-game" && !window.confirm("Start a new game? This permanently clears the current run, autosave, custom level, and all run upgrades.")) return;
    if (action)
      onAction({
        type: action as
          | "dam-north" | "dam-south" | "dam-flood"
          | "slam-gates"
          | "pause"
          | "restart-wave"
          | "new-game"
          | "start-wave"
          | "skip-wave"
          | "continue-run"
          | "finish-run"
          | "sell"
          | "wall-tool"
          | "fence-tool"
          | "wire-tool"
          | "demolish-tool"
          | "upgrade-tool"
          | "move"
          | "set-ground-target"
          | "clear-ground-target",
      });
    if (button.dataset.unlock) {
      onAction({
        type: "unlock-tower",
        kind: button.dataset.unlock as keyof typeof TOWERS,
      });
      return;
    }
    if (button.dataset.tower)
      onAction({
        type: "select-tower",
        kind: button.dataset.tower as keyof typeof TOWERS,
      });
    if (button.dataset.upgrade)
      onAction({ type: "upgrade", branch: +button.dataset.upgrade });
    if (button.dataset.command)
      onAction({ type: "buy-command", id: button.dataset.command });
    if (button.dataset.stat)
      onAction({ type: "buy-stat", id: button.dataset.stat });
    if (button.dataset.bonus)
      onAction({ type: "bonus", id: button.dataset.bonus });
  });
  root.addEventListener("pointerover", (event) => {
    const quick = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-quick-branch]");
    if(quick&&hoveredQuickBranch!==+quick.dataset.quickBranch!){hoveredQuickBranch=+quick.dataset.quickBranch!;if(latestState)renderUpgradeCard(latestState);}
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-upgrade]");
    if (!button || button.disabled || hoveredUpgrade === +button.dataset.upgrade!) return;
    hoveredUpgrade = +button.dataset.upgrade!;
    if (latestState) renderTowerStats(latestState);
  });
  root.addEventListener("pointerout", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-upgrade]");
    const next = event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-upgrade]");
    if (!button || next === button || hoveredUpgrade === null) return;
    hoveredUpgrade = null;
    if (latestState) renderTowerStats(latestState);
  });
  return {
    canvas,
    update(s: UIState) {
      latestState = s;
      selectedCard.classList.toggle("has-selection",!!s.selected);
      if(s.selected?.id!==lastSelectedTowerId){lastSelectedTowerId=s.selected?.id??null;if(s.selected)selectedWindow.expand();}
      const chosen = s.selected ? TOWERS[s.selected.kind] : undefined,
        upgrade = 45 + (s.selected?.level ?? 0) * 35;
      $("#phase").textContent = s.phase === "checkpoint" ? "EXTRACTION READY" : s.phase.toUpperCase();
      root.querySelector("#extraction p")!.textContent=s.nextMapTitle?`Continue to ${s.nextMapTitle}. Deployed defenses are refunded; Metal and research carry over.`:"Secure the level now, or retain every defense and push into endless escalation.";
      $("#fps").textContent = `${s.fps | 0} FPS`;
      $("#ms").textContent = `${s.frameMs.toFixed(1)} MS`;
      $("#live").textContent = s.population.toLocaleString();
      ($('#battlefield-select') as HTMLSelectElement).value=s.mapId??'pressure-front-forest-1';
      $('#battlefield-help').textContent=s.dam?'Three floodable spillways · two switchable gates':(s.mapTitle??'Battlefield')+' · '+(s.mapBriefing??'Each battlefield keeps its own defense.');
      $('#dam-controls').hidden=!s.dam||s.mode!=='game';
      if(s.dam){
        const d=s.dam,canOperate=!s.paused&&['preparation','combat'].includes(s.phase);
        $('#reservoir-fill').style.width=`${d.reservoir}%`;
        $('#reservoir-status').textContent=d.surge>0?'FLOOD SURGE ACTIVE':`RESERVOIR ${Math.floor(d.reservoir)}%${d.reservoir<100?` · ${Math.ceil((100-d.reservoir)*.3)}s to refill`: ' · READY'}`;
        for(const [index,action] of ['dam-north','dam-south'].entries()){
          const button=$(`[data-action="${action}"]`) as HTMLButtonElement;
          button.textContent=`${index===0?'NORTH':'SOUTH'}: ${d.closed[index]?'CLOSED · OPEN':'OPEN · CLOSE'}`;
          button.disabled=!canOperate||d.surge>0||d.switchCooldown>0;
          button.setAttribute('aria-pressed',String(d.closed[index]));
        }
        const release=$('[data-action="dam-flood"]') as HTMLButtonElement;
        release.disabled=!canOperate||s.phase!=='combat'||d.reservoir<100||d.surge>0;
        release.title=s.paused?'Resume combat first':s.phase!=='combat'?'Start a wave first':d.reservoir<100?'Reservoir is refilling':'Unleash the reservoir';
      }
      const gates=s.crushers;
      $('#crusher-controls').hidden=s.mode!=='game'||!gates?.total;
      $('#crusher-status').textContent=gates?`${gates.ready}/${gates.total} READY${gates.ready?'':` · ${Math.ceil(gates.next)}s recharge`}`:'';
      const slam=$<HTMLButtonElement>('[data-action="slam-gates"]');slam.disabled=s.phase!=='combat'||s.paused||!gates?.ready;
      slam.title=s.paused?'Resume to slam':s.phase!=='combat'?'Start a wave to use the gates':'Slam every charged gate (G)';
      const preview=previewNextWave(s),progress=s.waveProgress,active=s.phase==='combat'||s.phase==='settling';
      $("#wave-status").hidden=s.mode!=='game';
      $("#wave-status-title").textContent=preview?`NEXT WAVE · ${preview.wave}`:`WAVE ${s.wave}`;
      $("#wave-status-count").textContent=preview?`${preview.total.toLocaleString()} enemies${preview.boss?' + boss':''}`:active&&progress?`${(progress.queued+progress.live).toLocaleString()} remaining`:s.phase==='lost'?'BASE LOST':'WAVE CLEARED';
      $("#wave-status-detail").textContent=preview?`${preview.enemies.map(enemy=>`${enemy.count.toLocaleString()} ${enemy.name}`).join(' · ')} · Clear reward: ${preview.payment} Metal. ${preview.enemies.at(-1)?.role??''}`:active&&progress?`${progress.live.toLocaleString()} on the field · ${progress.queued.toLocaleString()} still arriving${s.boss?.active?' · boss active':''}`:s.phase==='lost'?'Restart the wave to try again.':'Ready for your next decision.';

      timeControls.querySelectorAll<HTMLButtonElement>('[data-simulation-speed]').forEach(button=>{
        const selected=Number(button.dataset.simulationSpeed)===(s.simulationSpeed??1);
        button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
      });
      const pauseButton=timeControls.querySelector<HTMLButtonElement>('.time-pause')!;
      pauseButton.textContent=s.paused?'RESUME':'PAUSE';pauseButton.classList.toggle('active',s.paused);
      pauseButton.setAttribute('aria-pressed',String(s.paused));pauseButton.setAttribute('aria-label',s.paused?'Resume simulation':'Pause simulation');
      const skipReady=canFinishWaveEarly(s.waveProgress,s.phase,s.wave%10===0&&s.boss?.active!==false);
      const waveActive = s.mode === "game" && ["combat", "settling"].includes(s.phase),
        waveControl = waveActive
          ? skipReady
            ? {label: s.wave%3===0||s.wave>=10 ? "FINISH WAVE" : "NEXT WAVE", reason: "", action: "skip-wave" as const}
            : {label: s.paused ? "RESUME WAVE" : "PAUSE WAVE", reason: "", action: "pause" as const}
          : s.mode === "lab"
        ? {label: "LAB MODE", reason: "Lab mode runs continuously and has no waves."}
        : s.phase === "preparation"
          ? s.bonusChoices.length
            ? {label: "CHOOSE BOON", reason: "Choose a command boon in the popup to unlock the next wave."}
            : {label: "START WAVE", reason: "", action: "start-wave" as const}
          : s.phase === "checkpoint"
            ? {label: "EXTRACTION READY", reason: "Choose Continue in the sidebar to prepare the next wave, or Finish Run to extract."}
            : s.phase === "won"
              ? {label: "RUN COMPLETE", reason: "Run complete. Use Reset in the Build controls to begin another defense."}
            : s.phase === "lost"
                ? {label: "RESTART WAVE", reason: "", action: "restart-wave" as const}
                : s.paused
                  ? {label: "WAVE PAUSED", reason: "This wave is paused. Use Resume in the top bar or press Space to continue."}
                  : {label: "WAVE ACTIVE", reason: "A wave is already running. Clear the remaining horde before starting the next wave."};
      $("#metal").textContent = String(s.metal).padStart(3, "0");
      $("#base").textContent = `${s.baseHealth}%`;
      $("#level").textContent = String(s.level).padStart(2, "0");
      $("#wave").textContent = s.wave < s.waveCount ? `${s.wave} / ${s.waveCount}` : `${s.wave} / ∞`;
      $("#kills").textContent = s.kills.toLocaleString();
      $("#casualties").textContent = (s.casualties??0).toLocaleString();
      $("#friendly-fire").textContent = (s.friendlyFire??0).toLocaleString();
      $("#pressure").textContent = formatPressure(pressureKpa(s.maxPressure));
      $("#crush").textContent = `CRUSH ${s.crushKills.toLocaleString()}`;
      $("#leaks").textContent = `BREACHES ${s.leaks.toLocaleString()}`;
      $("#earned").textContent = `SALVAGE +${s.earned.toLocaleString()}`;
      $("#research-metal").textContent = `${s.metal.toLocaleString()} METAL`;
      difficulty.querySelector<HTMLInputElement>("input")!.value = String(s.difficulty);
      difficulty.querySelector("b")!.textContent = `${s.difficulty}×`;
      streamWidth.querySelector<HTMLInputElement>("input")!.value = String(s.streamWidth);
      streamWidth.querySelector("b")!.textContent = `${s.streamWidth} WIDE`;
      $("#selected-name").innerHTML = chosen
        ? `<span class="selection-icon tower-icon tower-icon-${s.selected!.kind}" aria-hidden="true"></span><span>${chosen.name.toUpperCase()} / LV ${s.selected!.level}</span>`
        : "TOWER INSPECTOR";
      renderTowerStats(s);
      renderUpgradeCard(s);
      root
        .querySelectorAll<HTMLButtonElement>("[data-tower]")
        .forEach((button, index) => {
          const kind=button.dataset.tower as keyof typeof TOWERS,
            unlock=s.towerUnlocks.find(candidate=>candidate.kind===kind),
            lockedTower=unlock&&!unlock.unlocked;
          button.classList.toggle("active",kind===s.selectedKind);
          button.classList.toggle("locked",!!lockedTower);
          button.disabled=s.phase==="won"||s.phase==="lost"||s.metal<(lockedTower?unlock.cost:TOWERS[kind].cost);
          if(lockedTower){button.dataset.unlock=kind;button.querySelector("em")!.textContent="LOCKED";button.querySelector(".cost")!.textContent=`UNLOCK ${unlock.cost.toLocaleString()} METAL`;}
          else{delete button.dataset.unlock;button.querySelector("em")!.textContent=`[${index+1}]`;button.querySelector(".cost")!.textContent=`${TOWERS[kind].cost} METAL`;}
        });
      const activeBuildAction=s.upgradeMode?'upgrade-tool':s.buildTool?`${s.buildTool}-tool`:'';
      root.querySelector<HTMLButtonElement>('[data-action="wall-tool"] em')!.textContent=s.upgradeMode?'[Q] BRANCH A':'[Q]';
      root.querySelector<HTMLButtonElement>('[data-action="wire-tool"] em')!.textContent=s.upgradeMode?'[E] BRANCH B':'[E]';
      root.querySelectorAll<HTMLElement>('[data-action$="-tool"]').forEach(element=>
        element.classList.toggle('active',element.dataset.action===activeBuildAction),
      );
      root.querySelectorAll("[data-upgrade]").forEach((element, index) => {
        const button = element as HTMLButtonElement,
          bad =
            !chosen ||
            s.selected!.level >= MAX_TOWER_LEVEL ||
            s.metal < upgrade ||
            (s.selected!.branch >= 0 && s.selected!.branch !== index);
        button.textContent = chosen
          ? s.selected!.level >= MAX_TOWER_LEVEL
            ? `${chosen.branches[index]} · MAX LEVEL`
            : `${chosen.branches[index]} · ${upgrade} METAL`
          : `BRANCH ${index ? "B" : "A"}`;
        button.disabled = bad;
      });
      root.querySelector<HTMLButtonElement>(
        '[data-action="restart-wave"]',
      )!.disabled = s.mode !== "game" || !["combat", "settling", "lost"].includes(s.phase);
      moveButton.disabled=!chosen||s.metal<TOWER_MOVE_COST;
      moveButton.textContent=s.moveMode?`PLACE TOWER · ${TOWER_MOVE_COST} METAL`:`MOVE · ${TOWER_MOVE_COST} METAL`;
      moveButton.classList.toggle('active',s.moveMode);
      targetButton.disabled=!chosen;
      targetButton.textContent=s.targetMode?'CLICK TARGET':s.selected?.groundTarget?'CHANGE TARGET':'FOCUS GROUND';
      targetButton.classList.toggle('active',s.targetMode);
      clearTargetButton.disabled=!chosen||!s.selected?.groundTarget;
      clearTargetButton.textContent='CLEAR TARGET';
      sellButton.disabled = !chosen;
      root.classList.toggle("upgrade-mode", s.upgradeMode);
      root.classList.toggle("target-mode",s.targetMode);
      targetHint.hidden=!s.targetMode;
      waveButton.dataset.action = waveControl.action ?? "start-wave";
      waveButton.classList.toggle("is-active", waveActive);
      waveButton.disabled = !!waveControl.reason;
      waveButton.textContent = waveControl.label;
      waveButton.title = waveControl.reason || (skipReady ? "95% cleared. Start the next wave while surviving enemies remain in play." : waveActive ? "Pause or resume the current wave." : "Start the next wave.");
      const bonusCard = $("#bonuses");
      const openingBoon = boonGate.hidden && s.bonusChoices.length > 0;
      boonGate.hidden = bonusCard.hidden = !s.bonusChoices.length;
      renderMarkup($("#bonus-choices"), s.bonusChoices
        .map(
          (choice) =>
            `<button data-bonus="${choice.id}"><b>${choice.name.toUpperCase()}</b><small>${choice.description}</small></button>`,
        )
        .join(""));
      if (openingBoon) bonusCard.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
      const extraction=$("#extraction");
      extraction.hidden=s.phase!=="checkpoint";
      $("#finish-run").textContent="FINISH RUN";
      renderMarkup($("#commands"), renderCommandSystems(s));
      setPanel(research);
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
