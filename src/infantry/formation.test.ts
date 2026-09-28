import assert from 'node:assert/strict';
import test from 'node:test';
import {dragFormation,formationPoint,formationOutline,validFormation} from './formation.ts';
import {advanceInfantry,freshInfantry,infantryField,infantryStats,validInfantry,type Soldier} from './model.ts';
import type {WorldMap} from '../contracts/index.ts';
const map:WorldMap={id:'formation',width:80,height:60,obstacles:[],spawn:{x:0,y:10,width:3,height:20},goal:{x:78,y:30},goalRadius:2};
test('drag frontage supports any depth from a single-file column to a single rank',()=>{
 for(let columns=1;columns<=24;columns++){
  const f=dragFormation({x:20,y:20},{x:20+(columns-1)*.9+.01,y:20},24);
  assert.equal(f.columns,columns);assert.equal(f.rows,Math.ceil(24/columns));
  assert.equal(new Set(Array.from({length:24},(_,i)=>JSON.stringify(formationPoint(f.center,i,f)))).size,24);
 }
 assert.equal(dragFormation({x:20,y:20},{x:20.1,y:20},24).rows,24);
 assert.equal(dragFormation({x:20,y:20},{x:21,y:20},24).rows,12);
 assert.equal(dragFormation({x:20,y:20},{x:50,y:20},24).rows,1);
 const empty=dragFormation({x:20,y:20},{x:20,y:20},0);assert.equal(empty.columns,1);assert.equal(empty.rows,0);
});
test('block footprint encloses all troop slots at arbitrary facing',()=>{
 for(const angle of [0,.7,Math.PI/2,Math.PI])for(const columns of [1,2,5,24]){
  const center={x:30,y:30},f={angle,columns},outline=formationOutline(center,f,24);
  assert.equal(outline.length,4);
  const project=(p:{x:number;y:number})=>({lateral:-(p.x-center.x)*Math.sin(angle)+(p.y-center.y)*Math.cos(angle),depth:-(p.x-center.x)*Math.cos(angle)-(p.y-center.y)*Math.sin(angle)});
  const bounds=outline.map(project);
  for(let i=0;i<24;i++){const p=project(formationPoint(center,i,f));assert.ok(p.lateral>Math.min(...bounds.map(p=>p.lateral))&&p.lateral<Math.max(...bounds.map(p=>p.lateral)));assert.ok(p.depth>Math.min(...bounds.map(p=>p.depth))&&p.depth<Math.max(...bounds.map(p=>p.depth)));}
 }
});
test('reversing the drag reverses facing and ranks trail behind the front line',()=>{
 const a=dragFormation({x:20,y:20},{x:26,y:20},18),b=dragFormation({x:26,y:20},{x:20,y:20},18);
 assert.ok(Math.abs(Math.cos(a.angle-b.angle)+1)<1e-10);
 const front=formationPoint(a.center,0,a),rear=formationPoint(a.center,a.columns,a);
 assert.ok(rear.y>front.y);assert.equal(front.y,20);
 assert.equal(new Set(Array.from({length:18},(_,i)=>JSON.stringify(formationPoint(a.center,i,a)))).size,18);
});
test('commanded hoplites settle at previewed slots and keep player facing instead of spawn facing',()=>{
 for(const columns of [1,4,8,24]){
 const state=freshInfantry(),center={x:40,y:30},formation={angle:Math.PI/2,columns};
 state.buildings=[{id:1,x:60,y:45,kind:'phalanx',rally:center,production:0,training:0,progress:0,spent:220}];state.nextId=26;
 state.soldiers=Array.from({length:24},(_,i):Soldier=>({...formationPoint(center,i,formation),x:formationPoint(center,i,formation).x+3,id:i+2,home:1,kind:'phalanx',quality:0,health:infantryStats('phalanx').health,angle:0,cooldown:0,flash:0,walk:0,dead:0,moveTarget:center,moveSlot:i,moveFormation:formation}));
 const fields=new Map([[1,infantryField(map,center)]]);
 for(let i=0;i<600;i++)advanceInfantry(state,map,fields,new Map(),1/60,true);
 state.soldiers.forEach((s,i)=>{const p=formationPoint(center,i,formation);assert.ok(Math.hypot(s.x-p.x,s.y-p.y)<.2);assert.equal(s.angle,formation.angle);});
 assert.ok(validInfantry(JSON.parse(JSON.stringify(state)),map));
 const bad=structuredClone(state);bad.soldiers[0].moveFormation={...bad.soldiers[0].moveFormation!,columns:0};assert.equal(validInfantry(bad,map),false);
 delete bad.soldiers[0].moveFormation;delete bad.soldiers[0].moveTarget;assert.ok(validInfantry(bad,map));
 }
});
test('formation save validation rejects non-finite facing and invalid file counts',()=>{
 for(const bad of [null,{}, {angle:NaN,columns:3},{angle:0,columns:0},{angle:0,columns:1.5},{angle:0,columns:Infinity}])assert.equal(validFormation(bad),false);
 assert.ok(validFormation({angle:-Math.PI,columns:8}));
});
