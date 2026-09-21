import {COMMAND_UPGRADES} from '../content/index.ts';
import type {RunModel} from '../contracts/index.ts';
import type {ActionResult} from './index.ts';

/** Shared by the purchase transaction and its UI so locked buttons explain the same rule. */
export function commandUpgradeAvailability(
  state: Pick<RunModel, 'phase' | 'metal'> & {commandUpgrades: readonly string[]},
  id: string,
): ActionResult {
  const upgrade = COMMAND_UPGRADES.find(candidate => candidate.id === id);
  if (!upgrade) return {ok:false, reason:'Unknown command upgrade.'};
  if (state.commandUpgrades.includes(id)) return {ok:false, reason:'Installed.'};
  if (state.phase !== 'preparation') return {ok:false, reason:'Research is available between waves.'};
  const missing=upgrade.requires?.filter(prerequisite=>!state.commandUpgrades.includes(prerequisite))??[];
  if (missing.length) {
    const names=missing.map(id=>COMMAND_UPGRADES.find(candidate => candidate.id === id)!.name);
    return {ok:false, reason:`Requires ${names.join(' + ')}.`};
  }
  if (state.metal < upgrade.cost) return {ok:false, reason:`Requires ${upgrade.cost - state.metal} more Metal.`};
  return {ok:true};
}
