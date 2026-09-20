import type {UIState} from '../contracts/index.ts';
import {BOSS_PHASE} from '../sim/bosses/model.ts';

const PHASES: Record<number, {label:string; hint:string}> = {
  [BOSS_PHASE.advance]: {label:'ADVANCING', hint:'Clear the escort before it reaches your defenses.'},
  [BOSS_PHASE.brace]: {label:'BRACING', hint:'Charge imminent — the Bulldozer is winding up.'},
  [BOSS_PHASE.charge]: {label:'CHARGING', hint:'High-speed push through the crowd.'},
  [BOSS_PHASE.recover]: {label:'RECOVERING', hint:'Movement slowed — use this window to deal damage.'},
  [BOSS_PHASE.dead]: {label:'DEFEATED', hint:'Clear the remaining enemies to finish the wave.'},
  [BOSS_PHASE.leaked]: {label:'BREACHED', hint:'The Bulldozer reached the base.'},
};

export function bossStatus(state: Pick<UIState, 'mode' | 'phase' | 'boss'>) {
  const boss = state.boss;
  if (state.mode !== 'game' || !['combat','settling','lost'].includes(state.phase) || !boss) return null;
  const phase = PHASES[boss.phase];
  if (!phase || !Number.isFinite(boss.health) || !Number.isFinite(boss.maxHealth) || boss.maxHealth <= 0) return null;
  if (!boss.active && boss.phase !== BOSS_PHASE.dead && boss.phase !== BOSS_PHASE.leaked) return null;
  const health = Math.max(0, Math.min(boss.maxHealth, boss.health));
  return {...phase, health, maxHealth:boss.maxHealth, percent:health / boss.maxHealth * 100};
}
