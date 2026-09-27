import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeSnapshot} from './snapshot.ts';
test('room text cannot inject markup or break out of UI attributes',()=>{
 const input={metal:3000,selected:null,buildings:[{kind:'rifle" onclick="alert(1)',id:1}],message:'<img src=x onerror=alert(1)>'};
 const safe=safeSnapshot(input);assert.equal(safe.metal,3000);assert.equal(safe.selected,null);assert.equal(safe.buildings[0].kind,'rifle&quot; onclick=&quot;alert(1)');assert.equal(safe.message,'&lt;img src=x onerror=alert(1)&gt;');assert.notEqual(safe,input);
});
