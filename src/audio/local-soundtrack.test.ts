import assert from 'node:assert/strict';
import test from 'node:test';
import {isLocalAudioFile} from './local-soundtrack.ts';

test('recognizes browser audio types and common soundtrack extensions',()=>{
  assert.equal(isLocalAudioFile({name:'01 Hell March.mp3',type:''}),true);
  assert.equal(isLocalAudioFile({name:'Crush',type:'audio/mpeg'}),true);
  assert.equal(isLocalAudioFile({name:'cover.jpg',type:'image/jpeg'}),false);
  assert.equal(isLocalAudioFile({name:'._Hell March.mp3',type:'audio/mpeg'}),false);
});
