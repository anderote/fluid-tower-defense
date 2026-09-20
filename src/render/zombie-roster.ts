import {ENEMIES} from '../content/index.ts';
import type {EnemyKind} from '../contracts/index.ts';

/** Visual tuning only. Physical radii, speed, health and mass remain in ENEMIES. */
export const ZOMBIE_KINDS=['shambler','runner','softbody','brute'] as const satisfies readonly EnemyKind[];
export type ZombieKind=typeof ZOMBIE_KINDS[number];
export const ZOMBIE_FRAME=48;
export const ZOMBIE_FACINGS=8;
export const ZOMBIE_FRAMES=16;
export const ZOMBIE_PIVOT={x:24,y:32};
export const ZOMBIE_PROFILES:Record<ZombieKind,{stride:number;turnRate:number;tileScale:number;collapseStep:number}>={
  shambler:{stride:.95,turnRate:7,tileScale:9.6,collapseStep:.09},
  runner:{stride:1.25,turnRate:11,tileScale:12.3,collapseStep:.065},
  softbody:{stride:1.3,turnRate:4,tileScale:9.6,collapseStep:.13},
  brute:{stride:1.65,turnRate:3.5,tileScale:9.6,collapseStep:.12},
};
const number=(value:number)=>Number.isInteger(value)?`${value}.0`:String(value);
const cases=(value:(kind:ZombieKind,index:number)=>number)=>ZOMBIE_KINDS.map((kind,index)=>`case ${ENEMIES[kind].index}u: {return ${number(value(kind,index))};}`).join('\n');
export const ZOMBIE_ROSTER_WGSL=`
fn zombieAtlas(kind:u32)->f32{switch kind{${cases((_,index)=>index)}default:{return -1.;}}}
fn zombieStride(kind:u32)->f32{switch kind{${cases(kind=>ZOMBIE_PROFILES[kind].stride)}default:{return 1.;}}}
fn zombieTurnRate(kind:u32)->f32{switch kind{${cases(kind=>ZOMBIE_PROFILES[kind].turnRate)}default:{return 7.;}}}
fn zombieTileScale(kind:u32)->f32{switch kind{${cases(kind=>ZOMBIE_PROFILES[kind].tileScale)}default:{return 9.6;}}}
fn zombieCollapseStep(kind:u32)->f32{switch kind{${cases(kind=>ZOMBIE_PROFILES[kind].collapseStep)}default:{return .09;}}}
`;
