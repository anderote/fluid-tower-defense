import test from 'node:test';import assert from 'node:assert/strict';
import {AdaptiveResolution,graphicsQuality} from './quality.ts';
test('adaptive graphics reacts to sustained slowdown and retains an effective reduction',()=>{
 const q=new AdaptiveResolution();for(let i=0;i<70;i++)q.observe(30);assert.equal(q.scale,.85);
 for(let i=0;i<150;i++)q.observe(16);assert.equal(q.scale,.85);
 for(let i=0;i<1250;i++)q.observe(8);assert.ok(q.scale>.85&&q.scale<=1);
});
test('CPU-bound trials revert instead of permanently degrading image quality',()=>{
 const q=new AdaptiveResolution();for(let i=0;i<180;i++)q.observe(30);assert.equal(q.scale,1);
 for(let i=0;i<200;i++)q.observe(30);assert.equal(q.scale,1);
});
test('manual quality, hidden tabs and interruptions cannot drive automatic adaptation',()=>{
 const q=new AdaptiveResolution();for(let i=0;i<100;i++){q.observe(100,false);q.observe(5000);q.observe(NaN);}assert.equal(q.scale,1);
 q.setMode('performance');for(let i=0;i<1000;i++)q.observe(8);assert.equal(q.scale,.5);
 q.setMode('balanced');assert.equal(q.scale,.75);assert.equal(graphicsQuality('broken'),'auto');
});
