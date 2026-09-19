export type Vec2 = { x: number; y: number };
export type Rect = Vec2 & { width: number; height: number };
export interface WorldMap { id: string; width: number; height: number; obstacles: Rect[]; spawn: Rect; goal: Vec2; goalRadius: number }
export type TowerKind = 'repulsor' | 'mortar' | 'autocannon' | 'cryo' | 'tesla' | 'rocket' | 'railgun';
export type EnemyKind = 'shambler' | 'runner' | 'brute';
export type EffectKind = 'blast' | 'push' | 'slow' | 'shot';
export interface Effect extends Vec2 { kind: EffectKind; radius: number; strength: number; damage: number; direction: Vec2; cone: number; duration: number; source: number }
export interface TowerDef { id: TowerKind; name: string; description: string; cost: number; range: number; cooldown: number; damage: number; force: number; radius: number; color: string; branches: readonly [string, string] }
export interface EnemyDef { id: EnemyKind; index: number; name: string; radius: number; mass: number; health: number; speed: number; crushTolerance: number; bounty: number; leak: number; color: string }
export interface Tower extends Vec2 { id: number; kind: TowerKind; level: number; branch: number; angle: number; cooldown: number; spent: number; kills?:number; veterancy?:number; veterancyXp?:number }
export interface NavigationField { width: number; height: number; cellSize: number; vectors: Float32Array; distances: Float32Array; version: number }
export interface Tuning { pressure: number; viscosity: number; drive: number; crushThreshold: number; crushDamage: number }
export const DEFAULT_TUNING: Tuning = { pressure: 36, viscosity: 2, drive: 5, crushThreshold: 1.8, crushDamage: 18 };
export const WORLD_WIDTH = 160;
export const WORLD_HEIGHT = 100;
export const MAX_PARTICLES = 65536;
export const PARTICLE_FLOATS = 16;
export const PARTICLE_BYTES = PARTICLE_FLOATS * 4;
export const MAX_EFFECTS = 64;
export const MAX_OBSTACLES = 64;
export const COUNTER_WORDS = 16;
// Shared packed layout: four vec4<f32>. All fields are floats, including kind/alive.
// pos=(x,y,vx,vy), body=(radius,mass,hp,maxHp), state=(packing,pressure,kind,alive), status=(slowRemaining,brittleRemaining,crushExposure,generation).
export const PARTICLE_WGSL = `struct Particle { pos: vec4<f32>, body: vec4<f32>, state: vec4<f32>, status: vec4<f32> };`;
export const P = { x:0,y:1,vx:2,vy:3,radius:4,mass:5,hp:6,maxHp:7,packing:8,pressure:9,kind:10,alive:11,slow:12,brittle:13,exposure:14,generation:15 } as const;
// Root owns particles/counters. Modules may allocate private scratch; they encode, never submit.
export interface SharedGPU { particles: GPUBuffer; counters: GPUBuffer; capacity: number; shotState?: GPUBuffer; bossState?: GPUBuffer }
export interface PhysicsFrame { dt: number; tick: number; count: number; map: WorldMap; effects: readonly Effect[]; tuning: Tuning; navigation?: NavigationField; lab: boolean }
export interface PhysicsModule { encode(encoder: GPUCommandEncoder, frame: PhysicsFrame): void; reset(): void; destroy(): void }
export interface Settlement { epoch: number; tick: number; kills: number; crushKills: number; leaks: number; earned: number; live: number; invalid: number; maxPacking: number; boss?:{x:number;y:number;health:number;maxHealth:number;phase:number;active:boolean} }
// counters: cumulative kills, crush kills, leaks (base damage), earned, current live, invalid, max packing*1000; remaining reserved. Live/max packing may be reset each sampled tick by root.
export interface RenderScene { count: number; time: number; map: WorldMap; towers: readonly Tower[]; effects: readonly Effect[]; heatmap: boolean; selection: number | null; ghost?: Vec2 & {kind: TowerKind; valid: boolean; range:number}; wallGhost?: Rect & {valid:boolean}; boss?: Vec2 & {health:number;maxHealth:number;phase:number} }
export interface Renderer { encode(encoder: GPUCommandEncoder, scene: RenderScene): void; screenToWorld(clientX:number,clientY:number):Vec2; pan(dx:number,dy:number):void; zoomAt(factor:number,clientX:number,clientY:number):void; destroy():void }
export type GameAction = {type:'mode';mode:'lab'|'game'} | {type:'pause'} | {type:'step'} | {type:'reset'} | {type:'start-wave'} | {type:'select-tower';kind:TowerKind|null} | {type:'wall-tool'} | {type:'upgrade';branch:number} | {type:'buy-command';id:string} | {type:'sell'} | {type:'difficulty';value:number} | {type:'heatmap';value:boolean} | {type:'population';value:number} | {type:'tool';tool:'blast'|'push'|'inspect'} | {type:'bonus';id:string} | {type:'save'} | {type:'load'};
export interface BonusChoice { id:string; name:string; description:string }
export interface CommandUpgrade { id:string; name:string; description:string; cost:number }
export interface UIState { mode:'lab'|'game'; phase:'preparation'|'combat'|'settling'|'won'|'lost'; paused:boolean; fps:number; frameMs:number; population:number; capacity:number; kills:number; crushKills:number; metal:number; baseHealth:number; wave:number; waveCount:number; difficulty:number; selected:Tower|null; selectedKind:TowerKind|null; heatmap:boolean; tool:'blast'|'push'|'inspect'; message:string; adapter:string; bonusChoices:readonly BonusChoice[]; commandUpgrades:readonly string[]; bossHealth?:number; }
export interface GameUI { canvas:HTMLCanvasElement; update(state:UIState):void; destroy():void }
export interface SpawnBatch { count:number; kind:EnemyKind; seed:number }
export interface RunModel { phase:UIState['phase']; metal:number; baseHealth:number; wave:number; waveCount:number; towers:Tower[]; selected:number|null; pending:SpawnBatch[]; bonusChoices:BonusChoice[]; bonuses:string[]; commandUpgrades:string[] }
