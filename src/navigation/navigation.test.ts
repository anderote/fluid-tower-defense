import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation,canPlace} from './index.ts';

test('choke map provides a route from spawn to the goal',()=>{ const field=buildNavigation(DEFAULT_MAP); const x=20,y=50; assert.ok(Number.isFinite(field.distances[y*field.width+x])); });
test('placement rejects spawn, walls, and overlaps',()=>{ assert.equal(canPlace(DEFAULT_MAP,[],{x:10,y:10},1),false); assert.equal(canPlace(DEFAULT_MAP,[],{x:90,y:20},1),false); const towers=[{id:1,kind:'cryo' as const,x:50,y:50,level:0,branch:-1,angle:0,cooldown:0,spent:0}]; assert.equal(canPlace(DEFAULT_MAP,towers,{x:51,y:50},1),false); assert.equal(canPlace(DEFAULT_MAP,towers,{x:84,y:50},1),true); });
