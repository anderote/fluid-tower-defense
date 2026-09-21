import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ENEMIES, DEFAULT_MAP, MAX_VETERANCY, TOWERS, barbedWireStats, compileTower, createParticles, metalWallStats, towerBehavior, validateContent, veterancyLevel, veterancyMultiplier, veterancyXpForLevel} from './index.ts';
import {P, PARTICLE_FLOATS, type Tower} from '../contracts/index.ts';

test('content registry is valid and has six readable enemy roles',()=>{ validateContent(); assert.equal(Object.keys(TOWERS).length,9);assert.equal(Object.keys(ENEMIES).length,6);assert.ok(ENEMIES.rager.drive>ENEMIES.shambler.drive);assert.ok(ENEMIES.husk.pressureLimit<ENEMIES.brute.pressureLimit); });
test('turret placement costs follow the intended power curve',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(TOWERS).map(([kind,tower])=>[kind,tower.cost])),{repulsor:120,mortar:350,autocannon:80,cryo:200,tesla:600,rocket:1_600,railgun:2_500,incinerator:800,crusher:450});
});
test('enemy bodies use the tuned physical footprint',()=>{
 assert.deepEqual(Object.values(ENEMIES).map(enemy=>enemy.radius),[.4125,.31875,.6375,.43125,.5625,.35625]);
});
test('particle generator reports its actual populated prefix and keeps bodies apart',()=>{
 const particles=createParticles([{count:20,kind:'brute',seed:4}],DEFAULT_MAP,10);
 assert.equal(particles.length,10*PARTICLE_FLOATS);
 for(let i=0;i<10;i++) for(let j=0;j<i;j++) assert.ok(Math.hypot(particles[i*16+P.x]-particles[j*16+P.x],particles[i*16+P.y]-particles[j*16+P.y]) >= particles[i*16+P.radius]+particles[j*16+P.radius]);
});
test('streamed particles vary their offscreen inlet cells',()=>{
 const first=createParticles([{count:10,kind:'brute',seed:4}],DEFAULT_MAP,10,0);
 const later=createParticles([{count:10,kind:'brute',seed:4}],DEFAULT_MAP,10,10);
 const rows=new Set(Array.from({length:10},(_,index)=>Math.floor(first[index*PARTICLE_FLOATS+P.y])));
 assert.ok(rows.size>1,'the first arrivals should not sweep across one lattice row');
 assert.notDeepEqual(Array.from(first),Array.from(later));
});
test('inlet streams originate beyond the visible west edge and span a thick column',()=>{
 const particles=createParticles([{count:20,kind:'shambler',seed:11,band:'inlet'}],DEFAULT_MAP,20);
 for(let index=0;index<20;index++){
  const x=particles[index*PARTICLE_FLOATS+P.x],y=particles[index*PARTICLE_FLOATS+P.y];
  assert.ok(x<0,`expected offscreen x coordinate, received ${x}`);
  assert.ok(y>=DEFAULT_MAP.spawn.y+DEFAULT_MAP.spawn.height*.08&&y<=DEFAULT_MAP.spawn.y+DEFAULT_MAP.spawn.height*.92);
 }
});
test('each tower branch changes a useful supported combat stat',()=>{
  for (const kind of Object.keys(TOWERS) as (keyof typeof TOWERS)[]) {
    const base={id:1,kind,x:84,y:50,level:1,branch:-1,angle:0,cooldown:0,spent:TOWERS[kind].cost};
    const plain=compileTower(base), a=compileTower({...base,branch:0}), b=compileTower({...base,branch:1});
    assert.notDeepEqual(a,plain,`${kind} branch A`); assert.notDeepEqual(b,plain,`${kind} branch B`);
  }
});

test('tower identities use dedicated combat behaviours where required',()=>{
 assert.equal(towerBehavior('rocket'),12);
 assert.equal(towerBehavior('incinerator'),14);
 assert.notEqual(towerBehavior('rocket'),towerBehavior('mortar'));
 assert.match(TOWERS.autocannon.description,/knocks them back/i);
});
test('veterancy compounds small rank bonuses into meaningful late-service performance',()=>{
 const recruit=veterancyMultiplier(0), firstRank=veterancyMultiplier(1), experienced=veterancyMultiplier(50), legend=veterancyMultiplier(MAX_VETERANCY);
 assert.equal(recruit,1);
 assert.ok(firstRank>1&&firstRank<1.1,'one rank should be a slight improvement');
 assert.ok(experienced>=1.5&&experienced<1.6,'mid-career units should gain a meaningful damage bonus');
 assert.equal(legend,2.5,'rank cap should reach two and a half times base damage');
 assert.equal(veterancyLevel(veterancyXpForLevel(10)),10);
 assert.equal(veterancyXpForLevel(MAX_VETERANCY),648_000,'rank cap should require 648,000 credited kills');
 const base:Tower={id:1,kind:'autocannon',x:50,y:50,level:0,branch:-1,angle:0,cooldown:0,spent:0,veterancy:0};
 const veteran=compileTower({...base,veterancy:MAX_VETERANCY});
 assert.equal(veteran.damage,compileTower(base).damage*2.5);
 assert.ok(1/veteran.cooldown>=1.4*(1/compileTower(base).cooldown),'veterans should fire substantially faster');
 assert.ok(veteran.range>=1.8*compileTower(base).range,'veterans should gain substantial targeting reach');
});
test('Repulsor upgrades retain a short-range control role',()=>{
 const tower:Tower={id:1,kind:'repulsor',x:50,y:50,level:50,branch:0,angle:0,cooldown:0,spent:0,veterancy:MAX_VETERANCY};
 const boosted=compileTower(tower,['hydraulic-advantage'],['targeting-grid','repulsor-impact-5'],[...Array(10).fill('range'),...Array(10).fill('force')]);
 assert.ok(boosted.range<100,'maximum research must keep even legendary Repulsor coverage below arena-wide range');
 assert.ok(boosted.force<50,'stacked impulse upgrades must remain bounded');
 const wave=compileTower({...tower,level:0,branch:1,veterancy:0});
 assert.ok(wave.cooldown>=1,'Wave specialization must not restore rapid pulse spam');
 assert.ok(wave.radius<4,'Wave specialization must keep a limited cone');
});
test('fortifications withstand sustained swarm pressure at base research',()=>{
 const wall=metalWallStats([]),wire=barbedWireStats([]);
 assert.deepEqual(wall,{durability:2_880,resistance:90});
 assert.equal(wire.durability,560);
 assert.equal(wire.resistance,7);
 assert.ok(wire.wear<wire.damage,'wire wear must be independent from its outgoing damage');
 const researched=barbedWireStats(Array.from({length:20},(_,index)=>`barbed-wire-${index+1}`));
 assert.ok(researched.durability>wire.durability&&researched.resistance>wire.resistance);
 assert.equal(researched.wear,wire.wear);
});
