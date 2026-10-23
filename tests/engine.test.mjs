import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from './load.mjs';
test('shipped WASM core renders H.264/AAC and probes real streams despite unset probe status',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  // Core's ESM .js package is not marked type:module. A data module keeps the
  // exact shipped browser core intact while testing its in-memory WASM engine.
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))});
  const logs=[];core.setLogger(({message})=>{logs.push(message);if(logs.length>10)logs.shift();});
  core.exec('-f','lavfi','-i','color=c=blue:s=16x32:r=30:d=0.1','-f','lavfi','-i','sine=frequency=440:duration=0.1','-t','0.1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','out.mp4');
  assert.equal(core.ret,0,logs.join('\n'));assert.ok(core.FS.readFile('out.mp4').length>500);core.reset();
  core.ffprobe('-v','error','-show_entries','stream=codec_type','-of','json','out.mp4','-o','probe.json');
  assert.equal(load('engine/probe').videoHasAudio(core.FS.readFile('probe.json',{encoding:'utf8'}),core.ret),true);
  core.FS.unlink('out.mp4');core.FS.unlink('probe.json');
});
