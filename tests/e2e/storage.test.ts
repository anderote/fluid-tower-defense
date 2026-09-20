import assert from 'node:assert/strict';
import {test} from 'node:test';
import {backupSaves,restoreSaves} from './storage.ts';
function storage(){const data=new Map<string,string>();return {get length(){return data.size;},key:(index:number)=>[...data.keys()][index]??null,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
test('interrupted E2E runs restore original saves while leaving unrelated storage alone',()=>{
 const store=storage();store.setItem('pressure-front.checkpoint.v1','original');store.setItem('other','keep');backupSaves(store);
 store.setItem('pressure-front.checkpoint.v1','test');store.setItem('pressure-front.autosave.v1','temporary');
 assert.throws(()=>backupSaves(store));assert.equal(restoreSaves(store),true);
 assert.equal(store.getItem('pressure-front.checkpoint.v1'),'original');assert.equal(store.getItem('pressure-front.autosave.v1'),null);assert.equal(store.getItem('other'),'keep');assert.equal(restoreSaves(store),false);
});
test('a failed restoration retains its backup for retry',()=>{
 const store=storage();store.setItem('pressure-front.checkpoint.v1','original');backupSaves(store);store.setItem('pressure-front.checkpoint.v1','test');
 const set=store.setItem;store.setItem=()=>{throw new Error('Storage unavailable');};assert.throws(()=>restoreSaves(store));store.setItem=set;
 assert.equal(restoreSaves(store),true);assert.equal(store.getItem('pressure-front.checkpoint.v1'),'original');
});
