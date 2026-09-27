import assert from 'node:assert/strict';
import test from 'node:test';
import {barrierCost,barrierLength,barrierSegments,sampleBarrier,simplifyBarrier,snapBarrierEndpoints,barrierRectDistance,barrierLinesConflict,barrierPlacementConflict} from './barrier-path.ts';

test('straight barriers retain an arbitrary-angle centerline while their collision samples remain compact',()=>{
 const points=[{x:2,y:3},{x:11,y:9}],segments=barrierSegments('fence',7,points);
 assert.ok(segments.length>10);
 assert.deepEqual(segments[0].from,points[0]);assert.deepEqual(segments.at(-1)!.to,points[1]);
 assert.ok(segments.every(segment=>segment.width<1.5&&segment.height<1.5));
});

test('diagonal fence collision tiles stay centered with equal clearance on either side',()=>{
 const segments=barrierSegments('fence',7,[{x:2,y:2},{x:8,y:8}]);
 const expected=.72/Math.sqrt(2);
 for(const segment of segments){
  const center={x:segment.x+segment.width/2,y:segment.y+segment.height/2};
  assert.ok(Math.abs(center.x-center.y)<.000001);
  assert.ok(Math.abs(segment.width-expected)<.000001);
  assert.equal(segment.width,segment.height);
 }
});

test('freeform barriers charge one panel price per five world units',()=>{
 assert.equal(barrierCost(5,45),45);assert.equal(barrierCost(5.01,45),90);
});

test('freehand wire is distance-sampled and removes redundant straight samples',()=>{
 const sampled=sampleBarrier([{x:0,y:0}],{x:3,y:0},.5),simplified=simplifyBarrier(sampled);
 assert.ok(sampled.length>4);assert.deepEqual(simplified,[{x:0,y:0},{x:3,y:0}]);assert.equal(barrierLength(simplified),3);
});

test('barrier endpoints snap to nearby fence connection points',()=>{
 const snapped=snapBarrierEndpoints([{x:0,y:0},{x:9,y:0}],[{x:1,y:.2},{x:8,y:.4}],1.5);
 assert.deepEqual(snapped,[{x:1,y:.2},{x:8,y:.4}]);
 assert.deepEqual(snapBarrierEndpoints([{x:0,y:0},{x:9,y:0}],[{x:3,y:0}],1),[{x:0,y:0},{x:9,y:0}]);
});

test('angled fence collision follows the centerline instead of its square bounds',()=>{
 const segment={from:{x:0,y:0},to:{x:4,y:4}};
 assert.ok(barrierRectDistance(segment,{x:1.8,y:1.8,width:.2,height:.2})<.36);
 assert.ok(barrierRectDistance(segment,{x:1.8,y:2.7,width:.2,height:.2})>.36);
});
test('fence paths may join exactly at endpoints and reject close crossings',()=>{
 const a={from:{x:0,y:0},to:{x:2,y:0}},joined={from:{x:2,y:0},to:{x:2,y:2}},crossing={from:{x:1,y:-1},to:{x:1,y:1}};
 assert.equal(barrierLinesConflict(a,joined),false);
 assert.equal(barrierLinesConflict(a,crossing),true);
});

test('snapped fence joins remain buildable across all adjacent collision samples',()=>{
 const existing=barrierSegments('fence',1,[{x:0,y:0},{x:5,y:0}]);
 for(const end of [{x:9,y:0},{x:8,y:1},{x:5,y:5}]){
  const points=snapBarrierEndpoints([{x:5.2,y:.1},end],[{x:0,y:0},{x:5,y:0}]);
  const added=barrierSegments('fence',2,points);
  assert.equal(added.some(a=>existing.some(b=>barrierPlacementConflict(a,b))),false);
 }
});

test('chain-link allows crossings, nearby parallel runs, and overlapping extensions',()=>{
 const existing=barrierSegments('fence',1,[{x:0,y:0},{x:5,y:0}]);
 for(const points of [[{x:2,y:-2},{x:2,y:2}],[{x:0,y:.2},{x:5,y:.2}],[{x:4,y:0},{x:9,y:0}]]){
  const added=barrierSegments('fence',2,points);
  assert.equal(added.some(a=>existing.some(b=>barrierPlacementConflict(a,b))),false);
 }
 const wire=barrierSegments('wire',3,[{x:2,y:-2},{x:2,y:2}]);
 assert.equal(wire.some(a=>existing.some(b=>barrierPlacementConflict(a,b))),true);
});
