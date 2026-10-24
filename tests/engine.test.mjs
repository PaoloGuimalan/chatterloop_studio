import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from './load.mjs';
test('render progress follows encoded output frames and ignores unrelated timestamp reports',()=>{
  const {encodedFrameProgress}=load('engine/progress');assert.equal(typeof encodedFrameProgress,'function');
  assert.equal(encodedFrameProgress('frame=    1 fps=0.0 time=00:00:29.90',60,30),1/1800);
  assert.equal(encodedFrameProgress('frame=  900 fps=30 time=00:00:15.0',60,30),.5);
  assert.equal(encodedFrameProgress('frame= 1800 fps=60',60,30),.99);
  assert.equal(encodedFrameProgress('Duration: 00:00:30.0',60,30),undefined);
  assert.equal(encodedFrameProgress('[libx264] frame I:1',60,30),undefined);
});

test('quick-share encoding reports frame progress after video inspection silences the engine',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))});
  core.exec('-f','lavfi','-i','testsrc2=s=16x28:r=60:d=1','-c:v','libx264','-preset','ultrafast','source.mp4');assert.equal(core.ret,0);core.reset();
  core.ffprobe('-v','error','-show_entries','stream=codec_type,avg_frame_rate,r_frame_rate','-of','json','source.mp4','-o','probe.json');core.reset();
  const {quickProject}=load('editor/quickProject');
  const p=quickProject({accountId:'a',entityId:'e'},{id:'v',name:'source.mp4',kind:'video',file:new Blob([],{type:'video/mp4'}),width:16,height:28,duration:1,fps:60,hasAudio:false});
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:true,textFiles:[]});
  for(const file of plan.files)core.FS.writeFile(file.name,core.FS.readFile('source.mp4'));
  const updates=[],{encodedFrameProgress}=load('engine/progress');
  core.setLogger(({message})=>{const progress=encodedFrameProgress(message,60,1);if(progress!==undefined)updates.push(progress);});
  core.exec(...plan.args);assert.equal(core.ret,0);assert.ok(core.FS.readFile('output.mp4').length>100);
  assert.ok(updates.some(value=>value>0),'Video sharing must report encoded frames instead of staying at 0% after ffprobe');
});
test('a cold 720p Export needs no 1080p warmup, then Share uses fresh workers and releases failed sessions',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const wasmBinary=fs.readFileSync(new URL('ffmpeg-core.wasm',root)),seed=await createCore({wasmBinary});
  seed.exec('-f','lavfi','-i','color=c=red:s=16x28','-frames:v','1','seed.png');assert.equal(seed.ret,0);
  const image=seed.FS.readFile('seed.png'),workers=[];
  // Adapter runs the real shipped core while exposing browser-worker lifetime.
  class WorkerCore {
    static crash=false;
    loaded=false;closed=false;commands=[];events={log:new Set(),progress:new Set()};
    constructor(){workers.push(this);}
    async load(){this.core=await createCore({wasmBinary});this.core.setLogger(event=>this.events.log.forEach(handler=>handler(event)));this.loaded=true;}
    on(event,handler){this.events[event].add(handler);}off(event,handler){this.events[event].delete(handler);}
    async exec(args){this.commands.push(args);if(WorkerCore.crash){WorkerCore.crash=false;throw new WebAssembly.RuntimeError('memory access out of bounds');}this.core.exec(...args);const code=this.core.ret;this.core.reset();return code;}
    async writeFile(name,data){this.core.FS.writeFile(name,data);}async readFile(name){return this.core.FS.readFile(name);}async deleteFile(name){this.core.FS.unlink(name);}
    terminate(){this.closed=true;this.loaded=false;this.core=undefined;}
  }
  const modules={'@ffmpeg/ffmpeg':{FFmpeg:WorkerCore},'./media':{textFiles:async()=>[],posterFromVideo:async video=>{
    // DOM decoding/JPEG canvas conversion is exercised in the browser. Here
    // verify the real MP4 crosses that boundary after its WASM heap is freed.
    assert.equal(video.type,'video/mp4');assert.ok(video.size>100);assert.ok(workers.every(worker=>worker.closed));
    return new Blob(['browser-jpeg-fixture'.repeat(10)],{type:'image/jpeg'});
  }},'../platform/errors':load('platform/errors')};
  for(const name of ['plan','probe','deadline','settings','progress','files'])modules['./'+name]=load('engine/'+name);
  const api=load('engine/render',{require:name=>modules[name],location:{origin:'https://studio.example'},navigator:{hardwareConcurrency:1},crossOriginIsolated:false,performance});
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});p.background={type:'color',color:'#000000'};p.assets=[{id:'i',name:'i.png',kind:'image',file:new Blob([image],{type:'image/png'}),width:16,height:28,duration:6,hasAudio:false}];
  p.clips=[{id:'c',assetId:'i',start:0,duration:.5,trimStart:0,volume:0,x:.5,y:.5,scale:1,rotation:0}];
  const options={edge:16,publish:false,handle:'qa',base:'/studio/',onProgress:()=>{}};
  const exported=await api.render(p,{...options,edge:720});assert.ok(exported.video.size>100);assert.equal(workers.length,1,'720p must start on its own first worker');assert.equal(workers[0].closed,true,'Completed export must not leave its worker for the subsequent Share');
  seed.FS.writeFile('export720.mp4',new Uint8Array(await exported.video.arrayBuffer()));seed.reset();seed.ffprobe('-v','error','-show_entries','stream=width,height','-of','json','export720.mp4','-o','export720.json');
  const dimensions=JSON.parse(seed.FS.readFile('export720.json',{encoding:'utf8'})).streams.find(stream=>stream.width);assert.equal(dimensions.width,720);assert.equal(dimensions.height,1280);
  const shared=await api.render(p,{...options,publish:true});assert.ok(shared.poster.size>100);
  assert.ok(!workers.some(worker=>worker.commands.some(args=>args.at(-1)==='poster.jpg')),'Poster JPEG must bypass the failing WASM MJPEG encoder');assert.ok(workers.every(worker=>worker.closed));
  const bad={...p,assets:[{...p.assets[0],file:new Blob(['invalid-image'])}]};await assert.rejects(api.render(bad,options));assert.equal(workers.at(-1).closed,true);
  WorkerCore.crash=true;await assert.rejects(api.render(p,{...options,publish:true}),/memory error.*retry.*720p/i);assert.equal(workers.at(-1).closed,true,'A trapped WASM core must be released before retry');
  const recovered=await api.render(p,{...options,publish:true});assert.ok(recovered.poster.size>100);assert.ok(workers.every(worker=>worker.closed));
});
test('used 60fps and faster clips select 60fps output, including fractional and overlay sources',()=>{
  const {exportFrameRate,newProject}=load('editor/model'),{videoMetadata}=load('engine/probe');assert.equal(typeof exportFrameRate,'function');assert.equal(typeof videoMetadata,'function');
  const meta=videoMetadata(JSON.stringify({streams:[{codec_type:'video',avg_frame_rate:'60000/1001',r_frame_rate:'60000/1001'},{codec_type:'audio'}]}),-1);
  assert.ok(Math.abs(meta.fps-59.94)<.01);assert.equal(meta.hasAudio,true);
  assert.equal(videoMetadata(JSON.stringify({streams:[{codec_type:'video',avg_frame_rate:'0/0',r_frame_rate:'120/1'}]}),0).fps,120);
  const p=newProject({accountId:'a',entityId:'e'});p.assets=[{id:'v',fps:30,kind:'video',file:new Blob(),duration:1,width:16,height:28},{id:'fast',fps:meta.fps,kind:'video'}];
  p.clips=[{id:'c',assetId:'v',start:0,duration:1,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}];
  assert.equal(exportFrameRate(p),30,'Unused high-rate media must not increase export cost');
  p.layers=[{...p.clips[0],id:'l',assetId:'fast'}];assert.equal(exportFrameRate(p),60);
  p.layers=[];p.assets[0].fps=120;assert.equal(exportFrameRate(p),60);
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[]});assert.equal(plan.fps,60);assert.equal(plan.args[plan.args.indexOf('-r')+1],'60');
});
test('a real 60fps video exports 60 distinct frames without a 30fps intermediate',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))});
  core.exec('-f','lavfi','-i',"nullsrc=s=16x28:r=60:d=1,geq=lum='N*3':cb=128:cr=128",'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','sixty.mp4');assert.equal(core.ret,0);core.reset();
  core.ffprobe('-v','error','-show_entries','stream=codec_type,avg_frame_rate,r_frame_rate','-of','json','sixty.mp4','-o','source.json');
  const metadata=load('engine/probe').videoMetadata(core.FS.readFile('source.json',{encoding:'utf8'}),core.ret);assert.equal(metadata.fps,60);core.reset();
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',name:'sixty.mp4',kind:'video',file:new Blob([],{type:'video/mp4'}),width:16,height:28,duration:1,...metadata}];
  p.clips=[{id:'c',assetId:'v',start:0,duration:1,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}];
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[]});for(const file of plan.files)if(file.asset)core.FS.writeFile(file.name,core.FS.readFile('sixty.mp4'));
  core.exec(...plan.args);assert.equal(core.ret,0);core.reset();core.exec('-i','output.mp4','-f','rawvideo','-pix_fmt','gray','frames.gray');assert.equal(core.ret,0);
  const frames=core.FS.readFile('frames.gray'),stride=16*28;assert.equal(frames.length/stride,60);
  assert.ok(new Set(Array.from({length:60},(_,index)=>frames[index*stride+8*16+8])).size>=45,'Sixty output frames must not just duplicate a thirty-frame render');
});
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
test('a full-frame MP4 uses its own video as the canvas without redundant background passes',()=>{
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',name:'v.mp4',kind:'video',file:new Blob([],{type:'video/mp4'}),width:1080,height:1920,duration:30,hasAudio:true}];
  p.clips=[{id:'c',assetId:'v',start:0,duration:30,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}];
  const plan=load('engine/plan').renderPlan(p,{edge:1080,publish:false,textFiles:[]}),filter=plan.args[plan.args.indexOf('-filter_complex')+1];
  assert.ok(!filter.includes('boxblur'),'A background completely covered by an opaque video must not be rendered');
  assert.ok(!filter.includes('overlay='),'A full-frame base video must not be composited over a second full-frame canvas');
  assert.ok(!filter.includes('format=rgba'),'Preserve YUV video instead of converting every base frame to RGB');
  p.clips[0].scale=.5;
  const inset=load('engine/plan').renderPlan(p,{edge:1080,publish:false,textFiles:[]});assert.match(inset.args[inset.args.indexOf('-filter_complex')+1],/boxblur/);
  p.clips[0].scale=1;p.clips[0].rotation=45;
  const rotated=load('engine/plan').renderPlan(p,{edge:1080,publish:false,textFiles:[]});assert.match(rotated.args[rotated.args.indexOf('-filter_complex')+1],/boxblur/);
});
test('full-frame clips in a sequence avoid invisible backgrounds and RGB conversion too',()=>{
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',name:'v.mp4',kind:'video',file:new Blob([],{type:'video/mp4'}),width:1080,height:1920,duration:30}];
  p.clips=[0,1].map((start)=>({id:'c'+start,assetId:'v',start,duration:1,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}));
  const plan=load('engine/plan').renderPlan(p,{edge:1080,publish:false,textFiles:[]}),filter=plan.args[plan.args.indexOf('-filter_complex')+1];
  assert.ok(!filter.includes('boxblur'));assert.ok(!filter.includes('format=rgba'));assert.match(filter,/format=yuva420p/);
});
test('compact text and signature tiles preserve their exact canvas offsets',()=>{
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.texts=[{id:'t',text:'Title',start:0,duration:1,x:.5,y:.5,size:30,color:'#fff',align:'center'}];
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[{name:'t.png',layerId:'t',start:0,duration:1,x:4,y:10}]}),filter=plan.args[plan.args.indexOf('-filter_complex')+1];
  assert.match(filter,/overlay=4:10/);
});
test('direct video rendering and compact overlays retain duration and encoded pixel placement',async()=>{
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const root=new URL('../node_modules/@ffmpeg/core/dist/esm/',import.meta.url);
  const {default:createCore}=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('ffmpeg-core.js',root)).toString('base64'));
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('ffmpeg-core.wasm',root))});
  core.exec('-f','lavfi','-i','color=c=red:s=16x28:r=30:d=0.5','-c:v','libx264','-pix_fmt','yuv420p','base.mp4');assert.equal(core.ret,0);core.reset();
  core.exec('-f','lavfi','-i','color=c=blue:s=4x4','-frames:v','1','tile.png');assert.equal(core.ret,0);core.reset();
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',name:'base.mp4',kind:'video',file:new Blob([],{type:'video/mp4'}),width:16,height:28,duration:.5,hasAudio:false}];
  p.clips=[{id:'c',assetId:'v',start:0,duration:.5,trimStart:0,volume:1,x:.5,y:.5,scale:1,rotation:0}];
  const plan=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[{name:'tile.png',x:4,y:10,start:0,duration:.5}]});
  for(const file of plan.files)if(file.asset)core.FS.writeFile(file.name,core.FS.readFile('base.mp4'));
  core.exec(...plan.args);assert.equal(core.ret,0);core.reset();
  core.exec('-i','output.mp4','-f','rawvideo','-pix_fmt','rgb24','pixels.rgb');assert.equal(core.ret,0);
  const pixels=core.FS.readFile('pixels.rgb');assert.equal(pixels.length,16*28*3*15);
  for(const [x,y,blue] of [[6,12,true],[2,12,false],[6,6,false]]){const i=(y*16+x)*3;assert.ok(blue?pixels[i+2]>pixels[i]+100:pixels[i]>pixels[i+2]+100,`Wrong overlay placement at ${x},${y}`);}
  core.reset();p.clips.push({...p.clips[0],id:'next',start:1});
  const sequence=load('engine/plan').renderPlan(p,{edge:16,publish:false,textFiles:[{name:'tile.png',x:4,y:10,start:0,duration:1.5}]});
  for(const file of sequence.files)if(file.asset)core.FS.writeFile(file.name,core.FS.readFile('base.mp4'));
  core.exec(...sequence.args);assert.equal(core.ret,0);core.reset();core.exec('-i','output.mp4','-f','rawvideo','-pix_fmt','rgb24','sequence.rgb');assert.equal(core.ret,0);
  const frames=core.FS.readFile('sequence.rgb'),stride=16*28*3;assert.equal(frames.length,stride*45);
  for(const [frame,red] of [[7,true],[22,false],[37,true]]){const i=frame*stride+(6*16+2)*3;assert.ok(red?frames[i]>150&&frames[i+1]<50:frames[i]<30&&frames[i+1]<30,`Main sequence gap changed at frame ${frame}`);}
});
