import type {Soldier} from '../infantry/model.ts';

// Original OpenRA RA sequences: mods/ra/sequences/infantry.yaml.
export const infantryFacing=(angle:number)=>((6-Math.round(angle*4/Math.PI))%8+8)%8;
export function infantryFrame(s:Soldier,time:number){
  const kind=s.kind??'rifle',facing=infantryFacing(s.angle);
  const sprite=kind==='dog'?'dog':kind==='rocket'?'e3':kind==='flame'?'e4':'e1';
  if(s.health<=0)return {sprite,frame:(kind==='dog'?236:kind==='rocket'?304:kind==='flame'?416:288)+Math.min(kind==='dog'?5:7,Math.floor(s.dead/.08))};
  const attack=s.attackAge??(s.flash>0?time%.32:Infinity);
  if(kind==='dog'&&attack<.32)return {sprite:'dogbullt',frame:facing*4+Math.min(3,Math.floor(attack/.08))};
  if(kind!=='dog'&&attack<(kind==='flame'?.64:.32))return {sprite,frame:64+facing*(kind==='flame'?16:8)+Math.floor(attack/.04)};
  if(s.moving)return {sprite,frame:(kind==='dog'?56:16)+facing*6+Math.floor(s.walk)%6};
  return {sprite,frame:facing};
}
