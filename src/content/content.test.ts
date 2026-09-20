import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ENEMIES, DEFAULT_MAP, TOWERS, compileTower, createParticles, towerBehavior, validateContent} from './index.ts';
import {P, PARTICLE_FLOATS, type Tower} from '../contracts/index.ts';

test('content registry is valid and has six readable enemy roles',()=>{ validateContent(); assert.equal(Object.keys(TOWERS).length,8);assert.equal(Object.keys(ENEMIES).length,6);assert.ok(ENEMIES.rager.drive>ENEMIES.shambler.drive);assert.ok(ENEMIES.husk.pressureLimit<ENEMIES.brute.pressureLimit); });
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
test('Repulsor upgrades retain a short-range control role',()=>{
 const tower:Tower={id:1,kind:'repulsor',x:50,y:50,level:50,branch:0,angle:0,cooldown:0,spent:0,veterancy:20};
 const boosted=compileTower(tower,['hydraulic-advantage'],['targeting-grid','repulsor-impact-5'],[...Array(10).fill('range'),...Array(10).fill('force')]);
 assert.ok(boosted.range<40,'maximum research must not restore arena-wide Repulsor coverage');
 assert.ok(boosted.force<50,'stacked impulse upgrades must remain bounded');
 const wave=compileTower({...tower,level:0,branch:1,veterancy:0});
 assert.ok(wave.cooldown>=1,'Wave specialization must not restore rapid pulse spam');
 assert.ok(wave.radius<4,'Wave specialization must keep a limited cone');
});
