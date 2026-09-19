import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ENEMIES, DEFAULT_MAP, TOWERS, createParticles, validateContent} from './index.ts';
import {P, PARTICLE_FLOATS} from '../contracts/index.ts';

test('content registry is valid and has the initial roster',()=>{ validateContent(); assert.equal(Object.keys(TOWERS).length,4);assert.equal(Object.keys(ENEMIES).length,3); });
test('particle generator reports its actual populated prefix and keeps bodies apart',()=>{
 const particles=createParticles([{count:20,kind:'brute',seed:4}],DEFAULT_MAP,10);
 assert.equal(particles.length,10*PARTICLE_FLOATS);
 for(let i=0;i<10;i++) for(let j=0;j<i;j++) assert.ok(Math.hypot(particles[i*16+P.x]-particles[j*16+P.x],particles[i*16+P.y]-particles[j*16+P.y]) >= particles[i*16+P.radius]+particles[j*16+P.radius]);
});
