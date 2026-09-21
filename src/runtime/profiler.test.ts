import test from 'node:test';
import assert from 'node:assert/strict';
import {CPUProfiler,GPUProfiler,summarize} from './profiler.ts';
test('CPU timings are bounded and reject invalid durations',()=>{
 const p=new CPUProfiler();p.record('tick',Infinity);p.record('tick',-1);
 for(let i=0;i<610;i++)p.record('tick',i);
 assert.deepEqual(p.report().tick,{samples:600,medianMs:309,p95Ms:579,maxMs:609});
});
test('timing summaries preserve milliseconds and handle no samples',()=>{
 assert.deepEqual(summarize([]),{samples:0,medianMs:0,p95Ms:0,maxMs:0});
 assert.deepEqual(summarize([1,2,3,100]),{samples:4,medianMs:2,p95Ms:100,maxMs:100});
});
test('unsupported timestamps leave encoder unchanged and need no GPU resources',async()=>{
 const p=new GPUProfiler({features:new Set()} as unknown as GPUDevice),encoder={} as GPUCommandEncoder;
 const frame=p.wrap(encoder);assert.equal(frame.encoder,encoder);frame.resolve();await frame.read();
 assert.deepEqual(p.report(),{supported:false,skipped:0,errors:[],passes:{}});p.destroy();
});
test('timestamp profiling bounds in-flight buffers, passes and retained samples',async()=>{
 const previous=globalThis.GPUBufferUsage,previousMap=globalThis.GPUMapMode;
 globalThis.GPUBufferUsage={QUERY_RESOLVE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8} as GPUBufferUsage;
 globalThis.GPUMapMode={READ:1,WRITE:2};
 let destroyed=0;
 const device={features:new Set(['timestamp-query']),createQuerySet:()=>({destroy(){destroyed++;}}),createBuffer:()=>({mapAsync:async()=>{},getMappedRange:()=>new BigUint64Array([100n,1000100n]).buffer,unmap(){},destroy(){destroyed++;}})} as unknown as GPUDevice;
 const native={beginComputePass(this:unknown,d:GPUComputePassDescriptor){assert.equal(this,native);assert.ok(d.timestampWrites);return {};},resolveQuerySet(){},copyBufferToBuffer(){}} as unknown as GPUCommandEncoder;
 try{
  const p=new GPUProfiler(device,1),frames=Array.from({length:3},()=>p.wrap(native));
  assert.equal(p.wrap(native).encoder,native);assert.equal(p.skipped,1);
  for(const frame of frames){frame.encoder.beginComputePass({label:'test'});frame.resolve();await frame.read();}
  for(let i=0;i<605;i++){const frame=p.wrap(native);frame.encoder.beginComputePass({label:'test'});frame.resolve();await frame.read();}
  assert.deepEqual(p.report().passes.test,{samples:600,medianMs:1,p95Ms:1,maxMs:1});
  const frame=p.wrap(native);frame.encoder.beginComputePass({label:'test'});
  // The second pass must remain native and untimed once the query budget is used.
  const plain={beginComputePass(d?:GPUComputePassDescriptor){assert.equal(d?.timestampWrites,undefined);return {};}};
  Object.assign(native,plain);frame.encoder.beginComputePass({label:'overflow'});frame.resolve();await frame.read();
  assert.equal(p.skipped,2);assert.deepEqual(p.errors,[]);p.destroy();assert.equal(destroyed,9);
 }finally{if(previous)globalThis.GPUBufferUsage=previous;else Reflect.deleteProperty(globalThis,'GPUBufferUsage');if(previousMap)globalThis.GPUMapMode=previousMap;else Reflect.deleteProperty(globalThis,'GPUMapMode');}
});
