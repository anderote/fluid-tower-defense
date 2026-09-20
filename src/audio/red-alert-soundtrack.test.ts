import assert from 'node:assert/strict';
import test from 'node:test';
import {redAlertTracks} from './red-alert-soundtrack.ts';

test('bundled Red Alert soundtrack has a numbered, playable catalog',()=>{
  assert.equal(redAlertTracks.length,22);
  assert.deepEqual(redAlertTracks.slice(0,2).map(track=>track.title),['Hell March','Radio 2']);
  assert.ok(redAlertTracks.every(track=>track.url.startsWith('/audio/red-alert/')&&track.url.endsWith('.mp3')));
});
