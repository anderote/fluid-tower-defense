import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {validateEditorMap} from './index.ts';
test('editor map validation protects the boss lane and spawn',()=>{
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:88,y:48,width:4,height:4}]}), 'The y=50 boss corridor must remain clear.');
  assert.match(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:4,y:4,width:4,height:4}]} )??'',/spawn/);
});
