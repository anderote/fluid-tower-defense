import {P, PARTICLE_FLOATS, type CommandUpgrade, type EnemyDef, type EnemyKind, type SpawnBatch, type Tower, type TowerDef, type TowerKind, type WorldMap} from '../contracts/index.ts';
import {scaledPeakPressure} from '../sim/pressure/model.ts';
import {BASE_BARBED_WIRE_DURABILITY,BASE_WALL_DURABILITY,BASE_WALL_PRESSURE_RESISTANCE} from '../sim/walls/model.ts';

export const TOWERS: Record<TowerKind, TowerDef> = {
  repulsor: {id:'repulsor', name:'Repulsor', description:'Pulses enemies toward the choke walls.', cost:120, range:10, cooldown:1.35, damage:2, force:16, radius:2.7, peakPressureKpa:240, color:'#50d5ff', branches:['Ram','Wave']},
  mortar: {id:'mortar', name:'Mortar', description:'Lobs a concussive shell into dense crowds.', cost:350, range:38, cooldown:2.25, damage:22, force:18, radius:4.8, peakPressureKpa:650, color:'#ff9b55', branches:['Siege','Cluster']},
  autocannon: {id:'autocannon', name:'Autocannon', description:'Rapidly picks off runners and knocks them back.', cost:80, range:28, cooldown:.22, damage:5, force:9, radius:.8, peakPressureKpa:180, color:'#ffe46b', branches:['Piercer','Suppressor']},
  cryo: {id:'cryo', name:'Cryo Emitter', description:'Slows and shoves a cone of incoming enemies.', cost:200, range:13, cooldown:.7, damage:1, force:6, radius:4.1, peakPressureKpa:95, color:'#a995ff', branches:['Deep Freeze','Cold Front']},
  tesla: {id:'tesla', name:'Tesla Coil', description:'Chains lightning through nearby enemies, briefly slowing them and frying lethal hits to ash.', cost:600, range:20, cooldown:.48, damage:7, force:8, radius:5.2, peakPressureKpa:120, color:'#9a7dff', branches:['Capacitor','Storm Cell']},
  rocket: {id:'rocket', name:'Rocket Pod', description:'Saturates dense crowds with a three-warhead scatter salvo.', cost:1_600, range:44, cooldown:2.9, damage:34, force:24, radius:6.6, peakPressureKpa:1250, color:'#ff5f48', branches:['Warhead','Barrage']},
  railgun: {id:'railgun', name:'Railgun', description:'Penetrates and hurls targets along a long firing lane.', cost:2_500, range:48, cooldown:.78, damage:38, force:26, radius:1.1, peakPressureKpa:900, color:'#73f5d2', branches:['Slug','Accelerator']},
  incinerator: {id:'incinerator', name:'Incinerator', description:'Bathes a narrow cone in heat that briefly burns enemies.', cost:800, range:13, cooldown:.75, damage:8, force:0, radius:3.7, peakPressureKpa:55, color:'#ff7848', branches:['Furnace','Wildfire']},
  crusher: {id:'crusher',name:'Crusher Gate',description:'Left-to-right passage; top and bottom jaws are solid. Keep both mouths clear. Press G to slam ready gates; packed crowds take up to double crush damage. Recharges in 8 seconds.',cost:450,range:6,cooldown:8,damage:60,force:18,radius:6,peakPressureKpa:900,color:'#ffc34d',branches:['Heavy Pistons','Rapid Hydraulics']},
};

export const MAX_TOWER_LEVEL=50;
export const towerUpgradeCost=(level:number):number=>45+Math.max(0,Math.floor(level))*35;

const tech=(id:string,name:string,category:string,description:string,cost:number,requires?:readonly string[]):CommandUpgrade=>({id,name,category,description,cost,requires,maxRank:20,unlockRank:3});
export const COMMAND_UPGRADES: readonly CommandUpgrade[] = [
  {id:'tesla-overload',name:'Tesla Overload',category:'WEAPONS',description:'Every sixth Tesla discharge deals 3× damage and adds 8 chain targets.',cost:450,maxRank:1},
  tech('ballistics','Ballistics','WEAPONS','Conventional weapon damage: +1% per rank.',180),
  tech('rifle-tech','Rifle Technology','WEAPONS','Rifle squads, Autocannons, and Railguns: +2% damage per rank.',300,['ballistics']),
  tech('precision-optics','Precision Optics','WEAPONS','Rifle squads, Autocannons, and Railguns: +1.5% range per rank.',280,['ballistics']),
  tech('thermal-science','Thermal Science','WEAPONS','Incendiary weapon damage: +1% per rank.',190),
  tech('flame-tech','Flame Technology','WEAPONS','Flame squads and Incinerators: +2.5% damage per rank.',330,['thermal-science']),
  tech('explosive-ordnance','Explosive Ordnance','WEAPONS','Explosive weapon damage: +1% per rank.',220),
  tech('high-explosives','High Explosives','WEAPONS','Mortars, Rocket Pods, and Rocket squads: +2% damage per rank.',360,['explosive-ordnance']),
  tech('energy-systems','Energy Systems','WEAPONS','Energy weapon force: +1% per rank.',220),
  tech('chain-conduction','Chain Conduction','WEAPONS','Tesla Coils: +1 chain target per rank. Stacks with Storm Cell and veterancy.',360,['energy-systems']),
  tech('field-control','Field Control','WEAPONS','Repulsors, Cryo Emitters, and Tesla Coils: +1.5% force per rank.',320,['energy-systems']),
  tech('targeting-grid','Targeting Grid','COMMAND','Every tower: +1% range per rank.',380,['ballistics','energy-systems']),
  tech('infantry-armor','Infantry Armor','SURVIVAL','Every squad: +2% health and +1% damage reduction per rank.',300),
  tech('structure-armor','Structure Armor','SURVIVAL','Walls, fences, and wire: +2% durability and resistance per rank.',280),
  tech('fortified-core','Fortified Core','SURVIVAL','Base integrity: +1 immediately per rank.',450,['structure-armor','infantry-armor']),
  tech('salvage-magnets','Salvage Magnets','COMMAND','Metal recovered from kills: +1.5% per rank.',280),
];

export const techRank=(upgrades:readonly string[],id:string)=>upgrades.filter(upgrade=>upgrade===id).length;
export const hasTech=(upgrades:readonly string[],id:string)=>techRank(upgrades,id)>0;
export const barbedWireStats=(upgrades:readonly string[])=>{const multiplier=1+techRank(upgrades,'structure-armor')*.02;return {damage:.45,slow:.65,durability:BASE_BARBED_WIRE_DURABILITY*multiplier,resistance:7*multiplier,wear:.18};};
export const metalWallStats=(upgrades:readonly string[])=>{const multiplier=1+techRank(upgrades,'structure-armor')*.02;return {durability:BASE_WALL_DURABILITY*multiplier,resistance:BASE_WALL_PRESSURE_RESISTANCE*multiplier};};

/** Packs authored towers into the supported GPU weapon behaviours. */
export const towerBehavior=(kind:TowerKind):number=>({repulsor:0,mortar:1,autocannon:2,cryo:3,tesla:13,rocket:12,railgun:2,incinerator:14,crusher:15}[kind]);
/** Direct-fire weapons whose targeting is occluded by solid map geometry. */
export const towerRequiresLineOfSight=(kind:TowerKind):boolean=>kind==='autocannon'||kind==='rocket'||kind==='railgun'||kind==='incinerator';
export const MAX_VETERANCY=100;
/** 64.8 XP per squared rank: rank 10 requires 6,480 credited kills, rank 50 162,000, and rank 100 648,000. */
export const veterancyXpForLevel=(level:number):number=>64.8*Math.max(0,Math.min(MAX_VETERANCY,Math.ceil(level)))**2;
export const veterancyLevel=(xp:number):number=>Math.min(MAX_VETERANCY,Math.floor(Math.sqrt(Math.max(0,xp)/64.8)));
/** Veteran service now has a strong identity: rank 100 reaches 5x base damage.
 * Range and reload also scale meaningfully, while the exponential curve keeps
 * the first few ranks modest and makes long-serving defenses feel legendary. */
export const veterancyMultiplier=(level:number):number=>5**(Math.min(MAX_VETERANCY,Math.max(0,level))/MAX_VETERANCY);

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {id:'shambler',index:0,name:'Shambler',radius:.4125,mass:1,health:30,speed:3.1,drive:1,pressureLimit:24,crushResistance:1,bounty:3,leak:1,color:'#76c66e'},
  runner: {id:'runner',index:1,name:'Runner',radius:.31875,mass:.65,health:18,speed:5.4,drive:1.3,pressureLimit:18,crushResistance:.7,bounty:3,leak:1,color:'#e6d45d'},
  brute: {id:'brute',index:2,name:'Brute',radius:.6375,mass:3.4,health:110,speed:2,drive:1.1,pressureLimit:46,crushResistance:2.2,bounty:8,leak:3,color:'#cf6d68'},
  rager: {id:'rager',index:3,name:'Rager',radius:.43125,mass:1.35,health:42,speed:3.6,drive:1.8,pressureLimit:28,crushResistance:1.1,bounty:5,leak:2,color:'#ef8738'},
  softbody: {id:'softbody',index:4,name:'Bloater',radius:.5625,mass:1.1,health:60,speed:2.25,drive:.8,pressureLimit:62,crushResistance:2.8,bounty:6,leak:2,color:'#a678d4'},
  husk: {id:'husk',index:5,name:'Husk',radius:.35625,mass:.85,health:34,speed:2.9,drive:1,pressureLimit:10,crushResistance:.5,bounty:4,leak:1,color:'#9edce8'},
};

/** Every 25% of wave-scaled health unlocks the next enemy tier. */
export const ENEMY_TIER_HEALTH_STEP = .25;
export const enemyTierForHealthScale = (healthScale:number):number => Math.max(0,Math.floor(Math.max(0,healthScale-1)/ENEMY_TIER_HEALTH_STEP));
export const enemySpeedMultiplier = (healthScale:number):number => 1 + enemyTierForHealthScale(healthScale) * .06;
export const enemyDriveMultiplier = (healthScale:number):number => 1 + enemyTierForHealthScale(healthScale) * .025;
export const enemyPressureMultiplier = (healthScale:number):number => 1 + enemyTierForHealthScale(healthScale) * .08;
export const enemyCrushMultiplier = (healthScale:number):number => 1 + enemyTierForHealthScale(healthScale) * .06;
export const enemySpeedForScale = (kind:EnemyKind,healthScale=1):number => ENEMIES[kind].speed * enemySpeedMultiplier(healthScale);
export const enemyDriveForScale = (kind:EnemyKind,healthScale=1):number => ENEMIES[kind].drive * enemyDriveMultiplier(healthScale);
export const enemyPressureLimitForScale = (kind:EnemyKind,healthScale=1):number => ENEMIES[kind].pressureLimit * enemyPressureMultiplier(healthScale);
export const enemyCrushResistanceForScale = (kind:EnemyKind,healthScale=1):number => ENEMIES[kind].crushResistance * enemyCrushMultiplier(healthScale);

/** Enemy bounties are accumulated as points; 50 points pay one Metal. */
export const ENEMY_BOUNTY_DIVISOR=50;

const wgslNumber=(value:number):string=>Number.isInteger(value)?`${value}.0`:String(value);
const hexRgb=(hex:string):readonly number[]=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
const enemyCases=(field:keyof EnemyDef,format:(value:never)=>string=wgslNumber):string=>Object.values(ENEMIES).map(enemy=>`case ${enemy.index}u: { return ${format(enemy[field] as never)}; }`).join('\n');
/** Generated from ENEMIES so CPU spawning and every GPU stage share one source of truth. */
export const ENEMY_WGSL=/* wgsl */`
fn enemySpeed(kind:u32)->f32 { switch kind { ${enemyCases('speed')} default: { return ${wgslNumber(ENEMIES.shambler.speed)}; } } }
fn enemyDrive(kind:u32)->f32 { switch kind { ${enemyCases('drive')} default: { return ${wgslNumber(ENEMIES.shambler.drive)}; } } }
fn enemyHealth(kind:u32)->f32 { switch kind { ${enemyCases('health')} default: { return ${wgslNumber(ENEMIES.shambler.health)}; } } }
fn enemyPressureLimit(kind:u32)->f32 { switch kind { ${enemyCases('pressureLimit')} default: { return ${wgslNumber(ENEMIES.shambler.pressureLimit)}; } } }
fn enemyCrushResistance(kind:u32)->f32 { switch kind { ${enemyCases('crushResistance')} default: { return ${wgslNumber(ENEMIES.shambler.crushResistance)}; } } }
fn enemyTier(maxHp:f32,kind:u32)->f32 { return floor(max(0.0,maxHp/max(enemyHealth(kind),0.001)-1.0)/0.25); }
fn enemySpeedFor(kind:u32,maxHp:f32)->f32 { return enemySpeed(kind)*(1.0+enemyTier(maxHp,kind)*0.06); }
fn enemyDriveFor(kind:u32,maxHp:f32)->f32 { return enemyDrive(kind)*(1.0+enemyTier(maxHp,kind)*0.025); }
fn enemyPressureLimitFor(kind:u32,maxHp:f32)->f32 { return enemyPressureLimit(kind)*(1.0+enemyTier(maxHp,kind)*0.08); }
fn enemyCrushResistanceFor(kind:u32,maxHp:f32)->f32 { return enemyCrushResistance(kind)*(1.0+enemyTier(maxHp,kind)*0.06); }
fn enemyBountyPoints(kind:u32)->u32 { switch kind { ${enemyCases('bounty',value=>`${value}u`)} default: { return ${ENEMIES.shambler.bounty}u; } } }
fn enemyLeak(kind:u32)->u32 { switch kind { ${enemyCases('leak',value=>`${value}u`)} default: { return ${ENEMIES.shambler.leak}u; } } }
fn enemyColor(kind:u32)->vec3f { switch kind { ${enemyCases('color',value=>`vec3f(${hexRgb(String(value)).map(wgslNumber).join(',')})`)} default: { return vec3f(${hexRgb(ENEMIES.shambler.color).map(wgslNumber).join(',')}); } } }
`;

// Bastion is now an open settlement approach: only building foundations and
// tree trunks block movement. There are no free wall-mounted firing positions.
const bastionProps=[
 ...[['v01',30,22],['v03',44,20],['v04',34,40],['v06',48,38],['v01',90,72],['v03',104,70],['v04',94,90],['v06',108,88],['v08',128,24]].map(([sprite,x,y])=>({sprite:`forest:${sprite}`,x:Number(x),y:Number(y)})),
 ...[[18,10],[24,14],[54,10],[60,14],[76,88],[82,92],[120,10],[132,12],[140,84],[146,90]].map(([x,y],i)=>({sprite:`forest:${['t01','t03','t10','t16'][i%4]}`,x,y})),
];
const bastionSolids=bastionProps.map(prop=>{const tree=prop.sprite.includes(':t'),width=tree?2:6,height=tree?2:5;return {x:prop.x-width/2,y:prop.y-height,width,height};});
export const DEFAULT_MAP: WorldMap = {
 id:'pressure-front-bastion',width:160,height:100,obstacles:bastionSolids,
 spawn:{x:0,y:20,width:8,height:60},goal:{x:156,y:50},goalRadius:4,
 scenery:{biome:'forest',title:'Bastion',briefing:'An open road through scattered hamlets. There are no defensive walls: build your own line across the broad central approach. Cottages and orchards offer only small pockets of cover.',solids:bastionSolids,mounts:[],props:bastionProps,regions:[],tiles:[
  ...Array.from({length:40},(_,i)=>({sprite:'forest:d45',x:i*4,y:48,columns:1,rows:1})),
  ...[28,80].flatMap(y=>Array.from({length:8},(_,i)=>({sprite:'forest:d45',x:(y===28?20:80)+i*4,y,columns:1,rows:1}))),
 ]},
};

export function validateContent(): void {
  const finite = (value:number, label:string) => { if (!Number.isFinite(value)) throw new Error(`${label} must be finite`); };
  for (const [key,tower] of Object.entries(TOWERS) as [TowerKind,TowerDef][]) {
    if (tower.id !== key || tower.cost <= 0 || tower.range <= 0 || tower.cooldown <= 0 || tower.damage < 0 || tower.force < 0 || tower.radius < 0 || tower.peakPressureKpa<=0 || tower.branches.length !== 2 || tower.branches[0] === tower.branches[1]) throw new Error(`Invalid tower ${tower.id}`);
    [tower.cost,tower.range,tower.cooldown,tower.damage,tower.force,tower.radius,tower.peakPressureKpa].forEach((value,index)=>finite(value,`${tower.id}[${index}]`));
  }
  const seen = new Set<number>();
  for (const [key,enemy] of Object.entries(ENEMIES) as [EnemyKind,EnemyDef][]) {
    if (enemy.id !== key || seen.has(enemy.index) || enemy.radius <= 0 || enemy.mass <= 0 || enemy.health <= 0 || enemy.speed <= 0 || enemy.drive <= 0 || enemy.pressureLimit < 0 || enemy.crushResistance <= 0 || enemy.bounty < 0 || enemy.leak <= 0 || !/^#[0-9a-f]{6}$/i.test(enemy.color)) throw new Error(`Invalid enemy ${enemy.id}`);
    seen.add(enemy.index); [enemy.radius,enemy.mass,enemy.health,enemy.speed,enemy.drive,enemy.pressureLimit,enemy.crushResistance,enemy.bounty,enemy.leak].forEach((value,index)=>finite(value,`${enemy.id}[${index}]`));
  }
}

/** Compiles the supported tower progression into a combat-ready definition. */
export function compileTower(tower: Tower, bonuses: readonly string[] = [], commandUpgrades: readonly string[] = [], statUpgrades:readonly string[]=[]): TowerDef {
  const base=TOWERS[tower.kind];
  let range=base.range, cooldown=base.cooldown, damage=base.damage, force=base.force, radius=base.radius;
  const level=Math.min(MAX_TOWER_LEVEL,Math.max(0,tower.level));
  const powerPath=tower.branch===0,controlPath=tower.branch===1;
  // Every purchased level advances the full combat profile. Branch A leans
  // into damage and impulse; Branch B leans into reach, rate and area.
  // Repulsors remain local crowd-control tools even at high tower levels.
  range += level * (tower.kind==='repulsor' ? .2 : 1.25) * (controlPath?1.15:1);
  damage *= 1 + level * (powerPath?.14:.12);
  cooldown /= 1 + level * (controlPath?.018:.012);
  force *= 1 + (powerPath?.05:.035) * (1-Math.exp(-level/12));
  radius *= 1 + level * (controlPath?.008:.004);
  const veteran=veterancyMultiplier(tower.veterancy ?? veterancyLevel(tower.veterancyXp ?? 0));
  range*=1+(veteran-1)*.65; damage*=veteran; cooldown/=1+(veteran-1)*.5; force*=1+(veteran-1)*.5; radius*=1+(veteran-1)*.35;
  if (tower.branch === 0) {
    if (tower.kind==='repulsor') { force *= 1.4; radius *= .8; range += 1; }
    if (tower.kind==='mortar') { damage *= 1.6; radius *= .78; cooldown *= 1.12; }
    if (tower.kind==='autocannon') { damage *= 1.5; range *= 1.25; }
    if (tower.kind==='cryo') { range *= 1.3; radius *= 1.2; cooldown *= .85; }
    if (tower.kind==='crusher') { damage*=1.6; cooldown*=1.15; }
    if (tower.kind==='tesla') { damage *= 1.45; radius *= 1.25; }
    if (tower.kind==='rocket') { damage *= 1.6; radius *= .8; }
    if (tower.kind==='railgun') { damage *= 1.75; cooldown *= 1.15; }
    if (tower.kind==='incinerator') { damage *= 1.35; radius *= .88; }
  }
  if (tower.branch === 1) {
    if (tower.kind==='repulsor') { cooldown *= .8; radius *= 1.3; }
    if (tower.kind==='mortar') { cooldown *= .68; radius *= 1.45; damage *= .78; }
    if (tower.kind==='autocannon') { cooldown *= .65; radius *= 2; force += 3; }
    if (tower.kind==='cryo') { range *= 1.5; radius *= 1.5; cooldown *= .85; }
    if (tower.kind==='crusher') { cooldown*=.65; }
    if (tower.kind==='tesla') { range *= 1.3; radius *= 1.5; cooldown *= .78; }
    if (tower.kind==='rocket') { cooldown *= .62; radius *= 1.45; damage *= .8; }
    if (tower.kind==='railgun') { cooldown *= .58; range *= 1.18; }
    if (tower.kind==='incinerator') { range *= 1.12; radius *= 1.2; cooldown *= .9; damage *= .9; }
  }
  for (const bonus of bonuses) {
    if (bonus === 'hydraulic-advantage' && tower.kind === 'repulsor') { force *= 1.3; cooldown *= 1.12; }
    if (bonus === 'cold-field' && tower.kind === 'cryo') radius *= 1.2;
    if (bonus === 'kinetic-feed' && tower.kind === 'autocannon') cooldown *= .85;
    if (bonus === 'blast-casing' && (tower.kind === 'mortar' || tower.kind === 'rocket')) damage *= 1.15;
  }
  damage*=1+techRank(commandUpgrades,'ballistics')*.01*Number(tower.kind==='autocannon'||tower.kind==='railgun');
  damage*=1+techRank(commandUpgrades,'thermal-science')*.01*(tower.kind==='incinerator'?1:0);
  damage*=1+techRank(commandUpgrades,'explosive-ordnance')*.01*(tower.kind==='mortar'||tower.kind==='rocket'?1:0);
  force*=1+techRank(commandUpgrades,'energy-systems')*.01*(tower.kind==='repulsor'||tower.kind==='cryo'||tower.kind==='tesla'?1:0);
  range *= 1+techRank(commandUpgrades,'targeting-grid')*.01;
  if (tower.kind==='autocannon'||tower.kind==='railgun') { damage*=1+techRank(commandUpgrades,'rifle-tech')*.02; range*=1+techRank(commandUpgrades,'precision-optics')*.015; }
  if (tower.kind==='incinerator') damage*=1+techRank(commandUpgrades,'flame-tech')*.025;
  if (tower.kind==='mortar'||tower.kind==='rocket') damage*=1+techRank(commandUpgrades,'high-explosives')*.02;
  if (tower.kind==='repulsor'||tower.kind==='cryo'||tower.kind==='tesla') force*=1+techRank(commandUpgrades,'field-control')*.015;
  if(tower.kind==='crusher'){range=base.range;radius=base.radius;}
  const rank=Math.min(MAX_VETERANCY,Math.max(0,tower.veterancy??veterancyLevel(tower.veterancyXp??0)));
  const chainTargets=tower.kind==='tesla'?4+(controlPath?2+level:0)+Math.floor(rank/10)+techRank(commandUpgrades,'chain-conduction'):undefined;
  return {...base,range,cooldown,damage,force,radius,chainTargets,overload:tower.kind==='tesla'&&commandUpgrades.includes('tesla-overload'),peakPressureKpa:scaledPeakPressure(base,damage,force)};
}

function random(seed:number):()=>number { let state=(seed >>> 0) || 1; return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state / 0x1_0000_0000; }; }
function shuffledCell(index:number,capacity:number):number {
  if(capacity<=1)return 0;
  const bits=Math.ceil(Math.log2(capacity)),mask=2**bits-1,shift=Math.max(1,Math.floor(bits/2));
  let cell=index%capacity;
  // Cycle-walk a reversible integer mix: every cell appears exactly once per cycle,
  // but adjacent stream slots land in visibly unrelated parts of the spawn area.
  do {cell=(cell+0x9e3779)&mask;cell^=cell>>>shift;cell=Math.imul(cell,0x45d9f3b)&mask;cell^=cell>>>shift;} while(cell>=capacity);
  return cell;
}

/** Encodes only the populated prefix. Callers must use `particles.length / PARTICLE_FLOATS`. */
export function createParticles(batches: readonly SpawnBatch[], map: WorldMap, capacity: number, spawnSlot=0): Float32Array {
  validateContent();
  const requested = batches.reduce((sum,batch)=>sum+Math.max(0,Math.floor(batch.count)),0);
  const limit = Math.max(0,Math.min(Math.floor(capacity), requested));
  if (requested > limit) console.warn(`Particle spawn capped: requested ${requested}, capacity ${limit}`);
  if (!limit) return new Float32Array(0);
  const largest = Math.max(...batches.filter(batch=>batch.count>0).map(batch=>ENEMIES[batch.kind].radius), .18);
  const spacing = largest * 2 + .02;
  const maxColumns = Math.floor(map.spawn.width / spacing);
  const maxRows = Math.floor(map.spawn.height / spacing);
  const latticeCapacity = maxColumns * maxRows;
  const actual = Math.min(limit,latticeCapacity);
  if (limit > actual) console.warn(`Particle spawn region holds ${actual} non-overlapping particles; ${limit - actual} remain pending`);
  const output = new Float32Array(actual * PARTICLE_FLOATS);
  // Inlet cells are all beyond the west boundary. Physics introduces them at the
  // visible edge on the next step, making a continuous, thick advancing column
  // rather than a block materializing inside the battlefield.
  const columns=maxColumns;
  let cursor=0, slot=0;
  const usedCells=new Set<number>();
  const cellsFor=(band:SpawnBatch['band']):number[]=>{
    const [rowFrom,rowTo]=band==='upper'?[0,.38]:band==='center'?[.31,.69]:band==='lower'?[.62,1]:band==='inlet'?[.08,.92]:[0,1];
    const [columnFrom,columnTo]=band==='inlet'?[0,1]:[0,1];
    const firstRow=Math.max(0,Math.floor(maxRows*rowFrom)),lastRow=Math.min(maxRows,Math.ceil(maxRows*rowTo));
    const firstColumn=Math.max(0,Math.floor(columns*columnFrom)),lastColumn=Math.min(columns,Math.ceil(columns*columnTo));
    const width=Math.max(0,lastColumn-firstColumn);
    return Array.from({length:Math.max(0,lastRow-firstRow)*width},(_,index)=>(firstRow+Math.floor(index/width))*columns+firstColumn+index%width);
  };
  for (const batch of batches) {
    const count=Math.max(0,Math.floor(batch.count)), enemy=ENEMIES[batch.kind], jitter=random(batch.seed),candidates=cellsFor(batch.band);
    for (let i=0;i<count && slot<actual;i++) {
      const first=shuffledCell(spawnSlot+slot+i,candidates.length);let cell=-1;
      for(let offset=0;offset<candidates.length;offset++){const candidate=candidates[(first+offset)%candidates.length];if(!usedCells.has(candidate)){cell=candidate;break;}}
      if(cell<0)break;
      usedCells.add(cell);slot++;
      const col=cell%columns,row=Math.floor(cell/columns);
      const baseX=map.spawn.x+(col+.5)*spacing-(batch.band==='inlet'?map.spawn.width:0), baseY=map.spawn.y+(row+.5)*spacing;
      // A tiny deterministic jitter is safely smaller than the lattice clearance.
      const offset=(jitter()-.5)*.008;
      output[cursor+P.x]=baseX+offset; output[cursor+P.y]=baseY+(jitter()-.5)*.008;
      output[cursor+P.radius]=enemy.radius; output[cursor+P.mass]=enemy.mass;
      const health=enemy.health*Math.max(.1,batch.healthScale??1);
      output[cursor+P.hp]=health; output[cursor+P.maxHp]=health;
      output[cursor+P.kind]=enemy.index; output[cursor+P.alive]=1; output[cursor+P.generation]=1;
      cursor += PARTICLE_FLOATS;
    }
    if (slot>=actual) break;
  }
  if(cursor<output.length)console.warn(`Particle spawn bands hold ${cursor/PARTICLE_FLOATS} non-overlapping particles; ${actual-cursor/PARTICLE_FLOATS} remain pending`);
  return cursor===output.length?output:output.slice(0,cursor);
}
