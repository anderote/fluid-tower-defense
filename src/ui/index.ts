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
import "./style.css";
import "./popup.css";
import "./tower-identity.css";

export function createUI(
  root: HTMLElement,
  onAction: (action: GameAction) => void,
): GameUI {
  const tower = (id: keyof typeof TOWERS) => {
    const t = TOWERS[id];
    return `<button data-tower="${id}"><span class="tower-shape" aria-hidden="true"></span><b>${t.name.toUpperCase()} <em></em></b><span class="cost">${t.cost}</span></button>`;
  };
  root.innerHTML = `<main class="pf"><header><div class="brand">PRESSURE <i>FRONT</i><small>FLUID DEFENSE COMMAND</small></div><div class="hud" aria-label="Run telemetry"><div><span>METAL</span><b id="metal">000</b></div><div><span>INTEGRITY</span><b id="base">100%</b></div><div><span>LEVEL</span><b id="level">01</b></div><div><span>WAVE</span><b id="wave">00 / 10</b></div><div><span>KILLS</span><b id="kills">0000</b></div><div><span>MAX PRESSURE</span><b id="pressure">0.00</b></div><div><span>LIVE</span><b id="live">--</b></div></div><div class="status"><span class="led"></span><b id="phase">PREPARATION</b><span id="adapter">LOCAL GPU</span></div><div class="metrics"><b id="fps">-- FPS</b><b id="ms">-- MS</b></div><div class="view-actions"><button data-view="hide">HIDE UI</button><button data-view="full">FULLSCREEN</button></div></header><section class="body"><div class="arena"><canvas aria-label="Pressure Front battle arena"></canvas><div class="arena-label"><span>SECTOR 07 / CONTAINMENT GRID</span><span id="message">SYSTEM READY</span></div><p class="help" id="help">Select a tower, then place it on clear ground.</p></div><aside><div class="tabs"><button id="build-tab" class="active">BUILD</button><button id="research-tab">RESEARCH</button></div><section class="card controls"><label>SIMULATION CONTROL</label><div><button data-action="pause">PAUSE</button><button data-action="restart-wave">RESTART</button><button data-action="reset">RESET</button></div></section><section class="card extraction" id="extraction" hidden><label>EXTRACTION WINDOW</label><p>Secure the level now, or retain every defense and push into endless escalation.</p><div><button data-action="finish-run" id="finish-run">FINISH LEVEL</button><button data-action="continue-run">CONTINUE</button></div></section><section class="card tower"><label>DEFENSE BUILD ARRAY <span>1–8 SHORTCUTS</span></label><div class="defense-tools"><button data-action="wall-tool"><b>METAL WALL <em>[Q]</em></b><span class="cost">60</span></button><button data-action="wire-tool"><b>BARBED WIRE <em>[E]</em></b><span class="cost">45</span></button><button class="danger" data-action="demolish-tool"><b>DEMOLISH <em>[R]</em></b><small>WALLS + WIRE</small></button></div><div class="build-divider"><span>EMPLACEMENTS</span></div><div class="tower-grid">${(Object.keys(TOWERS) as (keyof typeof TOWERS)[]).map(tower).join("")}</div></section><section class="card bonuses" id="bonuses" hidden><label>COMMAND BOON — CHOOSE ONE</label><div id="bonus-choices"></div></section><section class="card selected"><label id="selected-name">TOWER INSPECTOR</label><div id="tower-stats" class="tower-stats">Select a deployed tower to view its combat record and upgrades.</div><div class="upgrade-buttons"><button data-upgrade="0">BRANCH A</button><button data-upgrade="1">BRANCH B</button></div><button class="danger wide" data-action="sell">SELL / RECOVER</button></section><section class="card command"><label>COMMAND XP <span id="command-xp">0 XP</span></label><div id="meta-upgrades"></div><label>LOCAL RESEARCH <span id="research-count">0 INSTALLED</span></label><div id="commands"></div></section></aside></section><footer><div class="run-summary"><span>RUN RECORD</span><b id="crush">CRUSH 000</b><b id="leaks">BREACHES 000</b><b id="earned">SALVAGE +000</b></div><div class="spacer"></div><button data-action="start-wave">START WAVE</button><button data-action="save">SAVE</button><button data-action="load">LOAD</button></footer></main>`;
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
    if (action === "new-game" && !window.confirm("Start a new game? This permanently clears the current run, autosave, custom level, Command XP, and all upgrades.")) return;
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
    if (button.dataset.meta)
      onAction({ type: "buy-meta", id: button.dataset.meta });
    if (button.dataset.bonus)
      onAction({ type: "bonus", id: button.dataset.bonus });
  });
  return {
    canvas,
    update(s: UIState) {
      const locked = s.phase === "settling" || s.phase === "combat",
        chosen = s.selected ? TOWERS[s.selected.kind] : undefined,
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
      $("#command-xp").textContent = `${s.commandXp} XP`;
      difficulty.querySelector<HTMLInputElement>("input")!.value = String(s.difficulty);
      difficulty.querySelector("b")!.textContent = `${s.difficulty}×`;
      $("#meta-upgrades").innerHTML = s.metaUpgrades
        .map((upgrade) => {
          const cost = Math.round(upgrade.cost * (1 + upgrade.rank * 0.55));
          const maxed = upgrade.rank >= upgrade.maxRank;
          return `<button data-meta="${upgrade.id}" ${maxed || s.commandXp < cost ? "disabled" : ""}><b>${upgrade.name.toUpperCase()} · ${upgrade.rank}/${upgrade.maxRank}</b><span class="cost">${maxed ? "MAX" : `${cost} XP`}</span><small>${upgrade.description}</small></button>`;
        })
        .join("");
      $("#selected-name").textContent = chosen
        ? `${chosen.name.toUpperCase()} / LV ${s.selected!.level}`
        : "TOWER INSPECTOR";
      const stats = $("#tower-stats");
      if (s.selected && chosen) {
        const t = s.selected,
          d = compileTower(t, [], s.commandUpgrades, s.metaUpgrades.flatMap(upgrade=>Array(upgrade.rank).fill(upgrade.id))),
          rank = t.veterancy ?? veterancyLevel(t.veterancyXp ?? 0),
          xp = t.veterancyXp ?? 0,
          next =
            rank >= MAX_VETERANCY
              ? "MAX RANK"
              : `${Math.ceil(40 * (Math.pow(1.42, rank + 1) - 1) - xp)} XP TO RANK ${rank + 1}`,
          mods = [
            t.level
              ? `BRANCH: ${chosen.branches[t.branch]}`
              : "BASE CONFIGURATION",
            ...s.commandUpgrades
              .filter(
                (id) =>
                  id === "targeting-grid" ||
                  id === "ammunition-forge" ||
                  id.startsWith("repulsor-impact-"),
              )
              .map((id) => COMMAND_UPGRADES.find((x) => x.id)?.name ?? id),
          ];
        stats.innerHTML = `<div><span>KILLS</span><b>${(t.kills ?? 0).toLocaleString()}</b></div><div><span>VETERANCY</span><b>RANK ${rank} / ${MAX_VETERANCY}</b><small>${next}</small></div><div><span>OUTPUT</span><b>${d.damage.toFixed(1)} DMG · ${d.range.toFixed(0)} RANGE</b><small>${d.force.toFixed(0)} FORCE · ${(1 / d.cooldown).toFixed(1)} PULSES/S</small></div><div><span>MODIFIERS</span><small>${mods.join(" · ")}</small></div>`;
      } else
        stats.textContent =
          "Select a deployed tower to view its combat record and upgrades.";
      root
        .querySelectorAll<HTMLButtonElement>("[data-tower]")
        .forEach((button, index) => {
          const kind=button.dataset.tower as keyof typeof TOWERS,
            unlock=s.towerUnlocks.find(candidate=>candidate.kind===kind),
            lockedTower=unlock&&!unlock.unlocked;
          button.classList.toggle("active",kind===s.selectedKind);
          button.classList.toggle("locked",!!lockedTower);
          if(lockedTower){button.dataset.unlock=kind;button.querySelector("em")!.textContent="LOCKED";button.querySelector(".cost")!.textContent=`UNLOCK ${unlock.cost.toLocaleString()} XP`;}
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
      $("#bonus-choices").innerHTML = s.bonusChoices
        .map(
          (choice) =>
            `<button data-bonus="${choice.id}"><b>${choice.name.toUpperCase()}</b><small>${choice.description}</small></button>`,
        )
        .join("");
      const extraction=$("#extraction");
      extraction.hidden=s.phase!=="checkpoint";
      $("#finish-run").textContent=`FINISH · +${s.extractionXp} XP`;
      $("#commands").innerHTML = COMMAND_UPGRADES.map(
        (research) =>
          `<button data-command="${research.id}" ${locked || s.commandUpgrades.includes(research.id) || s.metal < research.cost ? "disabled" : ""}><b>${s.commandUpgrades.includes(research.id) ? "INSTALLED · " : ""}${research.name.toUpperCase()}</b><span class="cost">${research.cost} METAL</span><small>${research.description}</small></button>`,
      ).join("");
      setPanel(research);
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
