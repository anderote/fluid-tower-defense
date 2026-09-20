import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {infantryFrame,infantryFacing} from './infantry-animation.ts';
import {INFANTRY,type InfantryKind,type Soldier} from '../infantry/model.ts';
const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
test('original infantry and dog animation frames exist for every facing and state',()=>{
 for(const kind of Object.keys(INFANTRY) as InfantryKind[])for(let facing=0;facing<8;facing++)for(const state of ['idle','run','fire','die']){
  const s:Soldier={id:1,home:1,kind,x:10,y:10,quality:0,health:state==='die'?0:25,cooldown:0,angle:facing*Math.PI/4,flash:state==='fire'?.1:0,walk:5,moving:state==='run',dead:2};
  const frame=infantryFrame(s,1);assert.ok(atlas.sprites[frame.sprite][frame.frame]!==undefined,JSON.stringify({kind,facing,state,frame}));
 }
 assert.ok(atlas.sprites.kenn.length>=2);assert.ok(atlas.sprites.dogbullt.length>=32);
 assert.equal(infantryFacing(-Math.PI/2),0);assert.equal(infantryFacing(0),6);
});
