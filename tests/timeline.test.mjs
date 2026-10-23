import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load.mjs';
const rules=()=>load('editor/timelineRules');
const plain=value=>JSON.parse(JSON.stringify(value));
const base=()=>load('editor/model').newProject({accountId:'account',entityId:'realm'});
const clip=(id,start=0,duration=4,extra={})=>({id,assetId:'video',start,duration,trimStart:0,volume:1,scale:1,rotation:0,x:.5,y:.5,...extra});
const video={id:'video',kind:'video',name:'video.mp4',file:new Blob(['video']),duration:60,width:1080,height:1920,hasAudio:true};

test('legacy drafts get distinct overlapping lanes without losing identity, time or files',()=>{
  const p=base();p.assets=[video];p.layers=[clip('a'),clip('b')];p.texts=[{id:'text',text:'Hi',start:1,duration:2}];
  const next=rules().normalizeProject(p);
  assert.deepEqual(plain(next.layers.map(x=>x.lane)),[0,1]);assert.equal(next.texts[0].lane,2);
  assert.equal(next.assets[0].file,video.file);assert.equal(next.layers[1].id,'b');assert.equal(next.texts[0].start,1);
});
test('new layers/audio take the lowest available lane and can extend beyond main clips',()=>{
  let p=base();p.assets=[video];p.layers=[clip('a',0,4,{lane:0})];
  p=rules().placeItem(p,'layers',clip('b'),2);assert.equal(p.layers.find(x=>x.id==='b').lane,1);
  p=rules().placeItem(p,'layers',clip('c'),4);assert.equal(p.layers.find(x=>x.id==='c').lane,0);
  p=rules().placeItem(p,'audio',{id:'song',assetId:'video',duration:20,trimStart:0,volume:1,fadeIn:0,fadeOut:0},2);
  assert.equal(p.audio[0].lane,0);assert.equal(p.audio[0].start+p.audio[0].duration,22);
});
test('main trim ripples following clips, retaining their blanks and source offsets',()=>{
  const p=base();p.assets=[video];p.clips=[clip('a',0,4,{trimStart:2}),clip('b',6,4)];
  const next=rules().resizeItem(p,'clips','a','head',1);
  assert.deepEqual(next.clips.map(x=>[x.start,x.duration,x.trimStart]),[[0,3,3],[5,4,0]]);
});
test('deleting main clips closes their duration while preserving the blank before them',()=>{
  const p=base();p.clips=[clip('a',1,3),clip('b',6,4),clip('c',12,2)];
  assert.deepEqual(rules().removeItem(p,'clips','b').clips.map(x=>[x.id,x.start]),[['a',1],['c',8]]);
});
test('slide pushes collisions in its lane, without snapping small moves or moving other lanes',()=>{
  const p=base();p.layers=[clip('a',0,2,{lane:0}),clip('b',4,2,{lane:0}),clip('c',0,5,{lane:1})];
  const r=rules();const small=r.slideItem(p,'layers','a',.03);assert.equal(small.layers.find(x=>x.id==='a').start,.03);
  const next=r.slideItem(p,'layers','a',3);assert.equal(next.layers.find(x=>x.id==='b').start,5);assert.equal(next.layers.find(x=>x.id==='c').start,0);
});
test('overlay/audio handles respect source bounds, neighbours and half-second minimum',()=>{
  const p=base();p.assets=[video];p.layers=[clip('a',2,4,{trimStart:3,lane:0}),clip('b',8,2,{lane:0})];
  const r=rules(),head=r.resizeItem(p,'layers','a','head',-10).layers[0];
  assert.deepEqual([head.start,head.trimStart,head.duration],[0,1,6]);
  assert.equal(r.resizeItem(p,'layers','a','tail',20).layers[0].duration,6);
  assert.equal(r.resizeItem(p,'layers','a','head',20).layers[0].duration,.5);
});
test('split supports overlays, text and songs and preserves their lane/source continuity',()=>{
  const p=base();p.layers=[clip('layer',2,6,{trimStart:4,lane:2})];
  const next=rules().splitItem(p,'layers','layer',5);
  assert.deepEqual(next.layers.map(x=>[x.start,x.duration,x.trimStart,x.lane]),[[2,3,4,2],[5,3,7,2]]);
  assert.equal(rules().splitItem(p,'layers','layer',2.2),p);
  p.audio=[{id:'song',assetId:'video',start:0,duration:8,trimStart:2,volume:1,lane:0,fadeIn:.3,fadeOut:1}];
  assert.equal(rules().splitItem(p,'audio','song',3).audio[1].trimStart,5);
});
test('lift keeps the original time; drop inserts at a clip edge and carries the main sequence',()=>{
  let p=base();p.clips=[clip('a',0,3),clip('b',5,4),clip('c',10,2)];
  p=rules().liftClip(p,'b');assert.equal(p.layers[0].start,5);assert.deepEqual(p.clips.map(x=>x.start),[0,6]);
  p=rules().dropLayer(p,'b',1);assert.deepEqual(plain(p.clips.map(x=>[x.id,x.start])),[['a',0],['b',3],['c',10]]);assert.equal(p.layers.length,0);
});
test('lane drop finds the nearest free stretch and removes unused lane gaps',()=>{
  const p=base();p.layers=[clip('a',0,4,{lane:0}),clip('b',8,2,{lane:0}),clip('c',3,2,{lane:1})];
  const next=rules().moveItem(p,'layers','c',1,0);
  assert.equal(next.layers.find(x=>x.id==='c').start,4);assert.ok(next.layers.every(x=>x.lane===0));
});
test('stack order combines text and media, and anchor removes only the chosen blank',()=>{
  const p=base();p.layers=[clip('a',0,4,{lane:0}),clip('b',6,2,{lane:0})];p.texts=[{id:'t',text:'Hi',start:0,duration:4,lane:1}];
  const r=rules(),next=r.restackItem(p,'layers','a',true);
  assert.deepEqual(plain(r.orderedOverlays(next).filter(x=>x.item.start===0).map(x=>x.item.id)),['t','a']);
  assert.equal(r.anchorItem(p,'layers','b',false).layers.find(x=>x.id==='b').start,4);
});
test('duplicate layer uses the next free stretch or a simultaneous new lane',()=>{
  const p=base();p.layers=[clip('a',0,4,{lane:0}),clip('b',4,4,{lane:0})];
  const next=rules().duplicateTimelineItem(p,'layers','a');const copy=next.layers.find(x=>!['a','b'].includes(x.id));
  assert.equal(copy.start,0);assert.equal(copy.lane,1);assert.equal(copy.duration,4);
});
test('reorder main clips preserves neighbours gaps and inserts directly after previous clip',()=>{
  const p=base();p.clips=[clip('a',0,3),clip('b',5,2),clip('c',9,4)];
  const next=rules().reorderClip(p,'c',0);
  assert.deepEqual(plain(next.clips.map(x=>[x.id,x.start])),[['c',0],['a',4],['b',9]]);
});
test('photo Moments are only a single still with no timed overlays, gaps or trailing audio',()=>{
  const {momentSource,hasSound}=load('editor/model'),p=base();p.assets=[{...video,kind:'image'}];p.clips=[clip('still',0,6)];
  assert.equal(momentSource(p),'photo');p.layers=[clip('layer',0,3)];assert.equal(momentSource(p),'video');p.layers=[];
  p.texts=[{id:'text',text:'Animated words',start:1,duration:3}];assert.equal(momentSource(p),'video');p.texts=[];
  p.clips.push(clip('other',6,6));assert.equal(momentSource(p),'video');p.clips.pop();
  p.audio=[{id:'song',assetId:'audio',start:0,duration:8,trimStart:0,volume:0,fadeIn:0,fadeOut:0}];assert.equal(momentSource(p),'video');assert.equal(hasSound(p),false);
  p.audio[0].volume=.5;assert.equal(hasSound(p),true);
});
test('native automatic fades are removed at joined song boundaries and retain manual fades',()=>{
  const p=base();p.audio=[{id:'a',start:0,duration:5,lane:0,volume:1,autoFades:true},{id:'b',start:5,duration:5,lane:0,volume:1,autoFades:true},{id:'manual',start:0,duration:5,lane:1,fadeIn:1.2,fadeOut:1.3,autoFades:false}];
  const next=rules().withAutoFades(p);
  assert.equal(next.audio[0].fadeIn,.3);assert.equal(next.audio[0].fadeOut,0);assert.equal(next.audio[1].fadeIn,0);assert.equal(next.audio[1].fadeOut,1);assert.equal(next.audio[2].fadeIn,1.2);
});
test('an upper overlay converted to main cannot slide through other main clips',()=>{
  const p=base();p.clips=[clip('a',0,4),clip('b',4,4)];p.layers=[clip('lower',0,8,{lane:0}),clip('upper',0,4,{lane:1})];
  const r=rules(),main=r.dropLayer(p,'upper',1),moved=r.slideItem(main,'clips','upper',-3);
  for(let i=1;i<moved.clips.length;i++)assert.ok(moved.clips[i].start>=moved.clips[i-1].start+moved.clips[i-1].duration,'Converted main clips must share the collision/ripple row');
});
test('cancelled gestures restore the original undo and redo branches',()=>{
  const {completeGesture}=load('editor/history'),before={past:[base()],now:base(),future:[base()]},provisional={past:before.past,now:{...before.now,name:'Dragged'},future:[]};
  assert.equal(completeGesture(provisional,before,true),before);
  const committed=completeGesture(provisional,before,false);assert.equal(committed.past.at(-1),before.now);assert.equal(committed.future.length,0);
});
