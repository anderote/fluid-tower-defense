import test from 'node:test';
import assert from 'node:assert/strict';
import {GPUProfiler,summarize} from './profiler.ts';
test('timing summaries preserve milliseconds and handle no samples',()=>{
 assert.deepEqual(summarize([]),{samples:0,medianMs:0,p95Ms:0,maxMs:0});
 assert.deepEqual(summarize([1,2,3,100]),{samples:4,medianMs:2,p95Ms:100,maxMs:100});
});
test('unsupported timestamps leave encoder unchanged and need no GPU resources',async()=>{
 const p=new GPUProfiler({features:new Set()} as unknown as GPUDevice),encoder={} as GPUCommandEncoder;
 const frame=p.wrap(encoder);assert.equal(frame.encoder,encoder);frame.resolve();await frame.read();
 assert.deepEqual(p.report(),{supported:false,skipped:0,errors:[],passes:{}});p.destroy();
});
