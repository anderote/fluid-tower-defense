import {test} from 'node:test';
import assert from 'node:assert/strict';
import {P,PARTICLE_BYTES,PARTICLE_FLOATS} from '../src/contracts/index.ts';
test('CPU particle fields occupy the exact four-vec4 ABI',()=>{assert.equal(PARTICLE_BYTES,64);assert.equal(PARTICLE_FLOATS,16);assert.deepEqual(Object.values(P),Array.from({length:16},(_,i)=>i));});
