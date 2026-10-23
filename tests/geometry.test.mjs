import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load.mjs';
test('preview fills available portrait and landscape workspaces without distortion or overflow',()=>{
  const {fitCanvas}=load('editor/geometry');
  for(const [w,h,ratio] of [[1400,700,9/16],[300,240,16/9],[320,200,9/16]]){
    const size=fitCanvas(w,h,ratio);assert.ok(size.width<=w+.01&&size.height<=h+.01);assert.ok(Math.abs(size.width/size.height-ratio)<1e-6);assert.ok(Math.abs(size.width-w)<.01||Math.abs(size.height-h)<.01);
  }
});
test('canvas pinch keeps the point beneath fingers anchored while turning, moving and zooming',()=>{
  const {gestureTransform}=load('editor/geometry');
  const next=gestureTransform({x:.5,y:.5,scale:1,rotation:0},{x:20,y:50},{x:40,y:50},2,Math.PI/2,100,100,8,false);
  assert.ok(Math.abs(next.x-.4)<1e-6);assert.equal(next.y,1);assert.equal(next.scale,2);assert.equal(next.rotation,90);
});
test('canvas hit testing selects the top visible rotated layer, mixing media with text lanes',()=>{
  const p=load('editor/model').newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'v',width:100,height:100}];p.layers=[{id:'l',assetId:'v',start:0,duration:4,x:.5,y:.5,scale:.5,rotation:45,lane:1}];
  p.texts=[{id:'t',text:'Hi',start:0,duration:4,x:.5,y:.5,size:80,lane:0,align:'center'}];
  const {hitTest}=load('editor/geometry');assert.equal(hitTest(p,1,.5,.5).id,'l');assert.equal(hitTest(p,5,.5,.5),null);
});
test('visible source cropping bounds the work needed to export heavily zoomed layers',()=>{
  const {visibleMediaRect}=load('editor/geometry');
  const part=visibleMediaRect(4000,3000,720,1280,{x:.5,y:.5,scale:20,rotation:0});
  assert.ok(part.width<400&&part.height<400);assert.ok(part.drawWidth<=724&&part.drawHeight<=1284);
});
test('a stalled worker stage times out, terminates work, and leaves successful work alone',async()=>{
  const {withDeadline}=load('engine/deadline');let stopped=0;
  await assert.rejects(withDeadline(new Promise(()=>{}),5,'Stage stalled',()=>stopped++),/Stage stalled/);
  assert.equal(stopped,1);assert.equal(await withDeadline(Promise.resolve('ready'),5,'Unexpected timeout',()=>stopped++),'ready');
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(stopped,1);
});
