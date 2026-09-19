import {P, PARTICLE_FLOATS, type CommandUpgrade, type EnemyDef, type EnemyKind, type SpawnBatch, type Tower, type TowerDef, type TowerKind, type WorldMap} from '../contracts/index.ts';

export const TOWERS: Record<TowerKind, TowerDef> = {
  repulsor: {id:'repulsor', name:'Repulsor', description:'Pulses enemies toward the choke walls.', cost:90, range:15, cooldown:1.05, damage:2, force:30, radius:3.4, color:'#50d5ff', branches:['Ram','Wave']},
  mortar: {id:'mortar', name:'Mortar', description:'Lobs a concussive shell into dense crowds.', cost:120, range:38, cooldown:2.25, damage:22, force:18, radius:4.8, color:'#ff9b55', branches:['Siege','Cluster']},
  autocannon: {id:'autocannon', name:'Autocannon', description:'Rapidly picks off runners and knocks them back.', cost:105, range:28, cooldown:.22, damage:5, force:9, radius:.8, color:'#ffe46b', branches:['Piercer','Suppressor']},
  cryo: {id:'cryo', name:'Cryo Emitter', description:'Slows and shoves a cone of incoming enemies.', cost:110, range:13, cooldown:.7, damage:1, force:6, radius:4.1, color:'#a995ff', branches:['Deep Freeze','Cold Front']},
  tesla: {id:'tesla', name:'Tesla Coil', description:'Arcs, locks down, and shoves close targets.', cost:140, range:20, cooldown:.48, damage:7, force:8, radius:5.2, color:'#9a7dff', branches:['Capacitor','Storm Cell']},
  rocket: {id:'rocket', name:'Rocket Pod', description:'Launches wide blast volleys into packed swarms.', cost:165, range:44, cooldown:2.9, damage:34, force:24, radius:6.6, color:'#ff5f48', branches:['Warhead','Salvo']},
  railgun: {id:'railgun', name:'Railgun', description:'Penetrates and hurls targets along a long firing lane.', cost:180, range:48, cooldown:.78, damage:38, force:26, radius:1.1, color:'#73f5d2', branches:['Slug','Accelerator']},
};

const infrastructureResearch=(prefix:string,name:string,description:string,cost:number):readonly CommandUpgrade[]=>Array.from({length:20},(_,index)=>({id:`${prefix}-${index+1}`,name:`${name} ${index+1}`,description,cost:Math.round(cost+(index*42)+(Math.sqrt(index)*28))}));

export const COMMAND_UPGRADES: readonly CommandUpgrade[] = [
  {id:'targeting-grid',name:'Targeting Grid',description:'+18% range to every tower.',cost:260},
  {id:'ammunition-forge',name:'Ammunition Forge',description:'+25% damage to every tower.',cost:300},
  {id:'bulkhead-plating',name:'Bulkhead Plating',description:'+5 base integrity immediately.',cost:220},
  {id:'salvage-magnets',name:'Salvage Magnets',description:'+25% Metal recovered from kills.',cost:280},
  {id:'repulsor-impact-1',name:'Impact Coils I',description:'Repulsors deal +3 pulse damage.',cost:90},
  {id:'repulsor-impact-2',name:'Impact Coils II',description:'Repulsors deal +3 pulse damage.',cost:140},
  {id:'repulsor-impact-3',name:'Impact Coils III',description:'Repulsors deal +4 pulse damage.',cost:200},
  {id:'repulsor-impact-4',name:'Impact Coils IV',description:'Repulsors deal +5 pulse damage.',cost:270},
  {id:'repulsor-impact-5',name:'Impact Coils V',description:'Repulsors deal +6 pulse damage and +8% force.',cost:350},
  ...infrastructureResearch('wall-engineering','WALL ENGINEERING','Raises Metal Wall pressure capacity and lifespan.',90),
  ...infrastructureResearch('barbed-wire','BARBED WIRE','Raises wire damage, slow duration, resistance, and lifespan.',80),
];

const researchLevel=(upgrades:readonly string[],prefix:string)=>upgrades.filter(id=>new RegExp(`^${prefix}-\\d+$`).test(id)).length;
const researchMultiplier=(level:number)=>1+.58*Math.log1p(Math.max(0,Math.min(20,level)));
export const barbedWireStats=(upgrades:readonly string[])=>{const multiplier=researchMultiplier(researchLevel(upgrades,'barbed-wire'));return {damage:.45*multiplier,slow:.65*multiplier,durability:140*multiplier,resistance:1.75*multiplier};};
export const metalWallStats=(upgrades:readonly string[])=>{const multiplier=researchMultiplier(researchLevel(upgrades,'wall-engineering'));return {durability:240*multiplier,resistance:34*multiplier};};

/** Packs authored towers into the four supported GPU weapon behaviours. */
export const towerBehavior=(kind:TowerKind):number=>({repulsor:0,mortar:1,autocannon:2,cryo:3,tesla:3,rocket:1,railgun:2}[kind]);
export const MAX_VETERANCY=20;
export const veterancyLevel=(xp:number):number=>Math.min(MAX_VETERANCY,Math.floor(Math.log1p(Math.max(0,xp)/40)/Math.log(1.42)));
/** Semilogarithmic: rank 1 matters, rank 20 is strong but never breaks balance. */
export const veterancyMultiplier=(level:number):number=>1+.115*Math.log1p(Math.min(MAX_VETERANCY,Math.max(0,level)));

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {id:'shambler', index:0, name:'Shambler', radius:.22, mass:1, health:30, speed:2.5, crushTolerance:1, bounty:3, leak:1, color:'#76c66e'},
  runner: {id:'runner', index:1, name:'Runner', radius:.18, mass:.7, health:18, speed:4.7, crushTolerance:.72, bounty:3, leak:1, color:'#e6d45d'},
  brute: {id:'brute', index:2, name:'Brute', radius:.32, mass:3, health:100, speed:1.55, crushTolerance:2.1, bounty:8, leak:3, color:'#cf6d68'},
};

// Two wall segments leave a 24-world-unit choke at the map's centre.
export const DEFAULT_MAP: WorldMap = {
  id:'pressure-front', width:160, height:100,
  obstacles:[{x:88,y:0,width:6,height:38},{x:88,y:62,width:6,height:38}],
  spawn:{x:2,y:35,width:20,height:30}, goal:{x:156,y:50}, goalRadius:4,
};

export function validateContent(): void {
  const finite = (value:number, label:string) => { if (!Number.isFinite(value)) throw new Error(`${label} must be finite`); };
  for (const [key,tower] of Object.entries(TOWERS) as [TowerKind,TowerDef][]) {
    if (tower.id !== key || tower.cost <= 0 || tower.range <= 0 || tower.cooldown <= 0 || tower.damage < 0 || tower.force < 0 || tower.radius < 0 || tower.branches.length !== 2 || tower.branches[0] === tower.branches[1]) throw new Error(`Invalid tower ${tower.id}`);
    [tower.cost,tower.range,tower.cooldown,tower.damage,tower.force,tower.radius].forEach((value,index)=>finite(value,`${tower.id}[${index}]`));
  }
  const seen = new Set<number>();
  for (const [key,enemy] of Object.entries(ENEMIES) as [EnemyKind,EnemyDef][]) {
    if (enemy.id !== key || seen.has(enemy.index) || enemy.radius <= 0 || enemy.mass <= 0 || enemy.health <= 0 || enemy.speed <= 0 || enemy.bounty < 0 || enemy.leak <= 0) throw new Error(`Invalid enemy ${enemy.id}`);
    seen.add(enemy.index); [enemy.radius,enemy.mass,enemy.health,enemy.speed,enemy.crushTolerance,enemy.bounty,enemy.leak].forEach((value,index)=>finite(value,`${enemy.id}[${index}]`));
  }
}

/** Compiles the small, supported progression set into a combat-ready definition. */
export function compileTower(tower: Tower, bonuses: readonly string[] = [], commandUpgrades: readonly string[] = []): TowerDef {
  const base=TOWERS[tower.kind];
  let range=base.range, cooldown=base.cooldown, damage=base.damage, force=base.force, radius=base.radius;
  const level=Math.max(0,tower.level);
  range += level * 1.25; damage *= 1 + level * .12;
  const veteran=veterancyMultiplier(tower.veterancy ?? veterancyLevel(tower.veterancyXp ?? 0));
  range*=1+(veteran-1)*.55; damage*=veteran; cooldown/=1+(veteran-1)*.28;
  if (tower.branch === 0) {
    if (tower.kind==='repulsor') { force *= 1.55; radius *= .8; range += 2; }
    if (tower.kind==='mortar') { damage *= 1.6; radius *= .78; cooldown *= 1.12; }
    if (tower.kind==='autocannon') { damage *= 1.5; range *= 1.25; }
    if (tower.kind==='cryo') { range *= 1.3; radius *= 1.2; cooldown *= .85; }
    if (tower.kind==='tesla') { damage *= 1.45; radius *= 1.25; }
    if (tower.kind==='rocket') { damage *= 1.6; radius *= .8; }
    if (tower.kind==='railgun') { damage *= 1.75; cooldown *= 1.15; }
  }
  if (tower.branch === 1) {
    if (tower.kind==='repulsor') { cooldown *= .7; radius *= 1.5; }
    if (tower.kind==='mortar') { cooldown *= .68; radius *= 1.45; damage *= .78; }
    if (tower.kind==='autocannon') { cooldown *= .65; radius *= 2; force += 3; }
    if (tower.kind==='cryo') { range *= 1.5; radius *= 1.5; cooldown *= .85; }
    if (tower.kind==='tesla') { range *= 1.3; radius *= 1.5; cooldown *= .78; }
    if (tower.kind==='rocket') { cooldown *= .62; radius *= 1.45; damage *= .8; }
    if (tower.kind==='railgun') { cooldown *= .58; range *= 1.18; }
  }
  for (const bonus of bonuses) {
    if (bonus === 'hydraulic-advantage' && tower.kind === 'repulsor') { force *= 1.3; cooldown *= 1.12; }
    if (bonus === 'cold-field' && tower.kind === 'cryo') radius *= 1.2;
  }
  if (commandUpgrades.includes('targeting-grid')) range *= 1.18;
  if (commandUpgrades.includes('ammunition-forge')) damage *= 1.25;
  if (tower.kind==='repulsor') {
    const impactDamage=[3,3,4,5,6];
    for (let i=0;i<impactDamage.length;i++) if(commandUpgrades.includes(`repulsor-impact-${i+1}`)) damage+=impactDamage[i];
    if(commandUpgrades.includes('repulsor-impact-5')) force*=1.08;
  }
  return {...base,range,cooldown,damage,force,radius};
}

function random(seed:number):()=>number { let state=(seed >>> 0) || 1; return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state / 0x1_0000_0000; }; }

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
  // Streamed batches rotate through an inlet lattice rather than restacking on a single cell.
  const columns=maxColumns;
  let cursor=0, slot=0;
  for (const batch of batches) {
    const count=Math.max(0,Math.floor(batch.count)), enemy=ENEMIES[batch.kind], jitter=random(batch.seed);
    for (let i=0;i<count && slot<actual;i++,slot++) {
      const cell=(spawnSlot+slot)%latticeCapacity,col=cell%columns,row=Math.floor(cell/columns);
      const baseX=map.spawn.x+(col+.5)*spacing, baseY=map.spawn.y+(row+.5)*spacing;
      // A tiny deterministic jitter is safely smaller than the lattice clearance.
      const offset=(jitter()-.5)*.008;
      output[cursor+P.x]=baseX+offset; output[cursor+P.y]=baseY+(jitter()-.5)*.008;
      output[cursor+P.radius]=enemy.radius; output[cursor+P.mass]=enemy.mass;
      output[cursor+P.hp]=enemy.health; output[cursor+P.maxHp]=enemy.health;
      output[cursor+P.kind]=enemy.index; output[cursor+P.alive]=1; output[cursor+P.generation]=1;
      cursor += PARTICLE_FLOATS;
    }
    if (slot>=actual) break;
  }
  return output;
}
