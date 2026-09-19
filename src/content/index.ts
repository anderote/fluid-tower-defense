import {P, PARTICLE_FLOATS, type EnemyDef, type EnemyKind, type SpawnBatch, type Tower, type TowerDef, type TowerKind, type WorldMap} from '../contracts/index.ts';

export const TOWERS: Record<TowerKind, TowerDef> = {
  repulsor: {id:'repulsor', name:'Repulsor', description:'Pulses enemies toward the choke walls.', cost:90, range:15, cooldown:1.05, damage:2, force:30, radius:3.4, color:'#50d5ff', branches:['Ram','Wave']},
  mortar: {id:'mortar', name:'Mortar', description:'Lobs a concussive shell into dense crowds.', cost:120, range:27, cooldown:2.25, damage:22, force:18, radius:4.8, color:'#ff9b55', branches:['Siege','Cluster']},
  autocannon: {id:'autocannon', name:'Autocannon', description:'Rapidly picks off runners and stragglers.', cost:105, range:19, cooldown:.22, damage:5, force:4, radius:.8, color:'#ffe46b', branches:['Piercer','Suppressor']},
  cryo: {id:'cryo', name:'Cryo Emitter', description:'Slows a cone of incoming enemies.', cost:110, range:13, cooldown:.7, damage:1, force:0, radius:4.1, color:'#a995ff', branches:['Deep Freeze','Cold Front']},
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {id:'shambler', index:0, name:'Shambler', radius:.22, mass:1, health:30, speed:2.5, crushTolerance:1, bounty:3, leak:1, color:'#76c66e'},
  runner: {id:'runner', index:1, name:'Runner', radius:.18, mass:.7, health:18, speed:4.7, crushTolerance:.72, bounty:3, leak:1, color:'#e6d45d'},
  brute: {id:'brute', index:2, name:'Brute', radius:.32, mass:3, health:100, speed:1.55, crushTolerance:2.1, bounty:8, leak:3, color:'#cf6d68'},
};

// Two wall segments leave a 24-world-unit choke at the map's centre.
export const DEFAULT_MAP: WorldMap = {
  id:'pressure-front', width:160, height:100,
  obstacles:[{x:88,y:0,width:6,height:38},{x:88,y:62,width:6,height:38}],
  spawn:{x:2,y:2,width:80,height:96}, goal:{x:156,y:50}, goalRadius:4,
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
export function compileTower(tower: Tower, bonuses: readonly string[] = []): TowerDef {
  const base=TOWERS[tower.kind];
  let range=base.range, cooldown=base.cooldown, damage=base.damage, force=base.force, radius=base.radius;
  const level=Math.max(0,tower.level);
  range += level * 1.25; damage *= 1 + level * .12;
  if (tower.branch === 0) { force *= 1.35; radius *= .82; }
  if (tower.branch === 1) { cooldown *= .78; radius *= 1.25; }
  for (const bonus of bonuses) {
    if (bonus === 'hydraulic-advantage' && tower.kind === 'repulsor') { force *= 1.3; cooldown *= 1.12; }
    if (bonus === 'cold-fracture' && tower.kind === 'cryo') radius *= 1.2;
  }
  return {...base,range,cooldown,damage,force,radius};
}

function random(seed:number):()=>number { let state=(seed >>> 0) || 1; return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state / 0x1_0000_0000; }; }

/** Encodes only the populated prefix. Callers must use `particles.length / PARTICLE_FLOATS`. */
export function createParticles(batches: readonly SpawnBatch[], map: WorldMap, capacity: number): Float32Array {
  validateContent();
  const requested = batches.reduce((sum,batch)=>sum+Math.max(0,Math.floor(batch.count)),0);
  const limit = Math.max(0,Math.min(Math.floor(capacity), requested));
  if (requested > limit) console.warn(`Particle spawn capped: requested ${requested}, capacity ${limit}`);
  if (!limit) return new Float32Array(0);
  const largest = Math.max(...batches.filter(batch=>batch.count>0).map(batch=>ENEMIES[batch.kind].radius), .18);
  const spacing = largest * 2 + .02;
  const columns = Math.floor(map.spawn.width / spacing);
  const rows = Math.floor(map.spawn.height / spacing);
  const latticeCapacity = columns * rows;
  const actual = Math.min(limit,latticeCapacity);
  if (limit > actual) console.warn(`Particle spawn region holds ${actual} non-overlapping particles; ${limit - actual} remain pending`);
  const output = new Float32Array(actual * PARTICLE_FLOATS);
  let cursor=0, slot=0;
  for (const batch of batches) {
    const count=Math.max(0,Math.floor(batch.count)), enemy=ENEMIES[batch.kind], jitter=random(batch.seed);
    for (let i=0;i<count && slot<actual;i++,slot++) {
      const col=slot%columns,row=Math.floor(slot/columns);
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
