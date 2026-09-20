export type Vec2 = { x: number; y: number };
export type Rect = Vec2 & { width: number; height: number };
export type Biome='forest'|'winter'|'interior';
export interface MapScenery { biome:Biome; title:string; briefing:string; solids:Rect[]; mounts:Rect[]; tiles:(Vec2&{sprite:string;columns:number;rows:number})[]; props:(Vec2&{sprite:string})[]; regions:(Rect&{sprite:string})[] }
export interface WorldMap { id: string; width: number; height: number; obstacles: Rect[]; spawn: Rect; goal: Vec2; goalRadius: number; scenery?:MapScenery }
export type TowerKind = 'repulsor' | 'mortar' | 'autocannon' | 'cryo' | 'tesla' | 'rocket' | 'railgun' | 'incinerator';
export type EnemyKind = 'shambler' | 'runner' | 'brute' | 'rager' | 'softbody' | 'husk';
export type EffectKind = 'blast' | 'push' | 'slow' | 'shot';
export interface Effect extends Vec2 { kind: EffectKind; radius: number; strength: number; damage: number; direction: Vec2; cone: number; duration: number; source: number; peakPressureKpa?:number }
/** Short-lived render-only fragments. These never enter the simulation or affect gameplay. */
export type VisualParticleStyle = 'spark' | 'smoke' | 'debris' | 'mist' | 'shell';
export interface VisualParticle extends Vec2 { vx:number; vy:number; size:number; life:number; age:number; color:[number,number,number]; gravity:number; drag:number; style:VisualParticleStyle; spin:number }
/** Render-only M79/LAW rounds driven by confirmed GPU shot events. */
export interface HeavyProjectile extends Vec2 { kind:'mortar'|'rocket'; target:Vec2; age:number; delay:number; flight:number; launchTick?:number; serial:number; lane:number; peakPressureKpa:number }
export interface HeavyExplosion extends Vec2 { kind:'mortar'|'rocket'; age:number; life:number; scale:number; direction:Vec2; serial:number }
export interface TowerDef { id: TowerKind; name: string; description: string; cost: number; range: number; cooldown: number; damage: number; force: number; radius: number; peakPressureKpa:number; color: string; branches: readonly [string, string] }
export interface EnemyDef { id: EnemyKind; index: number; name: string; radius: number; mass: number; health: number; speed: number; drive: number; pressureLimit: number; crushResistance: number; bounty: number; leak: number; color: string }
export interface Tower extends Vec2 { id: number; kind: TowerKind; level: number; branch: number; angle: number; cooldown: number; spent: number; kills?:number; veterancy?:number; veterancyXp?:number }
export interface NavigationField { width: number; height: number; cellSize: number; vectors: Float32Array; alternateVectors: Float32Array; distances: Float32Array; version: number }
export interface Tuning { pressure: number; viscosity: number; drive: number; damagePressure: number; crushPressure: number; crushDamage: number }
export const DEFAULT_TUNING: Tuning = { pressure: 36, viscosity: 2, drive: 5, damagePressure: 24, crushPressure: 96, crushDamage: 18 };
export const MAX_PARTICLES = 65536;
/** Physical approach lane west of the battlefield. */
export const HORDE_APPROACH = 16;
export const PARTICLE_FLOATS = 16;
export const PARTICLE_BYTES = PARTICLE_FLOATS * 4;
export const MAX_EFFECTS = 64;
export const MAX_TOWERS = 64;
export const TOWER_KILL_COUNTER_OFFSET = 16;
// Global settlement telemetry plus the fixed tower attribution range. Obstacle telemetry
// lives in a separate buffer that grows with the active map.
export const HORDE_PRESSURE_COUNTER = TOWER_KILL_COUNTER_OFFSET + MAX_TOWERS;
export const COUNTER_WORDS = HORDE_PRESSURE_COUNTER + 1;
// Shared packed layout: four vec4<f32>. All fields are floats, including kind/alive.
// pos=(x,y,vx,vy), body=(radius,mass,hp,maxHp), state=(packing,pressure,kind,alive), status=(slowRemaining,brittleRemaining,crushExposure,generation).
export const PARTICLE_WGSL = `struct Particle { pos: vec4<f32>, body: vec4<f32>, state: vec4<f32>, status: vec4<f32> };`;
export const P = { x:0,y:1,vx:2,vy:3,radius:4,mass:5,hp:6,maxHp:7,packing:8,pressure:9,kind:10,alive:11,slow:12,brittle:13,exposure:14,generation:15 } as const;
// Root owns particles/counters. Modules may allocate private scratch; they encode, never submit.
export interface SharedGPU { particles: GPUBuffer; counters: GPUBuffer; capacity: number; obstacleCounters?:GPUBuffer; obstacleCapacity?:number; shotState?: GPUBuffer; teslaState?:GPUBuffer; aftermath?:GPUBuffer; bossState?: GPUBuffer }
export interface PhysicsFrame { dt: number; tick: number; count: number; map: WorldMap; effects: readonly Effect[]; tuning: Tuning; navigation?: NavigationField; lab: boolean }
export interface PhysicsModule { encode(encoder: GPUCommandEncoder, frame: PhysicsFrame): void; reset(): void; destroy(): void }
export interface Settlement { epoch: number; tick: number; kills: number; crushKills: number; leaks: number; earned: number; live: number; invalid: number; maxPacking: number; maxPressure?:number; inletBlocked?:boolean; towerKills?:readonly number[]; obstacleContacts?:readonly number[]; obstaclePacking?:readonly number[]; obstaclePressure?:readonly number[]; boss?:{x:number;y:number;health:number;maxHealth:number;phase:number;active:boolean} }
// Counters 0..15 hold global and boss telemetry; the remaining ranges hold tower and obstacle telemetry.
export interface RenderScene { aftermathVisible?:boolean; count: number; time: number; map: WorldMap; towers: readonly Tower[]; effects: readonly Effect[]; visualParticles?: readonly VisualParticle[]; heavyProjectiles?:readonly HeavyProjectile[]; heavyExplosions?:readonly HeavyExplosion[]; cameraShake?:number; walls?: readonly (Rect & {health:number;maxHealth:number})[]; wires?: readonly (Rect & {health:number;maxHealth:number;breached:boolean})[]; heatmap: boolean; selection: number | null; ghost?: Vec2 & {kind: TowerKind; valid: boolean; range:number}; wallGhost?: Rect & {valid:boolean}; placementGhost?: Rect & {kind:'wall'|'wire';valid:boolean}; demolitionHover?:Rect; boss?: Vec2 & {health:number;maxHealth:number;phase:number} }
export interface Renderer { encode(encoder: GPUCommandEncoder, scene: RenderScene): void; screenToWorld(clientX:number,clientY:number):Vec2; worldToScreen(x:number,y:number):Vec2; pan(dx:number,dy:number):void; zoomAt(factor:number,clientX:number,clientY:number):void; clearAftermath?():void; destroy():void }
export type GameAction = {type:'mode';mode:'lab'|'game'} | {type:'pause'} | {type:'restart-wave'} | {type:'reset'} | {type:'new-game'} | {type:'start-wave'} | {type:'continue-run'} | {type:'finish-run'} | {type:'select-tower';kind:TowerKind|null} | {type:'unlock-tower';kind:TowerKind} | {type:'wall-tool'} | {type:'wire-tool'} | {type:'demolish-tool'} | {type:'upgrade-tool'} | {type:'upgrade';branch:number} | {type:'upgrade-tower';id:number;branch:number} | {type:'buy-command';id:string} | {type:'buy-stat';id:string} | {type:'sell'} | {type:'difficulty';value:number} | {type:'stream-width';value:number} | {type:'heatmap';value:boolean} | {type:'population';value:number} | {type:'tool';tool:'blast'|'push'|'inspect'} | {type:'bonus';id:string} | {type:'save'} | {type:'load'};
export interface BonusChoice { id:string; name:string; description:string }
export interface CommandUpgrade { id:string; name:string; description:string; cost:number; requires?:string }
export interface StatUpgrade {id:string;name:string;description:string;cost:number;rank:number;maxRank:number}
export interface TowerUnlock {kind:TowerKind;cost:number;unlocked:boolean}
export interface UIState { mapTitle?:string;nextMapTitle?:string;mode:'lab'|'game'; phase:'preparation'|'combat'|'settling'|'checkpoint'|'won'|'lost'; paused:boolean; fps:number; frameMs:number; population:number; capacity:number; kills:number; crushKills:number; leaks:number; earned:number; maxPressure:number; metal:number; baseHealth:number; level:number; wave:number; waveCount:number; difficulty:number; streamWidth:number; selected:Tower|null; upgradeTarget:Tower|null; selectedKind:TowerKind|null; buildTool:'wall'|'wire'|'demolish'|null; upgradeMode:boolean; heatmap:boolean; tool:'blast'|'push'|'inspect'; message:string; adapter:string; bonusChoices:readonly BonusChoice[]; bonuses:readonly string[]; commandUpgrades:readonly string[]; statUpgrades:readonly StatUpgrade[]; towerUnlocks:readonly TowerUnlock[]; boss?:Settlement['boss']; bossHealth?:number; }
export interface GameUI { canvas:HTMLCanvasElement; update(state:UIState):void; destroy():void }
export type SpawnBand = 'full' | 'upper' | 'center' | 'lower' | 'inlet';
export interface SpawnBatch { count:number; kind:EnemyKind; seed:number; start?:number; rate?:number; burst?:number; band?:SpawnBand; healthScale?:number; credit?:number }
export interface RunModel { phase:UIState['phase']; metal:number; salvageCredit?:number; baseHealth:number; level:number; wave:number; waveCount:number; towers:Tower[]; selected:number|null; pending:SpawnBatch[]; bonusChoices:BonusChoice[]; bonuses:string[]; commandUpgrades:string[]; unlockedTowers:TowerKind[]; statRanks:Record<string,number> }
