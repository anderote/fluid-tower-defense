import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {validateEditorMap} from './index.ts';
test('editor permits building in former protected lanes and the spawn area',()=>{
  assert.equal(validateEditorMap(DEFAULT_MAP),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:100,y:48,width:4,height:4}]}),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:4,y:36,width:4,height:4}]}),undefined);
});
