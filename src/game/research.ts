import {COMMAND_UPGRADES} from '../content/index.ts';
import type {RunModel} from '../contracts/index.ts';
import type {ActionResult} from './index.ts';

export const researchRank=(upgrades:readonly string[],id:string)=>upgrades.filter(upgrade=>upgrade===id).length;
export const researchCost=(upgrade:typeof COMMAND_UPGRADES[number],rank:number)=>Math.round(upgrade.cost*(1+Math.max(0,rank)*.16));

/** Shared by the purchase transaction and its UI so locked buttons explain the same rule. */
export function commandUpgradeAvailability(
  state: Pick<RunModel, 'phase' | 'metal'> & {commandUpgrades: readonly string[]},
  id: string,
): ActionResult {
  const upgrade = COMMAND_UPGRADES.find(candidate => candidate.id === id);
  if (!upgrade) return {ok:false, reason:'Unknown command upgrade.'};
  const rank=researchRank(state.commandUpgrades,id),maxRank=upgrade.maxRank??1;
  if (rank>=maxRank) return {ok:false, reason:'Maximum rank reached.'};
  if (state.phase === 'won' || state.phase === 'lost') return {ok:false, reason:'The run is over.'};
  const missing=upgrade.requires?.filter(prerequisite=>{const prerequisiteDef=COMMAND_UPGRADES.find(candidate=>candidate.id===prerequisite)!;return researchRank(state.commandUpgrades,prerequisite)<(prerequisiteDef.unlockRank??1);})??[];
  if (missing.length) {
    const names=missing.map(id=>COMMAND_UPGRADES.find(candidate => candidate.id === id)!.name);
    return {ok:false, reason:`Requires ${names.join(' + ')} rank 3.`};
  }
  const cost=researchCost(upgrade,rank);
  if (state.metal < cost) return {ok:false, reason:`Requires ${cost - state.metal} more Metal.`};
  return {ok:true};
}
