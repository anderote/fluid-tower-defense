import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation,canPlace,hasSpawnRoute,mapWithTurretObstacles,resolvePlacement,snapToMount} from './index.ts';
import {wallMountCells} from '../game/terrain.ts';

test('open default map provides a route across the full approach',()=>{
  const field=buildNavigation(DEFAULT_MAP);
  for(const x of [20,52,88,124,150]) assert.ok(Number.isFinite(field.distances[50*field.width+x]));
});
test('navigation offers equivalent alternate steps so enemies can split routes',()=>{
  const field=buildNavigation({...DEFAULT_MAP,obstacles:[]});
  const at=40*field.width+20;
  assert.deepEqual(Array.from(field.vectors.slice(at*2,at*2+2)),[1,0]);
  assert.deepEqual(Array.from(field.alternateVectors.slice(at*2,at*2+2)),[0,1]);
});
test('default scenery preserves the clear boss corridor',()=>{
  assert.deepEqual(DEFAULT_MAP.obstacles,DEFAULT_MAP.scenery!.solids);
  assert.ok(DEFAULT_MAP.obstacles.every(wall=>wall.y+wall.height<=47.5||wall.y>=52.5));
});
test('placement allows the corridor and spawn area but rejects buildings and overlaps',()=>{ assert.equal(canPlace(DEFAULT_MAP,[],{x:10,y:50},1),true); assert.equal(canPlace(DEFAULT_MAP,[],{x:10,y:40},1),true); assert.equal(canPlace(DEFAULT_MAP,[],{x:30,y:20},1),false); assert.equal(canPlace(DEFAULT_MAP,[],{x:34,y:38},1),false); const towers=[{id:1,kind:'cryo' as const,x:50,y:50,level:0,branch:-1,angle:0,cooldown:0,spent:0}]; assert.equal(canPlace(DEFAULT_MAP,towers,{x:51,y:50},1),false); assert.equal(canPlace(DEFAULT_MAP,towers,{x:72,y:50},1),true); });
test('deployed turrets become solid route obstacles without sealing the spawn',()=>{
 const map={id:'turret-route',width:16,height:9,obstacles:[],spawn:{x:0,y:3,width:1,height:3},goal:{x:15,y:4},goalRadius:0};
 const blocked=mapWithTurretObstacles(map,[{x:8,y:4}]);
 const field=buildNavigation(blocked);
 assert.equal(Number.isFinite(field.distances[4*field.width+8]),false);
 assert.equal(hasSpawnRoute(blocked),true);
});
test('placement resolves flush inside every map edge',()=>{
  assert.deepEqual(resolvePlacement(DEFAULT_MAP,{x:0,y:10},1.25),{x:1.25,y:10});
  assert.deepEqual(resolvePlacement(DEFAULT_MAP,{x:160,y:20},1.25),{x:158.75,y:20});
  assert.deepEqual(resolvePlacement(DEFAULT_MAP,{x:40,y:0},1.25),{x:40,y:1.25});
  assert.deepEqual(resolvePlacement(DEFAULT_MAP,{x:40,y:100},1.25),{x:40,y:98.75});
});
test('an isolated wall has one stable top-cap hardpoint',()=>{
  const wall={x:32,y:20,width:4,height:4},mounts=wallMountCells([wall]),map={...DEFAULT_MAP,obstacles:[wall]};
  assert.equal(mounts.length,1);
  assert.deepEqual(mounts.map(mount=>({x:mount.x+mount.width/2,y:mount.y+mount.height/2})),[{x:34,y:21.35}]);
  assert.deepEqual(snapToMount({x:33.8,y:21.5},mounts),{x:34,y:21.35});
  assert.equal(canPlace(map,[],{x:34,y:21.35},1.25),false);
  assert.equal(canPlace(map,[],{x:34,y:21.35},1.25,mounts),true);
});
test('a linked vertical pair exposes three centered mounts along the run',()=>{
  const walls=[{x:32,y:20,width:4,height:4},{x:32,y:24,width:4,height:4}],mounts=wallMountCells(walls),map={...DEFAULT_MAP,obstacles:walls};
  const centers=mounts.map(mount=>({x:mount.x+mount.width/2,y:mount.y+mount.height/2}));
  assert.deepEqual(centers,[{x:34,y:21.35},{x:34,y:25.35},{x:34,y:23.35}]);
  assert.equal(canPlace(map,[],centers[0],1.25,mounts),true);
  assert.equal(canPlace(map,[{id:1,kind:'repulsor',...centers[0],level:0,branch:-1,angle:0,cooldown:0,spent:120}],centers[2],1.25,mounts),true);
});

test('routes reserve body clearance and steer displaced enemies out of wall margins',()=>{
 const map={...DEFAULT_MAP,obstacles:[{x:48,y:0,width:8,height:40}]};
 const field=buildNavigation(map),at=(x:number,y:number)=>y*field.width+x;
 assert.equal(field.distances[at(56,20)],Infinity,'A body cannot move along the wall at x=56.0');
 assert.ok(Number.isFinite(field.distances[at(57,20)]));
 assert.ok(field.vectors[at(56,20)*2]>0,'Displaced body should move away from the wall');
 assert.ok(field.vectors[at(47,20)*2]<0,'Western wall margin should escape west');
});

test('navigation reserves collision standoff around fractional tree and fence edges',()=>{
 const map={id:'fractional-obstacle',width:20,height:12,obstacles:[{x:8.25,y:2.25,width:.5,height:5.5}],spawn:{x:0,y:2,width:1,height:8},goal:{x:18,y:6},goalRadius:1};
 const field=buildNavigation(map),at=5*field.width+9;
 assert.equal(field.distances[at],Infinity,'x=9.5 is inside the collision standoff of the fence');
 assert.ok(field.vectors[at*2]>0,'body displaced into the margin should steer toward open ground');
 assert.ok(Number.isFinite(field.distances[5*field.width+10]));
 assert.equal(hasSpawnRoute(map),true);
});
