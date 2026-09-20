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
} from "../content/index.ts";
import { previewNextWave } from "../game/wave-preview.ts";
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
  root.innerHTML = `<main class="pf"><header><div class="brand">PRESSURE <i>FRONT</i><small>FLUID DEFENSE COMMAND</small></div><div class="hud" aria-label="Run telemetry"><div><span>METAL</span><b id="metal">000</b></div><div><span>INTEGRITY</span><b id="base">100%</b></div><div><span>LEVEL</span><b id="level">01</b></div><div><span>WAVE</span><b id="wave">00 / 10</b></div><div><span>KILLS</span><b id="kills">0000</b></div><div><span>MAX PRESSURE</span><b id="pressure">0.00</b></div><div><span>LIVE</span><b id="live">--</b></div></div><div class="status"><span class="led"></span><b id="phase">PREPARATION</b><span id="adapter">LOCAL GPU</span></div><div class="metrics"><b id="fps">-- FPS</b><b id="ms">-- MS</b></div><div class="view-actions"><button data-view="hide">HIDE UI</button><button data-view="full">FULLSCREEN</button></div></header><section class="body"><div class="arena"><canvas aria-label="Pressure Front battle arena"></canvas><div class="arena-label"><span>SECTOR 07 / CONTAINMENT GRID</span><span id="message">SYSTEM READY</span></div><p class="help" id="help">Select a tower, then place it on clear ground.</p></div><aside><div class="tabs"><button id="build-tab" class="active">BUILD</button><button id="research-tab">RESEARCH</button></div><section class="card controls"><label>SIMULATION CONTROL</label><div><button data-action="pause">PAUSE</button><button data-action="restart-wave">RESTART</button><button data-action="reset">RESET</button></div></section><section class="card extraction" id="extraction" hidden><label>EXTRACTION WINDOW</label><p>Secure the level now, or retain every defense and push into endless escalation.</p><div><button data-action="finish-run" id="finish-run">FINISH LEVEL</button><button data-action="continue-run">CONTINUE</button></div></section><section class="card tower"><label>DEFENSE BUILD ARRAY <span>1–8 SHORTCUTS</span></label><div class="defense-tools"><button data-action="wall-tool"><b>METAL WALL <em>[Q]</em></b><span class="cost">60</span></button><button data-action="wire-tool"><b>BARBED WIRE <em>[E]</em></b><span class="cost">45</span></button><button class="danger" data-action="demolish-tool"><b>DEMOLISH <em>[R]</em></b><small>WALLS + WIRE</small></button></div><div class="build-divider"><span>EMPLACEMENTS</span></div><div class="tower-grid">${(Object.keys(TOWERS) as (keyof typeof TOWERS)[]).map(tower).join("")}</div></section><section class="card bonuses" id="bonuses" hidden><label>COMMAND BOON — CHOOSE ONE</label><div id="bonus-choices"></div></section><section class="card selected"><label id="selected-name">TOWER INSPECTOR</label><div id="tower-stats" class="tower-stats">Select a deployed tower to view its combat record and upgrades.</div><div class="upgrade-buttons"><button data-upgrade="0">BRANCH A</button><button data-upgrade="1">BRANCH B</button></div><button class="danger wide" data-action="sell">SELL / RECOVER</button></section><section class="card command"><label>RUN UPGRADES <span id="research-metal">0 METAL</span></label><p class="research-help">Unlocks and upgrades use Metal and last for this run.</p><div id="stat-upgrades"></div><label>LOCAL RESEARCH <span id="research-count">0 INSTALLED</span></label><div id="commands"></div></section></aside></section><footer><div class="run-summary"><span>RUN RECORD</span><b id="crush">CRUSH 000</b><b id="leaks">BREACHES 000</b><b id="earned">SALVAGE +000</b></div><div class="spacer"></div><button data-action="start-wave">START WAVE</button><button data-action="save">SAVE</button><button data-action="load">LOAD</button></footer></main>`;
  root.insertAdjacentHTML('beforeend','<div class="reset-gate" id="reset-gate" hidden role="dialog" aria-modal="true" aria-labelledby="reset-title"><section><label id="reset-title">RESET CURRENT RUN?</label><p>This removes every placed tower, Metal Wall, Barbed Wire, weapon unlock, and research upgrade in this run.</p><div><button data-reset-choice="cancel">CANCEL</button><button class="danger" data-reset-choice="confirm">RESET RUN</button></div></section></div>');
  const canvas = root.querySelector("canvas")!,
    shell = root.querySelector<HTMLElement>(".pf")!,
    arena = root.querySelector<HTMLElement>(".arena")!,
    selectedCard = root.querySelector<HTMLElement>(".selected")!,
    $ = <T extends HTMLElement = HTMLElement>(s: string) =>
      root.querySelector<T>(s)!;
  arena.append(selectedCard);
  selectedCard.classList.add("selected-popup");
  const difficulty = document.createElement("label");
  difficulty.className = "difficulty";
  difficulty.innerHTML =
    'ZOMBIE FLOW <b id="difficulty-value">1×</b><input id="difficulty" type="range" min="1" max="40" value="1" aria-label="Zombie production multiplier">';
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
    'STREAM WIDTH / HORDE QUOTA <b>60 × 100K</b><input type="range" min="1" max="100" value="60" aria-label="Zombie stream width and horde quota">';
  shell.querySelector("header")!.insertBefore(streamWidth, shell.querySelector(".status"));
  streamWidth.querySelector<HTMLInputElement>("input")!.addEventListener("input", (event) => {
    const value = +(event.target as HTMLInputElement).value;
    streamWidth.querySelector("b")!.textContent = `${value} × 100K`;
    onAction({type:'stream-width',value});
  });
  root
    .querySelectorAll<HTMLButtonElement>("[data-tower]")
    .forEach(
      (button, index) =>
        (button.querySelector("em")!.textContent = `[${index + 1}]`),
    );
  root.querySelector<HTMLElement>("footer")!.hidden = true;
  const actions = root.querySelector(".view-actions")!;
  for (const [action, label] of [
    ["start-wave", "START WAVE"],
  ] as const) {
    const button = document.createElement("button");
    button.dataset.action = action;
    button.textContent = label;
    actions.prepend(button);
  }
  const buildTab = $<HTMLButtonElement>("#build-tab"),
    researchTab = $<HTMLButtonElement>("#research-tab");
  let research = false;
  let hoveredUpgrade: number | null = null;
  let latestState: UIState | null = null;
  const statDelta = (value: number, precision: number) => {
    const rounded = Number(value.toFixed(precision));
    if (!rounded) return "";
    return `<em class="stat-delta ${rounded > 0 ? "gain" : "loss"}">${rounded > 0 ? "+" : ""}${rounded.toFixed(precision)}</em>`;
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
        : `${Math.ceil(40 * (Math.pow(1.42, rank + 1) - 1) - xp)} XP TO RANK ${rank + 1}`,
      mods = [
        t.level ? `BRANCH: ${chosen.branches[t.branch]}` : "BASE CONFIGURATION",
        ...s.commandUpgrades
          .filter((id) => id === "targeting-grid" || id === "ammunition-forge" || id.startsWith("repulsor-impact-"))
          .map((id) => COMMAND_UPGRADES.find((x) => x.id)?.name ?? id),
      ];
    stats.innerHTML = `<div><span>KILLS</span><b>${(t.kills ?? 0).toLocaleString()}</b></div><div><span>VETERANCY</span><b>RANK ${rank} / ${MAX_VETERANCY}</b><small>${next}</small></div><div><span>OUTPUT${preview ? " · NEXT UPGRADE" : ""}</span><b>${d.damage.toFixed(1)} DMG ${preview ? statDelta(preview.damage - d.damage, 1) : ""} · ${d.range.toFixed(0)} RANGE ${preview ? statDelta(preview.range - d.range, 0) : ""}</b><small>${d.force.toFixed(0)} FORCE ${preview ? statDelta(preview.force - d.force, 0) : ""} · ${(1 / d.cooldown).toFixed(1)} PULSES/S ${preview ? statDelta(1 / preview.cooldown - 1 / d.cooldown, 1) : ""} · ${d.radius.toFixed(1)} RADIUS ${preview ? statDelta(preview.radius - d.radius, 1) : ""}</small></div><div><span>MODIFIERS</span><small>${mods.join(" · ")}</small></div>`;
  };
  const setPanel = (next: boolean) => {
    research = next;
    buildTab.classList.toggle("active", !next);
    researchTab.classList.toggle("active", next);
    for (const selector of [".controls", ".tower"])
      root
        .querySelector<HTMLElement>(selector)
        ?.toggleAttribute("hidden", next);
    selectedCard.hidden =
      next || !selectedCard.classList.contains("has-selection");
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
      root.querySelector<HTMLElement>("footer")!.hidden = hidden;
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
    const action = button.dataset.action;
    if (action === "reset") { $("#reset-gate").hidden = false; return; }
    const resetChoice=button.dataset.resetChoice;
    if(resetChoice){$("#reset-gate").hidden=true;if(resetChoice==='confirm')onAction({type:'reset'});return;}
    if (action === "new-game" && !window.confirm("Start a new game? This permanently clears the current run, autosave, custom level, and all run upgrades.")) return;
    if (action)
      onAction({
        type: action as
          | "pause"
          | "restart-wave"
          | "new-game"
          | "start-wave"
          | "continue-run"
          | "finish-run"
          | "sell"
          | "wall-tool"
          | "wire-tool"
          | "demolish-tool",
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
      $("#adapter").textContent = s.adapter;
      $("#fps").textContent = `${s.fps | 0} FPS`;
      $("#ms").textContent = `${s.frameMs.toFixed(1)} MS`;
      $("#message").textContent = s.message || "SYSTEM READY";
      $("#live").textContent = s.population.toLocaleString();
      $("#help").textContent = s.bonusChoices.length
        ? "Choose a command boon before deploying the next wave."
        : "Build during preparation. Click a deployed tower to inspect its combat record and upgrades.";
      $("#metal").textContent = String(s.metal).padStart(3, "0");
      $("#base").textContent = `${s.baseHealth}%`;
      $("#level").textContent = String(s.level).padStart(2, "0");
      $("#wave").textContent = s.wave < s.waveCount ? `${s.wave} / ${s.waveCount}` : `${s.wave} / ∞`;
      $("#kills").textContent = String(s.kills).padStart(4, "0");
      $("#pressure").textContent = s.maxPressure.toFixed(2);
      $("#crush").textContent = `CRUSH ${s.crushKills.toLocaleString()}`;
      $("#leaks").textContent = `BREACHES ${s.leaks.toLocaleString()}`;
      $("#earned").textContent = `SALVAGE +${s.earned.toLocaleString()}`;
      $("#research-count").textContent =
        `${s.commandUpgrades.length} INSTALLED`;
      $("#research-metal").textContent = `${s.metal.toLocaleString()} METAL`;
      difficulty.querySelector<HTMLInputElement>("input")!.value = String(s.difficulty);
      difficulty.querySelector("b")!.textContent = `${s.difficulty}×`;
      streamWidth.querySelector<HTMLInputElement>("input")!.value = String(s.streamWidth);
      streamWidth.querySelector("b")!.textContent = `${s.streamWidth} × 100K`;
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
      root
        .querySelectorAll<HTMLButtonElement>('[data-action="start-wave"]')
        .forEach(
          (button) =>
            (button.disabled =
              s.phase !== "preparation" || s.bonusChoices.length > 0),
        );
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
