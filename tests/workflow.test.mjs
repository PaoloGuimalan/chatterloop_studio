import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load.mjs';

test('share success notices survive navigation once and stay scoped to entity and destination',()=>{
  const values=new Map(),sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const {rememberMomentShared,consumeMomentShared}=load('platform/shareNotice',{sessionStorage});
  assert.equal(typeof rememberMomentShared,'function');
  rememberMomentShared('page-entity','studio',1000);
  assert.equal(consumeMomentShared('page-entity','studio',1100),'Your Moment is live for 24 hours.');
  assert.equal(consumeMomentShared('page-entity','studio',1100),null);
  rememberMomentShared('page-entity','webapp',1000);assert.equal(consumeMomentShared('person','webapp',1100),null);
  rememberMomentShared('page-entity','webapp',1000);assert.equal(consumeMomentShared('page-entity','studio',1100),null);
  rememberMomentShared('page-entity','webapp',1000);assert.equal(consumeMomentShared('page-entity','webapp',302000),null);
  rememberMomentShared('page-entity','webapp',1000);assert.equal(consumeMomentShared('page-entity','webapp',900),null);
});
test('webapp entry stays temporary and returns to its page; successful sharing returns Home',()=>{
  const {entryContext,shareDestination,safeReturnTo}=load('platform/entry');assert.equal(typeof entryContext,'function');
  const web=entryContext('?compose=moment&from=webapp&returnTo=%2Fexplore%3Fq%3Dcoast');assert.equal(web.autosave,false);assert.equal(web.backTo,'/explore?q=coast');assert.equal(shareDestination(web),'/');
  const studio=entryContext('');assert.equal(studio.autosave,true);assert.equal(studio.backTo,'/studio/');assert.equal(shareDestination(studio),'/studio/');
  for(const path of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/studio/?compose=moment','/login'])assert.equal(safeReturnTo(path),'/');
});
test('quick-share opens long videos for editing while only publishing enforces two minutes',()=>{
  const {quickProject}=load('editor/quickProject'),{newProject,clipFor}=load('editor/model');assert.equal(typeof quickProject,'function');
  const video={id:'v',name:'video.mp4',file:new Blob(),kind:'video',duration:120,width:1920,height:1080,fps:60,hasAudio:true};
  const owner={accountId:'a',entityId:'e'},project=quickProject(owner,video);assert.equal(project.clips[0].duration,120);assert.equal(project.orientation,'landscape');assert.equal(project.assets[0].fps,60);
  assert.equal(quickProject(owner,{...video,width:1620,height:1080}).clips[0].scale,1,'Quick share must keep all of the selected frame instead of automatically cropping it');
  const {renderPlan}=load('engine/plan');
  assert.equal(renderPlan(project,{edge:720,publish:true,textFiles:[]}).duration,120);
  for(const length of [120.1,600]){
    const longer=quickProject(owner,{...video,duration:length});assert.equal(longer.clips[0].duration,length);assert.equal(longer.assets[0].file,video.file);
    assert.throws(()=>renderPlan(longer,{edge:720,publish:true,textFiles:[]}),/2 minutes/);
    assert.equal(renderPlan(longer,{edge:720,publish:false,textFiles:[]}).duration,length);
  }
  assert.throws(()=>quickProject(owner,{...video,kind:'audio'}),/photo or video/);
  assert.equal(clipFor({...video,duration:600},0).duration,600);assert.equal(newProject(owner).clips.length,0);
});
test('poster retries reuse a completed MP4 and a changed edit invalidates the render cache',async()=>{
  let renders=0,posters=0,fail=true;
  const video=new Blob(['rendered-video'],{type:'video/mp4'}),poster=new Blob(['jpeg'],{type:'image/jpeg'});
  const modules={'./render':{render:async()=>{renders++;return{video,poster:null,width:1080,height:1920};}},'./media':{posterFromVideo:async source=>{assert.equal(source,video);posters++;if(fail)throw Error('Poster timed out');return poster;}}};
  const {MomentRender}=load('engine/share',{require:name=>modules[name]});assert.equal(typeof MomentRender,'function');
  const job=new MomentRender(),project={id:'a',updatedAt:1},options={edge:1080,onProgress:()=>{},base:'/studio/',handle:'a'};
  await assert.rejects(job.prepare(project,options),/Poster timed out/);fail=false;const result=await job.prepare(project,options);assert.equal(renders,1);assert.equal(posters,2);assert.equal(result.poster,poster);
  await job.prepare({...project,updatedAt:2},options);assert.equal(renders,2);
});
test('large source media is mounted read-only without copying the whole file into WASM',async()=>{
  const {openSource}=load('engine/files');assert.equal(typeof openSource,'function');
  const blob=new Blob([new Uint8Array(33*1024*1024)]),seen=[];blob.arrayBuffer=()=>{throw Error('Whole-file allocation is forbidden for this fixture');};
  const fs={loaded:true,createDir:async path=>seen.push(path),mount:async(type,options,path)=>{assert.equal(type,'WORKERFS');assert.equal(options.blobs[0].data,blob);return true;},unmount:async path=>seen.push('unmount '+path),deleteDir:async()=>{}};
  const source=await openSource(fs,'large.video',blob);assert.match(source.path,/\/large.video$/);await source.close();assert.equal(seen.length,2);
});
test('probing legacy FPS metadata does not force another encode when retrying a failed poster',async()=>{
  let renders=0,fail=true,updated;const source={id:'draft',updatedAt:1,assets:[{id:'v',kind:'video'}]};
  const modules={'./render':{render:async(project,options)=>{renders++;const assets=[{...project.assets[0],fps:60,hasAudio:true}];options.onMetadata(assets);return{video:new Blob(['mp4']),poster:null,width:720,height:1280};}},'./media':{posterFromVideo:async()=>{if(fail)throw Error('Poster failed');return new Blob(['jpeg']);}}};
  const {MomentRender}=load('engine/share',{require:name=>modules[name]}),job=new MomentRender(),options={edge:720,onProgress:()=>{},onMetadata:assets=>{updated={...source,assets};}};
  await assert.rejects(job.prepare(source,options));fail=false;await job.prepare(updated,options);assert.equal(renders,1);
});
test('returning to webapp replaces the completed Studio entry with a full document navigation',()=>{
  const visits=[],{leaveStudio}=load('platform/routes',{location:{replace:path=>visits.push(path)}});leaveStudio('/explore?q=coast');assert.deepEqual(visits,['/explore?q=coast']);
});
test('an explicit leave decision or successful share suppresses the browser leave warning',()=>{
  const {shouldWarnBeforeUnload}=load('platform/entry');assert.equal(typeof shouldWarnBeforeUnload,'function');
  assert.equal(shouldWarnBeforeUnload({leaving:false,unsaved:true,busy:false,importing:false}),true);
  assert.equal(shouldWarnBeforeUnload({leaving:true,unsaved:true,busy:true,importing:false}),false);
  assert.equal(shouldWarnBeforeUnload({leaving:false,unsaved:false,busy:false,importing:false}),false);
});
