import {commandUpgradeAvailability} from "../game/research.ts";
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
import {formatPressure,pressureKpa} from "../sim/pressure/model.ts";
import {BASE_WALL_PRESSURE_RESISTANCE} from "../sim/walls/model.ts";
import "./style.css";
import "./popup.css";
import "./tower-identity.css";

export function createUI(
  root: HTMLElement,
  onAction: (action: GameAction) => void,
): GameUI {
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
  root.innerHTML = `<main class="pf"><header><div class="brand">PRESSURE <i>FRONT</i><small>FLUID DEFENSE COMMAND</small></div><div class="hud" aria-label="Run telemetry"><div><span>METAL</span><b id="metal">000</b></div><div><span>INTEGRITY</span><b id="base">100%</b></div><div><span>LEVEL</span><b id="level">01</b></div><div><span>WAVE</span><b id="wave">00 / 10</b></div><div><span>KILLS</span><b id="kills">0000</b></div><div><span>MAX PRESSURE</span><b id="pressure">0 kPa</b></div><div><span>LIVE</span><b id="live">--</b></div></div><div class="status"><span class="led"></span><b id="phase">PREPARATION</b><span id="adapter">LOCAL GPU</span></div><div class="metrics"><b id="fps">-- FPS</b><b id="ms">-- MS</b></div><div class="simulation-controls" role="group" aria-label="Simulation controls"><button data-action="pause">PAUSE</button><button data-action="restart-wave">RESTART WAVE</button><button data-action="reset">RESTART LEVEL</button><section class="soundtrack" aria-label="Red Alert music player"></section></div><div class="view-actions"><button class="view-menu-toggle" aria-label="More options" aria-expanded="false" aria-controls="view-menu" title="More options"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button><div id="view-menu" class="view-menu" hidden><button data-action="new-game">NEW GAME</button><a class="dam-map-link" href="/?map=dam">THUNDERHEAD DAM · NEW MAP</a><a class="dam-map-link" href="/">CAMPAIGN</a><button data-view="hide">HIDE UI</button><button data-view="full">FULLSCREEN</button></div></div><button class="start-wave-top" data-action="start-wave">START WAVE</button></header><section class="body"><div class="arena"><canvas aria-label="Pressure Front battle arena"></canvas><div class="arena-label"><span>SECTOR 07 / CONTAINMENT GRID</span><span id="message">SYSTEM READY</span></div><p class="help" id="help">Select a tower, then place it on clear ground.</p></div><aside><section class="card battlefield-picker"><label for="battlefield-select">BATTLEFIELD</label><select id="battlefield-select" aria-label="Battlefield" title="Separate saves. Switching during a wave resumes from the last preparation save."><option value="campaign">Campaign</option><option value="dam">Thunderhead Dam · NEW</option></select><small id="battlefield-help">Each battlefield keeps its own defense.</small></section><section class="card wave-status" id="wave-status" aria-label="Wave progress"><b id="wave-status-title"></b><p id="wave-status-count"></p><small id="wave-status-detail"></small></section><section class="card crusher-controls" id="crusher-controls" hidden><b>HYDRAULIC CRUSHERS</b><p id="crusher-status"></p><button data-action="slam-gates">SLAM GATES [G]</button><small>Let the lane pack, then slam. Dense crowds take extra crush damage.</small></section><section class="card dam-controls" id="dam-controls" hidden><b>THUNDERHEAD DAM</b><small>NORTH + SOUTH: floodable spillways. CENTER: always-open dry bypass.</small><div class="reservoir"><span id="reservoir-fill"></span></div><p id="reservoir-status"></p><div class="gate-buttons"><button data-action="dam-north">NORTH GATE</button><button data-action="dam-south">SOUTH GATE</button></div><button class="flood-release" data-action="dam-flood">RELEASE FLOOD [F]</button><small>Floods hit only the two water channels. Defend the dry center with towers. Closed gates stop water too. Refills in 30 combat seconds.</small></section><div class="tabs"><button id="build-tab" class="active">BUILD</button><button id="research-tab">RESEARCH</button></div><section class="card extraction" id="extraction" hidden><label>EXTRACTION WINDOW</label><p>Secure the level now, or retain every defense and push into endless escalation.</p><div><button data-action="finish-run" id="finish-run">FINISH LEVEL</button><button data-action="continue-run">CONTINUE</button></div></section><section class="card tower"><label>DEFENSE BUILD ARRAY <span>1–9 SHORTCUTS</span></label><div class="defense-tools"><button data-action="wall-tool"><b>METAL WALL <em>[Q]</em></b><small>${formatPressure(BASE_WALL_PRESSURE_RESISTANCE)} STRUCTURAL YIELD</small><span class="cost">60</span></button><button data-action="wire-tool"><b>BARBED WIRE <em>[E]</em></b><small>7.0 kPa BREACH RATING</small><span class="cost">45</span></button><button data-action="upgrade-tool"><b>UPGRADE <em>[U]</em></b><small>HOVER TOWERS</small></button><button class="danger" data-action="demolish-tool"><b>DEMOLISH <em>[R]</em></b><small>WALLS + WIRE</small></button></div><div class="build-divider"><span>EMPLACEMENTS</span></div><div class="tower-grid">${(Object.keys(TOWERS) as (keyof typeof TOWERS)[]).map(tower).join("")}</div></section><section class="card bonuses" id="bonuses" hidden><label>COMMAND BOON — CHOOSE ONE</label><div id="bonus-choices"></div></section><section class="card selected"><label id="selected-name">TOWER INSPECTOR</label><div id="tower-stats" class="tower-stats">Select a deployed tower to view its combat record and upgrades.</div><div class="upgrade-buttons"><button data-upgrade="0">BRANCH A</button><button data-upgrade="1">BRANCH B</button></div><button class="danger wide" data-action="sell">SELL / RECOVER</button></section><section class="card command"><label>RUN UPGRADES <span id="research-metal">0 METAL</span></label><p class="research-help">Upgrades use Metal and last for this run.</p><div id="stat-upgrades"></div><label>LOCAL RESEARCH <span id="research-count">0 INSTALLED</span></label><div id="commands"></div></section></aside></section><footer><div class="run-summary"><span>RUN RECORD</span><b id="crush">CRUSH 000</b><b id="leaks">BREACHES 000</b><b id="earned">SALVAGE +000</b></div><div class="spacer"></div><button data-action="save">SAVE</button><button data-action="load">LOAD</button></footer></main>`;
  root.insertAdjacentHTML('beforeend','<div class="reset-gate" id="reset-gate" hidden role="dialog" aria-modal="true" aria-labelledby="reset-title"><section><label id="reset-title">RESTART CURRENT LEVEL?</label><p>Restart this level from wave one with starting Metal. This removes placed towers, Metal Walls, Barbed Wire, and run research upgrades.</p><div><button data-reset-choice="cancel">CANCEL</button><button class="danger" data-reset-choice="confirm">RESTART LEVEL</button></div></section></div>');
  const canvas = root.querySelector("canvas")!,
    shell = root.querySelector<HTMLElement>(".pf")!,
    arena = root.querySelector<HTMLElement>(".arena")!,
    selectedCard = root.querySelector<HTMLElement>(".selected")!,
    $ = <T extends HTMLElement = HTMLElement>(s: string) =>
      root.querySelector<T>(s)!;
  // Required between-wave choices must precede the scrollable build inventory.
  root.querySelector("aside")!.insertBefore($("#bonuses"), $(".tower"));
  arena.append(selectedCard);
  selectedCard.classList.add("selected-popup");
  const upgradeCard = document.createElement("section");
  upgradeCard.className = "upgrade-hover-card";
  upgradeCard.hidden = true;
  upgradeCard.setAttribute("aria-live", "polite");
  arena.append(upgradeCard);
  root.querySelector<HTMLSelectElement>('#battlefield-select')!.addEventListener('change',event=>{
    const map=(event.target as HTMLSelectElement).value as 'campaign'|'dam';
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
    'STREAM WIDTH <b>60</b><input type="range" min="1" max="100" value="60" aria-label="Zombie stream width">';
  shell.querySelector("header")!.insertBefore(streamWidth, shell.querySelector(".status"));
  streamWidth.querySelector<HTMLInputElement>("input")!.addEventListener("input", (event) => {
    const value = +(event.target as HTMLInputElement).value;
    streamWidth.querySelector("b")!.textContent = `${value}`;
    onAction({type:'stream-width',value});
  });
  root
    .querySelectorAll<HTMLButtonElement>("[data-tower]")
    .forEach(
      (button, index) =>
        (button.querySelector("em")!.textContent = `[${index + 1}]`),
    );
  root.querySelector<HTMLElement>("footer")!.hidden = true;
  const menuToggle = $<HTMLButtonElement>(".view-menu-toggle");
  const menu = $("#view-menu");
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
    if ((event.target as HTMLElement).closest("button")) closeMenu(true);
  });
  root.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node) || !menu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
  root.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && !menu.contains(event.relatedTarget) && !menuToggle.contains(event.relatedTarget)) closeMenu();
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });
  const buildTab = $<HTMLButtonElement>("#build-tab"),
    researchTab = $<HTMLButtonElement>("#research-tab");
  let research = false;
  let hoveredUpgrade: number | null = null;
  let hoveredQuickBranch: number | null = null;
  let lastQuickTowerId: number | null = null;
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
        ...s.commandUpgrades
          .filter((id) => (id === "tesla-overload" && t.kind === "tesla") || id === "targeting-grid" || id === "ammunition-forge" || id.startsWith("repulsor-impact-"))
          .map((id) => COMMAND_UPGRADES.find((x) => x.id)?.name ?? id),
      ];
    const row = (label:string,value:string) => `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`;
    stats.innerHTML = `${t.kind==='crusher'?`<p>MANUAL [G] · 8 × 10 jaw zone · ${d.damage.toFixed(0)} damage, up to 2× when packed · ${d.cooldown.toFixed(1)}s recharge</p>`:''}<div class="rank-banner">${rankInsignia(rank)}<div><span>COMBAT RECORD</span><b>RANK ${rank} / ${MAX_VETERANCY}</b></div></div><div class="stat-grid">${row("KILLS",(t.kills ?? 0).toLocaleString())}${row("VETERANCY",`RANK ${rank}`)}${row("NEXT",next)}${row(`PEAK${preview ? " · NEXT" : ""}`,`${formatPressure(d.peakPressureKpa)}${preview ? statDelta(preview.peakPressureKpa-d.peakPressureKpa,0) : ""}`)}${row("RANGE",`${d.range.toFixed(0)}${preview ? statDelta(preview.range-d.range,0) : ""}`)}${row("IMPULSE",`${d.force.toFixed(0)}${preview ? statDelta(preview.force-d.force,0) : ""}`)}${row("RATE",`${(1/d.cooldown).toFixed(1)} /S${preview ? statDelta(1/preview.cooldown-1/d.cooldown,1) : ""}`)}${row("RADIUS",`${d.radius.toFixed(1)}${preview ? statDelta(preview.radius-d.radius,1) : ""}`)}</div><div class="tower-config"><span>CONFIG</span><small>${mods.join(" · ")}</small></div>`;
  };
  const renderUpgradeCard = (s:UIState) => {
    const tower=s.upgradeMode?s.upgradeTarget:null;
    upgradeCard.hidden=!tower;
    if(!tower)return;
    if(lastQuickTowerId!==tower.id){lastQuickTowerId=tower.id;hoveredQuickBranch=null;}
    const chosen=TOWERS[tower.kind],branch=tower.branch>=0?tower.branch:hoveredQuickBranch??0,cost=towerUpgradeCost(tower.level),maxed=tower.level>=MAX_TOWER_LEVEL,
      statUpgrades=s.statUpgrades.flatMap(upgrade=>Array(upgrade.rank).fill(upgrade.id)),current=compileTower(tower,s.bonuses,s.commandUpgrades,statUpgrades),next=maxed?null:compileTower({...tower,level:tower.level+1,branch},s.bonuses,s.commandUpgrades,statUpgrades),
      blocked=maxed||s.phase==="won"||s.phase==="lost"||s.metal<cost;
    const value=(before:string,after:string)=>`<b><span>${before}</span><i>→</i><strong>${after}</strong></b>`,
      row=(label:string,before:number,after:number,format:(value:number)=>string,threshold=.001)=>Math.abs(after-before)<=threshold?"":`<div><span>${label}</span>${value(format(before),format(after))}</div>`,
      stats=next?[row("DAMAGE",current.damage,next.damage,value=>value.toFixed(1)),row("PRESSURE",current.peakPressureKpa,next.peakPressureKpa,formatPressure,.5),row("RANGE",current.range,next.range,value=>value.toFixed(1)),row("RATE",1/current.cooldown,1/next.cooldown,value=>`${value.toFixed(1)}/s`),row("IMPULSE",current.force,next.force,value=>value.toFixed(1)),row("RADIUS",current.radius,next.radius,value=>value.toFixed(1))].join(""):"<p>MAXIMUM OUTPUT</p>",
      button=(candidate:number,label:string)=>`<button data-quick-upgrade="${tower.id}" data-quick-branch="${candidate}" ${blocked?"disabled":""}><b>${label}</b><span>${maxed?"MAX":`${cost.toLocaleString()} M`}</span></button>`;
    renderMarkup(upgradeCard,`<header><span>${chosen.name.toUpperCase()}</span><b>LV ${tower.level}${maxed?" · MAX":` → ${tower.level+1}`}</b></header><div class="quick-stats">${stats}</div><div class="quick-upgrade-actions">${tower.branch<0?chosen.branches.map((name,index)=>button(index,name.toUpperCase())).join(""):button(tower.branch,"UPGRADE")}</div>`);
  };
  const setPanel = (next: boolean) => {
    research = next;
    buildTab.classList.toggle("active", !next);
    researchTab.classList.toggle("active", next);
    $(".tower").toggleAttribute("hidden", next);
    selectedCard.hidden =
      next || latestState?.upgradeMode === true || !selectedCard.classList.contains("has-selection");
    root
      .querySelector<HTMLElement>(".command")
      ?.toggleAttribute("hidden", !next);
  };
  buildTab.onclick = () => setPanel(false);
  researchTab.onclick = () => setPanel(true);
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
          | "continue-run"
          | "finish-run"
          | "sell"
          | "wall-tool"
          | "wire-tool"
          | "demolish-tool"
          | "upgrade-tool",
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
      const chosen = s.selected ? TOWERS[s.selected.kind] : undefined,
        upgrade = 45 + (s.selected?.level ?? 0) * 35;
      $("#phase").textContent = s.phase === "checkpoint" ? "EXTRACTION READY" : s.phase.toUpperCase();
      root.querySelector(".arena-label > span")!.textContent=s.mapTitle?.toUpperCase()??"SECTOR 07 / CONTAINMENT GRID";
      root.querySelector("#extraction p")!.textContent=s.nextMapTitle?`Continue to ${s.nextMapTitle}. Deployed defenses are refunded; Metal and research carry over.`:"Secure the level now, or retain every defense and push into endless escalation.";
      $("#adapter").textContent = s.adapter;
      $("#fps").textContent = `${s.fps | 0} FPS`;
      $("#ms").textContent = `${s.frameMs.toFixed(1)} MS`;
      $("#message").textContent = s.message || "SYSTEM READY";
      $("#live").textContent = s.population.toLocaleString();
      ($('#battlefield-select') as HTMLSelectElement).value=s.dam?'dam':'campaign';
      $('#battlefield-help').textContent=s.dam?'Two floodable spillways · dry central bypass':'Campaign · '+(s.mapTitle??'Pine Valley');
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

      const waveControl = s.mode === "lab"
        ? {label: "LAB MODE", reason: "Lab mode runs continuously and has no waves."}
        : s.phase === "preparation"
          ? s.bonusChoices.length
            ? {label: "CHOOSE BOON", reason: "Choose a command boon at the top of the sidebar to unlock the next wave."}
            : {label: "START WAVE", reason: ""}
          : s.phase === "checkpoint"
            ? {label: "EXTRACTION READY", reason: "Choose Continue in the sidebar to prepare the next wave, or Finish Run to extract."}
            : s.phase === "won"
              ? {label: "RUN COMPLETE", reason: "Run complete. Use Reset in the Build controls to begin another defense."}
              : s.phase === "lost"
                ? {label: "BASE LOST", reason: "The base was lost. Use Restart in the Build controls to retry with your defenses."}
                : s.paused
                  ? {label: "WAVE PAUSED", reason: "This wave is paused. Use Resume in the top bar or press Space to continue."}
                  : {label: "WAVE ACTIVE", reason: "A wave is already running. Clear the remaining horde before starting the next wave."};
      $("#help").textContent = s.upgradeMode
        ? "UPGRADE MODE [U] · Hover a tower to preview, then click Upgrade. Press U or Esc to exit."
        : s.selectedKind==='crusher' ? "CRUSHER · Open left ↔ right; striped jaws are solid. Place across a lane with both mouths clear. Press G to slam." : waveControl.reason || "Build during preparation. Click a deployed tower to inspect its combat record and upgrades.";
      $("#metal").textContent = String(s.metal).padStart(3, "0");
      $("#base").textContent = `${s.baseHealth}%`;
      $("#level").textContent = String(s.level).padStart(2, "0");
      $("#wave").textContent = s.wave < s.waveCount ? `${s.wave} / ${s.waveCount}` : `${s.wave} / ∞`;
      $("#kills").textContent = String(s.kills).padStart(4, "0");
      $("#pressure").textContent = formatPressure(pressureKpa(s.maxPressure));
      $("#crush").textContent = `CRUSH ${s.crushKills.toLocaleString()}`;
      $("#leaks").textContent = `BREACHES ${s.leaks.toLocaleString()}`;
      $("#earned").textContent = `SALVAGE +${s.earned.toLocaleString()}`;
      $("#research-count").textContent =
        `${s.commandUpgrades.length} INSTALLED`;
      $("#research-metal").textContent = `${s.metal.toLocaleString()} METAL`;
      difficulty.querySelector<HTMLInputElement>("input")!.value = String(s.difficulty);
      difficulty.querySelector("b")!.textContent = `${s.difficulty}×`;
      streamWidth.querySelector<HTMLInputElement>("input")!.value = String(s.streamWidth);
      streamWidth.querySelector("b")!.textContent = `${s.streamWidth}`;
      renderMarkup($("#stat-upgrades"), s.statUpgrades
        .map((upgrade) => {
          const cost = Math.round(upgrade.cost * (1 + upgrade.rank * 0.55));
          const maxed = upgrade.rank >= upgrade.maxRank;
          return `<button data-stat="${upgrade.id}" ${maxed || s.phase==="won" || s.phase==="lost" || s.metal < cost ? "disabled" : ""}><b>${upgrade.name.toUpperCase()} · ${upgrade.rank}/${upgrade.maxRank}</b><span class="cost">${maxed ? "MAX" : `${cost} METAL`}</span><small>${upgrade.description}</small></button>`;
        })
        .join(""));
      $("#selected-name").textContent = chosen
        ? `${chosen.name.toUpperCase()} / LV ${s.selected!.level}`
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
        '[data-action="pause"]',
      )!.textContent = s.paused ? "RESUME" : "PAUSE";
      root.querySelector<HTMLButtonElement>(
        '[data-action="restart-wave"]',
      )!.disabled = s.mode !== "game" || !["combat", "settling", "lost"].includes(s.phase);
      root.querySelector<HTMLButtonElement>('[data-action="sell"]')!.disabled =
        !chosen;
      root.classList.toggle("upgrade-mode", s.upgradeMode);
      root
        .querySelectorAll<HTMLButtonElement>('[data-action="start-wave"]')
        .forEach(button => {
          button.disabled = !!waveControl.reason;
          button.textContent = waveControl.label;
          button.title = waveControl.reason || "Start the next wave.";
          button.setAttribute("aria-describedby", "help");
        });
      const bonusCard = $("#bonuses");
      bonusCard.hidden = !s.bonusChoices.length;
      renderMarkup($("#bonus-choices"), s.bonusChoices
        .map(
          (choice) =>
            `<button data-bonus="${choice.id}"><b>${choice.name.toUpperCase()}</b><small>${choice.description}</small></button>`,
        )
        .join(""));
      const extraction=$("#extraction");
      extraction.hidden=s.phase!=="checkpoint";
      $("#finish-run").textContent="FINISH RUN";
      renderMarkup($("#commands"), COMMAND_UPGRADES.map(
        (research) =>
          `<button data-command="${research.id}" ${!commandUpgradeAvailability({phase:s.phase,metal:s.metal,commandUpgrades:s.commandUpgrades},research.id).ok ? "disabled" : ""}><b>${s.commandUpgrades.includes(research.id) ? "INSTALLED · " : ""}${research.name.toUpperCase()}</b><span class="cost">${research.cost} METAL</span><small>${research.description}</small></button>`,
      ).join(""));
      setPanel(research);
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
