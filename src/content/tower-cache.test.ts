import test from 'node:test';import assert from 'node:assert/strict';
import {createTowerDefinitionCache} from './tower-cache.ts';
import {compileTower} from './index.ts';import type {Tower} from '../contracts/index.ts';
test('cached definitions invalidate on progression, fallback XP, in-place research and kind, but not aiming',()=>{
 const cached=createTowerDefinitionCache(),t:Tower={id:1,kind:'tesla',level:0,branch:-1,x:10,y:10,angle:0,cooldown:0,spent:0};
 const stats:string[]=[],commands:string[]=[],bonuses:string[]=[];let d=cached(t,bonuses,commands,stats);t.x++;t.angle++;assert.equal(cached(t,bonuses,commands,stats),d);
 for(const mutate of [()=>{t.level=4;},()=>{t.branch=1;},()=>{t.veterancyXp=100;},()=>{t.veterancy=50;},()=>{stats.push('damage');},()=>{commands.push('targeting-grid');},()=>{bonuses.push('blast-casing');},()=>{t.kind='mortar';}]){
  mutate();const next=cached(t,bonuses,commands,stats);assert.notEqual(next,d);assert.deepEqual(next,compileTower(t,bonuses,commands,stats));d=next;
 }
});
