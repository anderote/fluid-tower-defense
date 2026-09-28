import test from 'node:test';
import assert from 'node:assert/strict';
import {launchInfantryProjectile,advanceInfantryProjectiles,groundedArrow} from './projectiles.ts';
import {projectilePose,arrowFlight,infantryRocketFlight} from '../effects/projectile-flight.ts';
import type {Soldier} from './model.ts';
const archer:Soldier={id:2,home:1,kind:'archer',x:5,y:20,health:32,quality:0,angle:0,cooldown:0,flash:0,walk:0,dead:0};
const shot={soldier:2,target:0,generation:1,damage:10,x:20,y:20};
test('arrows snapshot aim and damage, travel slowly, and resolve only once at the landing tick',()=>{
 const p=launchInfantryProjectile(archer,shot,100)!;assert.equal(p.kind,'arrow');assert.ok(p.life>1);assert.equal(p.damage,10);
 const aim={...p.target};const s={...archer},target={...shot};s.x=40;target.x=50;assert.deepEqual(p.target,aim);
 let result=advanceInfantryProjectiles([p],100);assert.equal(result.impacts.length,0);
 result=advanceInfantryProjectiles(result.active,100);assert.equal(result.active[0].age,0,'pause does not advance flight');
 const due=100+Math.round(p.life*60);
 result=advanceInfantryProjectiles(result.active,due-1);assert.equal(result.impacts.length,0);
 result=advanceInfantryProjectiles(result.active,due);assert.equal(result.impacts.length,1);assert.equal(result.active.length,0);
 assert.equal(advanceInfantryProjectiles(result.active,due+60).impacts.length,0);
 const landed=groundedArrow(p);assert.deepEqual({x:landed.x,y:landed.y},aim);assert.ok(landed.life>=15);
});
test('flight length depends on distance; rockets are faster than arrows but no longer instant',()=>{
 assert.ok(arrowFlight(24)>arrowFlight(6));assert.ok(infantryRocketFlight(24)>infantryRocketFlight(6));assert.ok(arrowFlight(24)>infantryRocketFlight(24));
 for(const kind of ['rocket','bazooka'] as const){const p=launchInfantryProjectile({...archer,kind},shot,0)!;assert.equal(p.kind,'rocket');assert.ok(p.life>.26);assert.deepEqual(p.target,{x:shot.x,y:shot.y});}
 assert.equal(launchInfantryProjectile({...archer,kind:'rifle'},shot,0),undefined);
});
test('ballistic path rises above its shadow then drops nose-first to the exact aim point',()=>{
 const from={x:3,y:20},to={x:20,y:20};
 const launch=projectilePose(from,to,0,6,.9),apex=projectilePose(from,to,.5,6,.9),land=projectilePose(from,to,1,6,.9);
 assert.equal(launch.x,3);assert.equal(launch.y,19.1);assert.ok(apex.height>6);assert.equal(apex.ground.y,20);assert.ok(launch.angle<0&&land.angle>0);
 assert.equal(land.height,0);assert.equal(land.x,20);assert.equal(land.y,20);
 assert.deepEqual(projectilePose(from,to,2,6,.9),land);
});
test('airborne rounds finish harmlessly between waves and tolerate a slow frame without duplicate impacts',()=>{
 const p=launchInfantryProjectile(archer,shot,100)!;
 const result=advanceInfantryProjectiles([p],100,5);assert.equal(result.impacts.length,1);assert.equal(result.active.length,0);
 assert.equal(advanceInfantryProjectiles([],100,5).impacts.length,0);
 const rocket=launchInfantryProjectile({...archer,kind:'rocket'},shot,100)!;
 assert.equal(advanceInfantryProjectiles([rocket],1000).impacts.length,1);
});
