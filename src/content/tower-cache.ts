import {compileTower} from './index.ts';
import type {Tower,TowerDef} from '../contracts/index.ts';

/** Per-tower bounded cache. Motion, aim and cooldown do not change definitions. */
export function createTowerDefinitionCache(){
 const entries=new WeakMap<Tower,{key:string;definition:TowerDef}>();
 return (tower:Tower,bonuses:readonly string[],commands:readonly string[],stats:readonly string[])=>{
  const key=JSON.stringify([tower.kind,tower.level,tower.branch,tower.veterancy??null,tower.veterancy===undefined?tower.veterancyXp:0,bonuses,commands,stats]);
  const cached=entries.get(tower);if(cached?.key===key)return cached.definition;
  const definition=compileTower(tower,bonuses,commands,stats);entries.set(tower,{key,definition});return definition;
 };
}
