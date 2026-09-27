import assert from 'node:assert/strict';
import test from 'node:test';
import {ENEMIES} from '../content/index.ts';
import {ZOMBIE_KINDS,ZOMBIE_PROFILES,ZOMBIE_ROSTER_WGSL} from './zombie-roster.ts';

test('every enemy type has an authored animated sprite profile',()=>{
  assert.deepEqual([...ZOMBIE_KINDS].sort(),Object.keys(ENEMIES).sort());
  assert.equal(new Set(ZOMBIE_KINDS).size,Object.keys(ENEMIES).length);
  for(const kind of ZOMBIE_KINDS){
    assert.ok(ZOMBIE_PROFILES[kind].stride>0);
    assert.match(ZOMBIE_ROSTER_WGSL,new RegExp(`case ${ENEMIES[kind].index}u`));
  }
});
