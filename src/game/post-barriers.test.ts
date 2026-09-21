import assert from 'node:assert/strict';
import test from 'node:test';
import {addBarrierPost,barrierCells,barrierPostAt,extendBarrier,reconcileBarrier,recycleBarrier,removeBarrierPost} from './post-barriers.ts';

test('posts snap to the original Red Alert four-unit art grid',()=>{
  assert.deepEqual(barrierPostAt({x:5.9,y:10.1},{width:20,height:16}),{x:4,y:8});
  assert.deepEqual(barrierPostAt({x:20,y:16},{width:20,height:16}),{x:16,y:12});
});

test('extending topology does not resurrect an earlier destroyed panel',()=>{
  const before=[{x:0,y:0},{x:12,y:0}],previous=[{x:0,y:0,width:4,height:4,health:100},{x:8,y:0,width:4,height:4,health:100},{x:12,y:0,width:4,height:4,health:100}];
  const evolved=extendBarrier(before,[...before,{x:12,y:8}],previous,cell=>({...cell,health:100}));
  assert.ok(!evolved.sections.some(cell=>cell.x===4&&cell.y===0));
  assert.deepEqual(evolved.added.map(cell=>[cell.x,cell.y]),[[12,4],[12,8]]);
});

test('nearby aligned posts produce continuous panels but distant and diagonal posts do not',()=>{
  assert.deepEqual(barrierCells([{x:0,y:0},{x:12,y:0}]).map(cell=>[cell.x,cell.y]),[[0,0],[4,0],[8,0],[12,0]]);
  assert.deepEqual(barrierCells([{x:0,y:0},{x:20,y:0},{x:4,y:4}]).map(cell=>[cell.x,cell.y]),[[0,0],[4,4],[20,0]].sort((a,b)=>a[1]-b[1]||a[0]-b[0]));
});

test('a junction connects only to the nearest post in each cardinal direction',()=>{
  const cells=barrierCells([{x:8,y:8},{x:8,y:0},{x:8,y:4},{x:16,y:8},{x:4,y:8}]);
  assert.deepEqual(cells.map(cell=>[cell.x,cell.y]),[[8,0],[8,4],[4,8],[8,8],[12,8],[16,8]]);
});

test('removing a post removes unsupported panels while preserving surviving damage state',()=>{
  const posts=addBarrierPost([{x:0,y:0}],{x:12,y:0}),old=reconcileBarrier(barrierCells(posts),[],cell=>({...cell,health:100}));
  old[0].health=40;
  const rebuilt=reconcileBarrier(barrierCells(removeBarrierPost(posts,{x:13,y:1})),old,cell=>({...cell,health:100}));
  assert.deepEqual(rebuilt,[{x:0,y:0,width:4,height:4,health:40}]);
});

test('recycling accepts any panel while post recycling removes its unsupported run',()=>{
  const posts=[{x:0,y:0},{x:12,y:0}],sections=barrierCells(posts).map(cell=>({...cell,health:100}));
  const panel=recycleBarrier(posts,sections,{x:5,y:1});
  assert.equal(panel.post,false);assert.deepEqual(panel.removed.map(cell=>cell.x),[4]);assert.deepEqual(panel.posts,posts);
  const post=recycleBarrier(posts,sections,{x:1,y:1});
  assert.equal(post.post,true);assert.deepEqual(post.removed.map(cell=>cell.x),[0,4,8]);assert.deepEqual(post.sections.map(cell=>cell.x),[12]);
});
