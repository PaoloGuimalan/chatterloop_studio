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
test('actual Studio export respects text/media lane order and safely crops zoomed overlays',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))}),logs=[];
  core.setLogger(({message})=>{logs.push(message);if(logs.length>15)logs.shift();});
  const colors={};
  for(const color of ['red','lime','blue']){core.exec('-f','lavfi','-i',`color=c=${color}:s=16x28:r=30:d=0.5`,'-frames:v','1','-c:v','png',`${color}.png`);assert.equal(core.ret,0,logs.join('\n'));colors[color]=core.FS.readFile(`${color}.png`);core.reset();}
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});p.background={type:'color',color:'#000000'};
  p.assets=['red','lime'].map(id=>({id,name:id+'.png',kind:'image',file:new Blob([colors[id]]),width:16,height:28,duration:6,hasAudio:false}));
  const common={start:0,duration:.5,trimStart:0,volume:0,scale:1,rotation:0,x:.5,y:.5};
  p.clips=[{...common,id:'base',assetId:'red'}];p.layers=[{...common,id:'upper',assetId:'lime',scale:20,lane:1}];
  p.texts=[{id:'lower-text',text:'Under media',start:0,duration:.5,size:32,x:.5,y:.5,color:'#ffffff',lane:0}];
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[{name:'caption.png',layerId:'lower-text',start:0,duration:.5}]});
  for(const file of plan.files)core.FS.writeFile(file.name,file.asset?colors[file.asset.id]:colors.blue);
  core.exec(...plan.args);assert.equal(core.ret,0,logs.join('\n'));core.reset();
  core.exec('-i','output.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pixels.rgb');assert.equal(core.ret,0,logs.join('\n'));
  const pixels=core.FS.readFile('pixels.rgb'),i=(14*16+8)*3;
  assert.ok(pixels[i+1]>pixels[i]+100&&pixels[i+1]>pixels[i+2]+100,'Upper media must cover lower text in encoded pixels');
});
