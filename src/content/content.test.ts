import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ENEMIES, DEFAULT_MAP, TOWERS, compileTower, createParticles, towerBehavior, validateContent} from './index.ts';
import {P, PARTICLE_FLOATS} from '../contracts/index.ts';

test('content registry is valid and has the expanded roster',()=>{ validateContent(); assert.equal(Object.keys(TOWERS).length,8);assert.equal(Object.keys(ENEMIES).length,3); });
test('particle generator reports its actual populated prefix and keeps bodies apart',()=>{
 const particles=createParticles([{count:20,kind:'brute',seed:4}],DEFAULT_MAP,10);
 assert.equal(particles.length,10*PARTICLE_FLOATS);
 for(let i=0;i<10;i++) for(let j=0;j<i;j++) assert.ok(Math.hypot(particles[i*16+P.x]-particles[j*16+P.x],particles[i*16+P.y]-particles[j*16+P.y]) >= particles[i*16+P.radius]+particles[j*16+P.radius]);
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
