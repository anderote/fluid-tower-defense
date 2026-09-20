import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeShotStates} from './shot-events.ts';

test('decodes the persistent firing serial and target from packed GPU state',()=>{
  const values=new Float32Array(24);
  values.set([.2,.22,42,19,0,7,3,1.25,11,4,0,0],0);
  values.set([1,1,0,0,0,0,0,0,12,0,0,0],12);
  assert.deepEqual(decodeShotStates(values,2),[{towerId:11,serial:4,launchTick:0,target:{x:42,y:19},angle:1.25}]);
});

test('ignores unused slots and clamps reads to the populated prefix',()=>{
  const values=new Float32Array(24);
  values.set([0,0,4,5,0,0,0,.5,8,2,0,0],12);
  assert.deepEqual(decodeShotStates(values,1),[]);
});
