import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {defensePlacementIssue,WALL_COST} from './index.ts';

test('defense placement rejects occupied cells, towers, and insufficient Metal',()=>{
  assert.equal(defensePlacementIssue(DEFAULT_MAP,[],{x:48,y:0,width:4,height:4},100,WALL_COST),'That cell is already occupied.');
  const towers=[{id:1,kind:'cryo' as const,x:42,y:42,level:0,branch:-1,angle:0,cooldown:0,spent:0}];
  assert.equal(defensePlacementIssue(DEFAULT_MAP,towers,{x:40,y:40,width:4,height:4},100,WALL_COST),'Defenses cannot overlap a deployed tower.');
  assert.equal(defensePlacementIssue(DEFAULT_MAP,[],{x:40,y:40,width:4,height:4},59,WALL_COST),'Requires 60 Metal.');
  assert.equal(defensePlacementIssue(DEFAULT_MAP,[],{x:40,y:40,width:4,height:4},60,WALL_COST),undefined);
});
