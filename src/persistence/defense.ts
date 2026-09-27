import {validDam} from '../content/dam.ts';
import type {Rect, WorldMap} from '../contracts/index.ts';
import {validateEditorMap} from '../editor/index.ts';
import {createRun, type RunController} from '../game/index.ts';
import {clearPlayerTerrain,terrainMounts,wallMountCells} from '../game/terrain.ts';
import type {BarrierPost} from '../game/post-barriers.ts';

export const AUTOSAVE_KEY = 'pressure-front.autosave.v1';
export const CHECKPOINT_KEY = 'pressure-front.checkpoint.v1';
export type Wire = Rect & {health:number; maxHealth:number; breached:boolean};
export type Fence = Rect & {health:number; maxHealth:number};
export interface Defense {
  map:WorldMap;
  spawnBaseline:Rect;
  builtWalls:Rect[];
  builtWires:Wire[];
  builtFences?:Fence[];
  wirePosts?:BarrierPost[];
  fencePosts?:BarrierPost[];
  difficulty:number;
  streamWidth?:number;
}
export interface SavedDefense extends Defense {version?:1; runState:string}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const finite = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value:unknown):value is Record<string, unknown> => !!value && typeof value === 'object';
const rect = (value:unknown):value is Rect => object(value) && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height) && value.x >= 0 && value.y >= 0 && value.width > 0 && value.height > 0;
const same = (a:Rect, b:Rect) => a.x===b.x && a.y===b.y && a.width===b.width && a.height===b.height;
const defenseMounts=(defense:Pick<Defense,'map'|'builtWalls'|'builtWires'|'builtFences'>)=>[
  ...terrainMounts(clearPlayerTerrain(defense.map,defense.builtWalls,defense.builtWires,defense.builtFences??[])),
  ...wallMountCells(defense.builtWalls),
];

/** Validate a detached snapshot before any part of the running defense changes. */
export function decodeDefense(raw:string):SavedDefense {
  const saved:unknown = JSON.parse(raw);
  if (!object(saved) || (saved.version !== undefined && saved.version !== 1) || typeof saved.runState !== 'string') throw new Error('Invalid saved defense.');
  const map = saved.map;
  if (!object(map) || typeof map.id !== 'string' || !finite(map.width) || !finite(map.height) || map.width <= 0 || map.height <= 0 || !Array.isArray(map.obstacles) || !map.obstacles.every(rect) || !rect(map.spawn) || !object(map.goal) || !finite(map.goal.x) || !finite(map.goal.y) || map.goal.x < 0 || map.goal.x > map.width || map.goal.y < 0 || map.goal.y > map.height || !finite(map.goalRadius) || map.goalRadius <= 0) throw new Error('Invalid saved map.');
  const mapWidth=map.width as number,mapHeight=map.height as number;
  const posts=(value:unknown)=>value===undefined||(Array.isArray(value)&&value.every(post=>object(post)&&finite(post.x)&&finite(post.y)&&post.x>=0&&post.y>=0&&post.x<=mapWidth-4&&post.y<=mapHeight-4));
  if (!rect(saved.spawnBaseline) || !Array.isArray(saved.builtWalls) || !saved.builtWalls.every(rect) || !Array.isArray(saved.builtWires) || !saved.builtWires.every(wire => object(wire) && finite(wire.health) && finite(wire.maxHealth) && wire.health > 0 && wire.maxHealth > 0 && wire.health <= wire.maxHealth && typeof wire.breached === 'boolean' && rect(wire)) || (saved.builtFences!==undefined&&(!Array.isArray(saved.builtFences)||!saved.builtFences.every(fence=>object(fence)&&finite(fence.health)&&finite(fence.maxHealth)&&fence.health>0&&fence.maxHealth>0&&fence.health<=fence.maxHealth&&rect(fence)))) || !posts(saved.wirePosts)||!posts(saved.fencePosts) || !finite(saved.difficulty) || !Number.isInteger(saved.difficulty) || saved.difficulty < 1 || saved.difficulty > 40 || (saved.streamWidth !== undefined && (!finite(saved.streamWidth) || !Number.isInteger(saved.streamWidth) || saved.streamWidth < 1 || saved.streamWidth > 100))) throw new Error('Invalid saved structures or flow setting.');
  const defense = saved as unknown as SavedDefense;
  defense.builtFences??=[];
  // Legacy tile-painted defenses retain their exact layout by becoming posts.
  defense.wirePosts??=defense.builtWires.map(wire=>({x:wire.x,y:wire.y}));
  defense.fencePosts??=defense.builtFences.map(fence=>({x:fence.x,y:fence.y}));
  const dynamic = [...defense.builtWalls, ...defense.builtWires, ...(defense.builtFences??[])];
  // Collision/removal code uses object identity. Reconnect solid walls and fences
  // to map obstacles; wire intentionally remains outside the collision/navigation
  // map, including for legacy snapshots that serialized intact wire as an obstacle.
  defense.map.obstacles = [
    ...defense.map.obstacles.filter(obstacle => !dynamic.some(segment => same(obstacle,segment))),
    ...defense.builtWalls,...(defense.builtFences??[]),
  ];
  if(!validDam(defense.map))throw new Error('Invalid saved floodgate state.');
  const issue = validateEditorMap(defense.map);
  if (issue) throw new Error(issue);
  const candidate = createRun(defense.map);
  candidate.setBuildMounts(defenseMounts(defense));
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
  const result = run.load(saved.runState, {map:saved.map, buildMounts:defenseMounts(saved)});
  if (!result.ok) throw new Error(result.reason);
  run.setSpawnMultiplier(saved.difficulty);
  return saved;
}
