import type {Rect, WorldMap} from '../contracts/index.ts';
import {validateEditorMap} from '../editor/index.ts';
import {createRun, type RunController} from '../game/index.ts';
import {terrainMounts} from '../game/terrain.ts';

export const AUTOSAVE_KEY = 'pressure-front.autosave.v1';
export const CHECKPOINT_KEY = 'pressure-front.checkpoint.v1';
export type Wire = Rect & {health:number; maxHealth:number; breached:boolean};
export interface Defense {
  map:WorldMap;
  spawnBaseline:Rect;
  builtWalls:Rect[];
  builtWires:Wire[];
  difficulty:number;
  streamWidth?:number;
}
export interface SavedDefense extends Defense {version?:1; runState:string}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const finite = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value:unknown):value is Record<string, unknown> => !!value && typeof value === 'object';
const rect = (value:unknown):value is Rect => object(value) && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height) && value.x >= 0 && value.y >= 0 && value.width > 0 && value.height > 0;
const same = (a:Rect, b:Rect) => a.x===b.x && a.y===b.y && a.width===b.width && a.height===b.height;

/** Validate a detached snapshot before any part of the running defense changes. */
export function decodeDefense(raw:string):SavedDefense {
  const saved:unknown = JSON.parse(raw);
  if (!object(saved) || (saved.version !== undefined && saved.version !== 1) || typeof saved.runState !== 'string') throw new Error('Invalid saved defense.');
  const map = saved.map;
  if (!object(map) || typeof map.id !== 'string' || !finite(map.width) || !finite(map.height) || map.width <= 0 || map.height <= 0 || !Array.isArray(map.obstacles) || !map.obstacles.every(rect) || !rect(map.spawn) || !object(map.goal) || !finite(map.goal.x) || !finite(map.goal.y) || map.goal.x < 0 || map.goal.x > map.width || map.goal.y < 0 || map.goal.y > map.height || !finite(map.goalRadius) || map.goalRadius <= 0) throw new Error('Invalid saved map.');
  if (!rect(saved.spawnBaseline) || !Array.isArray(saved.builtWalls) || !saved.builtWalls.every(rect) || !Array.isArray(saved.builtWires) || !saved.builtWires.every(wire => object(wire) && finite(wire.health) && finite(wire.maxHealth) && wire.health > 0 && wire.maxHealth > 0 && wire.health <= wire.maxHealth && typeof wire.breached === 'boolean' && rect(wire)) || !finite(saved.difficulty) || !Number.isInteger(saved.difficulty) || saved.difficulty < 1 || saved.difficulty > 40 || (saved.streamWidth !== undefined && (!finite(saved.streamWidth) || !Number.isInteger(saved.streamWidth) || saved.streamWidth < 1 || saved.streamWidth > 100))) throw new Error('Invalid saved structures or flow setting.');
  const defense = saved as unknown as SavedDefense;
  const dynamic = [...defense.builtWalls, ...defense.builtWires];
  // Collision/removal code uses object identity. Reconnect structures to map obstacles,
  // and keep breached wire out of collision even in older autosave snapshots.
  defense.map.obstacles = [
    ...defense.map.obstacles.filter(obstacle => !dynamic.some(segment => same(obstacle,segment))),
    ...defense.builtWalls,
    ...defense.builtWires.filter(wire => !wire.breached),
  ];
  const issue = validateEditorMap(defense.map);
  if (issue) throw new Error(issue);
  const candidate = createRun(defense.map);
  candidate.setBuildMounts(terrainMounts(defense.map));
  if (!candidate.load(defense.runState).ok) throw new Error('Invalid saved run.');
  return defense;
}

export function saveDefense(storage:Storage, key:string, run:RunController, defense:Defense):void {
  // Serialization has no storage side effects. Failed writes cannot partially update another slot.
  const snapshot:SavedDefense = {version:1, ...defense, runState:run.serialize()};
  storage.setItem(key, JSON.stringify(snapshot));
}

export function loadDefense(storage:Storage, key:string, run:RunController):SavedDefense {
  const raw = storage.getItem(key);
  if (!raw) throw new Error('No saved defense found.');
  const saved = decodeDefense(raw);
  const result = run.load(saved.runState, {map:saved.map, buildMounts:terrainMounts(saved.map)});
  if (!result.ok) throw new Error(result.reason);
  run.setSpawnMultiplier(saved.difficulty);
  return saved;
}
