import {P, PARTICLE_FLOATS, type CommandUpgrade, type EnemyDef, type EnemyKind, type SpawnBatch, type Tower, type TowerDef, type TowerKind, type WorldMap} from '../contracts/index.ts';
import {scaledPeakPressure} from '../sim/pressure/model.ts';

export const TOWERS: Record<TowerKind, TowerDef> = {
  repulsor: {id:'repulsor', name:'Repulsor', description:'Pulses enemies toward the choke walls.', cost:90, range:10, cooldown:1.35, damage:2, force:16, radius:2.7, peakPressureKpa:240, color:'#50d5ff', branches:['Ram','Wave']},
  mortar: {id:'mortar', name:'Mortar', description:'Lobs a concussive shell into dense crowds.', cost:120, range:38, cooldown:2.25, damage:22, force:18, radius:4.8, peakPressureKpa:650, color:'#ff9b55', branches:['Siege','Cluster']},
  autocannon: {id:'autocannon', name:'Autocannon', description:'Rapidly picks off runners and knocks them back.', cost:105, range:28, cooldown:.22, damage:5, force:9, radius:.8, peakPressureKpa:180, color:'#ffe46b', branches:['Piercer','Suppressor']},
  cryo: {id:'cryo', name:'Cryo Emitter', description:'Slows and shoves a cone of incoming enemies.', cost:110, range:13, cooldown:.7, damage:1, force:6, radius:4.1, peakPressureKpa:95, color:'#a995ff', branches:['Deep Freeze','Cold Front']},
  tesla: {id:'tesla', name:'Tesla Coil', description:'Chains lightning through nearby enemies, briefly slowing them and frying lethal hits to ash.', cost:140, range:20, cooldown:.48, damage:7, force:8, radius:5.2, peakPressureKpa:120, color:'#9a7dff', branches:['Capacitor','Storm Cell']},
  rocket: {id:'rocket', name:'Rocket Pod', description:'Saturates dense crowds with a three-warhead scatter salvo.', cost:165, range:44, cooldown:2.9, damage:34, force:24, radius:6.6, peakPressureKpa:1250, color:'#ff5f48', branches:['Warhead','Barrage']},
  railgun: {id:'railgun', name:'Railgun', description:'Penetrates and hurls targets along a long firing lane.', cost:2_500, range:48, cooldown:.78, damage:38, force:26, radius:1.1, peakPressureKpa:900, color:'#73f5d2', branches:['Slug','Accelerator']},
  incinerator: {id:'incinerator', name:'Incinerator', description:'Bathes a short cone in heat that burns enemies over time.', cost:145, range:16, cooldown:.55, damage:13, force:0, radius:4.8, peakPressureKpa:80, color:'#ff7848', branches:['Furnace','Wildfire']},
};

export const MAX_TOWER_LEVEL=50;
export const towerUpgradeCost=(level:number):number=>45+Math.max(0,Math.floor(level))*35;

const infrastructureResearch=(prefix:string,name:string,description:string,cost:number):readonly CommandUpgrade[]=>Array.from({length:20},(_,index)=>({id:`${prefix}-${index+1}`,name:`${name} ${index+1}`,description,cost:Math.round(cost+(index*42)+(Math.sqrt(index)*28))}));

export const COMMAND_UPGRADES: readonly CommandUpgrade[] = [
  {id:'targeting-grid',name:'Targeting Grid',description:'+18% range to every tower.',cost:260},
  {id:'ammunition-forge',name:'Ammunition Forge',description:'+25% damage to every tower.',cost:300},
  {id:'bulkhead-plating',name:'Bulkhead Plating',description:'+5 base integrity immediately.',cost:220},
  {id:'salvage-magnets',name:'Salvage Magnets',description:'+25% Metal recovered from kills.',cost:280},
  {id:'repulsor-impact-1',name:'Impact Coils I',description:'Repulsors deal +3 pulse damage.',cost:90},
  {id:'repulsor-impact-2',requires:'repulsor-impact-1',name:'Impact Coils II',description:'Repulsors deal +3 pulse damage.',cost:140},
  {id:'repulsor-impact-3',requires:'repulsor-impact-2',name:'Impact Coils III',description:'Repulsors deal +4 pulse damage.',cost:200},
  {id:'repulsor-impact-4',requires:'repulsor-impact-3',name:'Impact Coils IV',description:'Repulsors deal +5 pulse damage.',cost:270},
  {id:'repulsor-impact-5',requires:'repulsor-impact-4',name:'Impact Coils V',description:'Repulsors deal +6 pulse damage and +8% force.',cost:350},
  ...infrastructureResearch('wall-engineering','WALL ENGINEERING','Raises Metal Wall pressure capacity and lifespan.',90),
  ...infrastructureResearch('barbed-wire','BARBED WIRE','Raises wire damage, slow duration, resistance, and lifespan.',80),
];

const researchLevel=(upgrades:readonly string[],prefix:string)=>upgrades.filter(id=>new RegExp(`^${prefix}-\\d+$`).test(id)).length;
const researchMultiplier=(level:number)=>1+.58*Math.log1p(Math.max(0,Math.min(20,level)));
export const barbedWireStats=(upgrades:readonly string[])=>{const multiplier=researchMultiplier(researchLevel(upgrades,'barbed-wire'));return {damage:.45*multiplier,slow:.65*multiplier,durability:560*multiplier,resistance:7*multiplier,wear:.18};};
export const metalWallStats=(upgrades:readonly string[])=>{const multiplier=researchMultiplier(researchLevel(upgrades,'wall-engineering'));return {durability:2_880*multiplier,resistance:90*multiplier};};

/** Packs authored towers into the supported GPU weapon behaviours. */
export const towerBehavior=(kind:TowerKind):number=>({repulsor:0,mortar:1,autocannon:2,cryo:3,tesla:13,rocket:12,railgun:2,incinerator:14}[kind]);
export const MAX_VETERANCY=20;
export const veterancyLevel=(xp:number):number=>Math.min(MAX_VETERANCY,Math.floor(Math.log1p(Math.max(0,xp)/40)/Math.log(1.42)));
/** Semilogarithmic: rank 1 matters, rank 20 is strong but never breaks balance. */
export const veterancyMultiplier=(level:number):number=>1+.115*Math.log1p(Math.min(MAX_VETERANCY,Math.max(0,level)));

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {id:'shambler',index:0,name:'Shambler',radius:.4125,mass:1,health:30,speed:3.1,drive:1,pressureLimit:24,crushResistance:1,bounty:3,leak:1,color:'#76c66e'},
  runner: {id:'runner',index:1,name:'Runner',radius:.31875,mass:.65,health:18,speed:5.4,drive:1.3,pressureLimit:18,crushResistance:.7,bounty:3,leak:1,color:'#e6d45d'},
  brute: {id:'brute',index:2,name:'Brute',radius:.6375,mass:3.4,health:110,speed:2,drive:1.1,pressureLimit:46,crushResistance:2.2,bounty:8,leak:3,color:'#cf6d68'},
  rager: {id:'rager',index:3,name:'Rager',radius:.43125,mass:1.35,health:42,speed:3.6,drive:1.8,pressureLimit:28,crushResistance:1.1,bounty:5,leak:2,color:'#ef8738'},
  softbody: {id:'softbody',index:4,name:'Bloater',radius:.5625,mass:1.1,health:60,speed:2.25,drive:.8,pressureLimit:62,crushResistance:2.8,bounty:6,leak:2,color:'#a678d4'},
  husk: {id:'husk',index:5,name:'Husk',radius:.35625,mass:.85,health:34,speed:2.9,drive:1,pressureLimit:10,crushResistance:.5,bounty:4,leak:1,color:'#9edce8'},
};

/** Enemy bounties are accumulated as points; 10 points pay one Metal. */
export const ENEMY_BOUNTY_DIVISOR=10;

const wgslNumber=(value:number):string=>Number.isInteger(value)?`${value}.0`:String(value);
const hexRgb=(hex:string):readonly number[]=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
const enemyCases=(field:keyof EnemyDef,format:(value:never)=>string=wgslNumber):string=>Object.values(ENEMIES).map(enemy=>`case ${enemy.index}u: { return ${format(enemy[field] as never)}; }`).join('\n');
/** Generated from ENEMIES so CPU spawning and every GPU stage share one source of truth. */
export const ENEMY_WGSL=/* wgsl */`
fn enemySpeed(kind:u32)->f32 { switch kind { ${enemyCases('speed')} default: { return ${wgslNumber(ENEMIES.shambler.speed)}; } } }
fn enemyDrive(kind:u32)->f32 { switch kind { ${enemyCases('drive')} default: { return ${wgslNumber(ENEMIES.shambler.drive)}; } } }
fn enemyPressureLimit(kind:u32)->f32 { switch kind { ${enemyCases('pressureLimit')} default: { return ${wgslNumber(ENEMIES.shambler.pressureLimit)}; } } }
fn enemyCrushResistance(kind:u32)->f32 { switch kind { ${enemyCases('crushResistance')} default: { return ${wgslNumber(ENEMIES.shambler.crushResistance)}; } } }
fn enemyBountyPoints(kind:u32)->u32 { switch kind { ${enemyCases('bounty',value=>`${value}u`)} default: { return ${ENEMIES.shambler.bounty}u; } } }
fn enemyLeak(kind:u32)->u32 { switch kind { ${enemyCases('leak',value=>`${value}u`)} default: { return ${ENEMIES.shambler.leak}u; } } }
fn enemyColor(kind:u32)->vec3f { switch kind { ${enemyCases('color',value=>`vec3f(${hexRgb(String(value)).map(wgslNumber).join(',')})`)} default: { return vec3f(${hexRgb(ENEMIES.shambler.color).map(wgslNumber).join(',')}); } } }
`;

// The horde enters from beyond the west edge. The first gate is deliberately
// continuous from the top and bottom edges, leaving one defendable middle gap.
export const DEFAULT_MAP: WorldMap = {
  id:'pressure-front-bastion', width:160, height:100,
  obstacles:[
    {x:48,y:0,width:8,height:40},
    {x:48,y:60,width:8,height:40},
    {x:84,y:0,width:8,height:40},
    {x:68,y:36,width:24,height:4},
    {x:84,y:60,width:8,height:40},
    {x:84,y:60,width:24,height:4},
    {x:120,y:0,width:8,height:36},
    {x:120,y:64,width:8,height:36},
  ],
  spawn:{x:0,y:20,width:8,height:60}, goal:{x:156,y:50}, goalRadius:4,
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
  // Repulsors remain local crowd-control tools even at high tower levels.
  range += level * (tower.kind==='repulsor' ? .2 : 1.25); damage *= 1 + level * .12;
  const veteran=veterancyMultiplier(tower.veterancy ?? veterancyLevel(tower.veterancyXp ?? 0));
  range*=1+(veteran-1)*.55; damage*=veteran; cooldown/=1+(veteran-1)*.28;
  if (tower.branch === 0) {
    if (tower.kind==='repulsor') { force *= 1.4; radius *= .8; range += 1; }
    if (tower.kind==='mortar') { damage *= 1.6; radius *= .78; cooldown *= 1.12; }
    if (tower.kind==='autocannon') { damage *= 1.5; range *= 1.25; }
    if (tower.kind==='cryo') { range *= 1.3; radius *= 1.2; cooldown *= .85; }
    if (tower.kind==='tesla') { damage *= 1.45; radius *= 1.25; }
    if (tower.kind==='rocket') { damage *= 1.6; radius *= .8; }
    if (tower.kind==='railgun') { damage *= 1.75; cooldown *= 1.15; }
    if (tower.kind==='incinerator') { damage *= 1.55; radius *= .82; }
  }
  if (tower.branch === 1) {
    if (tower.kind==='repulsor') { cooldown *= .8; radius *= 1.3; }
    if (tower.kind==='mortar') { cooldown *= .68; radius *= 1.45; damage *= .78; }
    if (tower.kind==='autocannon') { cooldown *= .65; radius *= 2; force += 3; }
    if (tower.kind==='cryo') { range *= 1.5; radius *= 1.5; cooldown *= .85; }
    if (tower.kind==='tesla') { range *= 1.3; radius *= 1.5; cooldown *= .78; }
    if (tower.kind==='rocket') { cooldown *= .62; radius *= 1.45; damage *= .8; }
    if (tower.kind==='railgun') { cooldown *= .58; range *= 1.18; }
    if (tower.kind==='incinerator') { range *= 1.18; radius *= 1.4; cooldown *= .82; damage *= .82; }
  }
  for (const bonus of bonuses) {
    if (bonus === 'hydraulic-advantage' && tower.kind === 'repulsor') { force *= 1.3; cooldown *= 1.12; }
    if (bonus === 'cold-field' && tower.kind === 'cryo') radius *= 1.2;
    if (bonus === 'kinetic-feed' && tower.kind === 'autocannon') cooldown *= .85;
    if (bonus === 'blast-casing' && (tower.kind === 'mortar' || tower.kind === 'rocket')) damage *= 1.15;
  }
  if (commandUpgrades.includes('targeting-grid')) range *= 1.18;
  if (commandUpgrades.includes('ammunition-forge')) damage *= 1.25;
  if (tower.kind==='repulsor') {
    const impactDamage=[3,3,4,5,6];
    for (let i=0;i<impactDamage.length;i++) if(commandUpgrades.includes(`repulsor-impact-${i+1}`)) damage+=impactDamage[i];
    if(commandUpgrades.includes('repulsor-impact-5')) force*=1.08;
  }
  const ranks=(id:string)=>statUpgrades.filter(upgrade=>upgrade===id).length;
  damage*=1+ranks('damage')*.04;
  range*=1+ranks('range')*.03;
  cooldown/=1+ranks('rate')*.035;
  force*=1+ranks('force')*.05;
  return {...base,range,cooldown,damage,force,radius,peakPressureKpa:scaledPeakPressure(base,damage,force)};
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
