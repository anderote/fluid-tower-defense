import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {validateEditorMap,wallAtPoint} from './index.ts';
test('editor permits building in former protected lanes and the spawn area',()=>{
  assert.equal(validateEditorMap(DEFAULT_MAP),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:100,y:48,width:4,height:4}]}),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:4,y:36,width:4,height:4}]}),undefined);
});
test('wall cells snap clicks on every map edge into the last valid cell',()=>{
  assert.deepEqual(wallAtPoint(DEFAULT_MAP,{x:0,y:0}),{x:0,y:0,width:4,height:4});
  assert.deepEqual(wallAtPoint(DEFAULT_MAP,{x:160,y:100}),{x:156,y:96,width:4,height:4});
});
test('editor accepts resized maps and more than sixty-four walls',()=>{
  const map={...DEFAULT_MAP,width:320,height:160,spawn:{...DEFAULT_MAP.spawn},goal:{x:316,y:80},obstacles:[]};
  for(let index=0;index<80;index++)map.obstacles.push({x:20+(index%20)*8,y:Math.floor(index/20)*8,width:4,height:4});
  assert.equal(validateEditorMap(map),undefined);
});
