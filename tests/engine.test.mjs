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
test('static export images decode once and retain their complete timed interval',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))});
  for(const color of ['red','blue']){core.exec('-f','lavfi','-i',`color=c=${color}:s=16x28`,'-frames:v','1',`${color}.png`);assert.equal(core.ret,0);core.reset();}
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.background={type:'color',color:'#000000'};
  p.assets=[{id:'red',name:'red.png',kind:'image',file:new Blob(),width:16,height:28,duration:6}];
  p.clips=[{id:'main',assetId:'red',start:0,duration:3,trimStart:0,volume:0,x:.5,y:.5,scale:1,rotation:0}];
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[{name:'mark.png',start:1,duration:1}]});
  assert.ok(!plan.args.includes('-loop'),'Static PNGs must not be decoded for every output frame');
  for(const file of plan.files)core.FS.writeFile(file.name,core.FS.readFile(file.asset?'red.png':'blue.png'));
  core.exec(...plan.args);assert.equal(core.ret,0);core.reset();
  core.exec('-i','output.mp4','-f','rawvideo','-pix_fmt','rgb24','frames.rgb');assert.equal(core.ret,0);
  const frames=core.FS.readFile('frames.rgb'),stride=plan.width*plan.height*3;
  assert.equal(frames.length/stride,90);
  for(const [frame,blue] of [[15,false],[45,true],[75,false]]){
    const i=frame*stride+(14*16+8)*3;
    assert.ok(blue?frames[i+2]>frames[i]+100:frames[i]>frames[i+2]+100,`Wrong still visibility at frame ${frame}`);
  }
});
test('export workers respect browser isolation and cap CPU parallelism',()=>{
  const {coreSettings}=load('engine/settings');
  assert.equal(typeof coreSettings,'function');
  assert.equal(coreSettings('/studio/',false,16).threads,1);
  assert.equal(coreSettings('/studio/',true,1).threads,1);
  const fast=coreSettings('/studio/',true,16);assert.equal(fast.threads,4);assert.equal(fast.corePath,'/studio/ffmpeg/mt/');
  assert.equal(coreSettings('/studio/',true,2).threads,2);
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',name:'v.mp4',kind:'video',file:new Blob(),width:16,height:28,duration:1}];
  p.clips=[{id:'c',assetId:'v',start:0,duration:1,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}];
  const args=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[],threads:4}).args;
  const input=args.indexOf('input-1.video');assert.deepEqual(Array.from(args.slice(input-3,input)),['-threads','1','-i']);
  assert.equal(args[args.indexOf('-filter_complex_threads')+1],'1','Filter graphs must not exhaust the finite WASM worker pool');
  assert.equal(args[args.lastIndexOf('-threads')+1],'4');
  assert.equal(args.filter(value=>value==='lavfi').length,1,'Silence belongs in the composition graph, not an independent lavfi thread pool');
});
