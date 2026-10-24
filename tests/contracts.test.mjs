import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {load} from './load.mjs';
import {runtimeConfig,injectConfig} from '../runtime-config.mjs';
test('worker failures remain visible when rejected as strings or message objects',()=>{
  const {failureMessage}=load('platform/errors');assert.equal(typeof failureMessage,'function');
  assert.equal(failureMessage('RuntimeError: memory access out of bounds','Export failed'),'RuntimeError: memory access out of bounds');
  assert.equal(failureMessage({message:'Encoder failed'},'Export failed'),'Encoder failed');
  assert.equal(failureMessage(undefined,'Export failed'),'Export failed');
});
test('runtime configuration exposes only the browser protocol key and escapes inline JSON',()=>{
  const value=runtimeConfig({VITE_STUDIO_HASH:'</script><script>x</script>',VITE_STUDIO_API_BASE:'https://api.example/',AUTHENTICATION_SECRET:'never-public'});
  assert.deepEqual(Object.keys(value),['hash','apiBase']);
  const html=injectConfig('<head></head>',value);assert.ok(!html.includes('never-public'));assert.ok(!html.includes('<script>x'));assert.ok(html.includes('\\u003c/script>'));
});
test('session validation uses active realm identity and treats rejected sessions as authentication errors',async()=>{
  const token=`x.${Buffer.from(JSON.stringify({userID:'personal-account'})).toString('base64url')}.x`;
  const storage={getItem:key=>key==='authtoken'?token:'device'};
  let reject=false;
  const clientModule=load('platform/client',{localStorage:storage,AbortSignal,fetch:async()=>new Response(JSON.stringify(reject?{status:false,message:'Cannot verify user'}:{status:true,result:{active_entity:{id:'realm-id',name:'Realm',slug:'realm'},usertoken:`x.${Buffer.from(JSON.stringify({entity_id:'personal-id'})).toString('base64url')}.x`}}),{status:200})});
  const client=clientModule.createClient({hash:'browser-key',apiBase:'https://api.example'},{token,device:'device'});
  assert.equal((await client.session()).entityId,'realm-id');reject=true;
  await assert.rejects(client.session(),error=>error instanceof clientModule.AuthenticationError);
});
test('a changed identity blocks old API requests; nonce/config failures remain retryable',async()=>{
  let changed=false,called=0,status=403;const token=`x.${Buffer.from(JSON.stringify({userID:'account'})).toString('base64url')}.x`;
  const m=load('platform/client',{AbortSignal,localStorage:{getItem:key=>key==='device'?'device':changed?'other-token':token},fetch:async()=>{called++;return new Response(JSON.stringify({status:false,message:'Request not allowed! Invalid request.'}),{status});}});
  const c=m.createClient({hash:'key',apiBase:'https://api.example'},{token,device:'device'});
  await assert.rejects(c.session(),error=>!(error instanceof m.AuthenticationError));changed=true;
  await assert.rejects(c.request('/media/uploads','POST',{}),error=>error instanceof m.AuthenticationError);assert.equal(called,1);
  changed=false;status=401;await assert.rejects(c.session(),error=>error instanceof m.AuthenticationError);
});
test('publishing rejects overlong Moments before preparing or transferring uploads',async()=>{
  let requests=0,transfers=0;
  const {publishMoment}=load('platform/publish',{fetch:async()=>{transfers++;return new Response('',{status:200});}});
  const {newProject}=load('editor/model'),project=newProject({accountId:'a',entityId:'e'});
  project.clips=[{id:'c',assetId:'v',start:0,duration:120.1}];
  const client={request:async()=>{requests++;return{};},sign:async()=>{throw Error('An overlong Moment must never be signed');}};
  await assert.rejects(publishMoment(client,{accountId:'a',entityId:'e'},project,{video:new Blob(['mp4']),poster:new Blob(['poster']),width:720,height:1280},{caption:'',privacy:'public',allowReplies:true},new AbortController().signal,()=>{}),/2 minutes/);
  assert.equal(requests,0);assert.equal(transfers,0);
});

test('publishing uses existing signed Moment contract and direct storage PUTs without auth headers',async()=>{
  const requests=[],transfers=[];let signed;
  const m=load('platform/publish',{fetch:async(url,options)=>{transfers.push({url,...options});return new Response('',{status:200});}});
  const client={request:async(path,method,body)=>{
    requests.push({path,method,body});
    if(path==='/media/uploads')return{uploads:[body.purpose==='moment'?{uploadID:'v',fileUrl:'https://media.example/video.mp4',mode:'multipart',partSize:3,parts:[{n:1,url:'https://storage.example/v1',headers:{'Content-Type':'video/mp4'}},{n:2,url:'https://storage.example/v2',headers:{'Content-Type':'video/mp4'}}]}:{uploadID:'p',fileUrl:'https://media.example/poster.jpg',mode:'single',url:'https://storage.example/poster',headers:{'Content-Type':'image/jpeg'}}]};
    if(path==='/media/uploads/complete')return{status:true,results:[{ok:true}]};
    return{status:true};
  },sign:async payload=>{signed=payload;return 'signed-payload';}};
  const {newProject}=load('editor/model'),p=newProject({accountId:'a',entityId:'realm'}),session={accountId:'a',entityId:'realm'};
  await m.publishMoment(client,session,p,{video:new Blob(['12345'],{type:'video/mp4'}),poster:new Blob(['12'],{type:'image/jpeg'}),width:720,height:1280},{caption:'Hello 🌊',privacy:'public',allowReplies:true},new AbortController().signal,()=>{});
  assert.deepEqual(transfers.map(t=>t.body.size),[3,2,2]);assert.ok(transfers.every(t=>!Object.keys(t.headers).some(h=>/token|nonce/i.test(h))));
  assert.equal(signed.content.reference.reference,'https://media.example/video.mp4');assert.equal(signed.poster.url,'https://media.example/poster.jpg');assert.equal(signed.content.data,'Hello 🌊');assert.equal(requests.at(-1).path,'/posts/moments/create');assert.equal(requests.at(-1).body.token,'signed-payload');
  await assert.rejects(m.publishMoment(client,{...session,entityId:'other'},p,{}, {},new AbortController().signal,()=>{}),/different acting account/);
});
test('invalid transform and trim values cannot reach the render engine',()=>{
  const {newProject,validateProject}=load('editor/model');const p=newProject({accountId:'a',entityId:'e'});
  p.assets=[{id:'a',name:'x',kind:'image',file:new Blob(['x']),width:100,height:100,duration:6,hasAudio:false}];
  p.clips=[{id:'c',assetId:'a',start:0,duration:1,trimStart:NaN,volume:1,scale:1,rotation:0,x:.5,y:.5}];
  assert.throws(()=>validateProject(p));p.clips[0].trimStart=0;p.clips[0].scale=NaN;assert.throws(()=>validateProject(p));
});
test('WASM probe accepts its unset exit status only with valid video stream JSON',()=>{
  const {videoHasAudio}=load('engine/probe');assert.equal(typeof videoHasAudio,'function');
  assert.equal(videoHasAudio('{"streams":[{"codec_type":"video"},{"codec_type":"audio"}]}',-1),true);
  assert.equal(videoHasAudio('{"streams":[{"codec_type":"video"}]}',-1),false);
  assert.throws(()=>videoHasAudio('{"streams":[]}',-1));assert.throws(()=>videoHasAudio('invalid',0));assert.throws(()=>videoHasAudio('{"streams":[{"codec_type":"video"}]}',1));
});
test('nonce encryption and signed bodies match existing backend contracts',async()=>{
  const {nonce,signBody}=load('platform/protocol');
  assert.equal(typeof nonce,'function');
  const key='browser-client-key',value=await nonce('account',key);
  const [iv,data]=value.split('.').map(v=>Buffer.from(v,'hex'));
  const cipher=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),iv);cipher.setAuthTag(data.subarray(-16));
  const plain=Buffer.concat([cipher.update(data.subarray(0,-16)),cipher.final()]).toString();
  assert.match(plain,/^account\.\d+\.[a-z0-9]+$/);
  const signed=await signBody({caption:'Hello 🌊'},key),parts=signed.split('.');
  assert.equal(parts[2],crypto.createHmac('sha256',key).update(parts.slice(0,2).join('.')).digest('base64url'));
  assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).caption,'Hello 🌊');
});
test('routing keeps Studio paths scoped and Scenes disabled',()=>{
  const {route}=load('platform/routes');assert.equal(typeof route,'function');
  assert.equal(route('/studio/').kind,'home');assert.equal(route('/studio/moments/new').kind,'new');
  assert.equal(route('/studio/scenes/new').kind,'disabled');assert.equal(route('/studio/scenes/drafts/id').kind,'disabled');
  assert.equal(route('/someone').kind,'missing');assert.equal(route('/studio/moments/drafts/abc').id,'abc');
});
test('clips split at timeline time without losing source trims; ownership is enforced',()=>{
  const {newProject,splitClip,duration,assertOwner}=load('editor/model');assert.equal(typeof newProject,'function');
  const project=newProject({accountId:'a',entityId:'e'});project.clips=[{id:'clip',assetId:'a',start:2,duration:8,trimStart:3,volume:1,scale:1,rotation:0,x:.5,y:.5}];
  const next=splitClip(project,'clip',5);assert.equal(next.clips.length,2);assert.equal(next.clips[0].duration,3);assert.equal(next.clips[1].trimStart,6);assert.equal(duration(next),10);
  assert.throws(()=>assertOwner(project,{accountId:'a',entityId:'other'}));
});
test('draft ownership never retains credentials from the active session',()=>{
  const {newProject}=load('editor/model');const session={accountId:'account',entityId:'realm',token:'private-token',device:'private-device',name:'Realm'};
  const p=newProject(session);assert.deepEqual(Object.keys(p.owner).sort(),['accountId','entityId']);assert.ok(!JSON.stringify(p).includes('private-token'));
});
test('repeated media receive distinct playback identities for clips, layers and audio',()=>{
  const {newProject,playbackSources}=load('editor/model'),p=newProject({accountId:'a',entityId:'e'});
  p.clips=[{id:'clip',assetId:'source'}];p.layers=[{id:'layer',assetId:'source'}];p.audio=[{id:'audio',assetId:'source'}];
  assert.equal(typeof playbackSources,'function');const sources=playbackSources(p);assert.equal(sources.length,3);assert.equal(new Set(sources.map(s=>s.id)).size,3);assert.ok(sources.every(s=>s.assetId==='source'));
});
test('duplicate timeline items retain source trims and get an independent identity',()=>{
  const {newProject,duplicateItem}=load('editor/model'),p=newProject({accountId:'a',entityId:'e'});
  p.clips=[{id:'clip',assetId:'v',start:2,duration:3,trimStart:4,volume:.5,scale:1,rotation:0,x:.5,y:.5}];
  assert.equal(typeof duplicateItem,'function');const next=duplicateItem(p,'clips','clip');
  assert.equal(next.clips.length,2);assert.equal(next.clips[1].start,5);assert.equal(next.clips[1].trimStart,4);assert.notEqual(next.clips[1].id,'clip');assert.equal(p.clips.length,1);
  p.clips.push({...p.clips[0],id:'following',start:5});const shifted=duplicateItem(p,'clips','clip');assert.equal(shifted.clips.find(c=>c.id==='following').start,8);
});
test('text typeface selection is used by the canvas exporter',()=>{
  const {paintText}=load('engine/media'),fonts=[];
  const ctx={save(){},restore(){},set font(value){fonts.push(value);},measureText:()=>({width:30}),fillRect(){},fillText(){}};
  paintText(ctx,{text:'Hello',font:'Georgia',size:64,bold:true,x:.5,y:.5,align:'center',color:'#fff'},540,960,1080);
  assert.match(fonts[0],/Georgia/);
});
test('render plan places trimmed media, overlays, audio and emits streamable MP4',()=>{
  const {newProject}=load('editor/model'),{renderPlan}=load('engine/plan');assert.equal(typeof renderPlan,'function');
  const p=newProject({accountId:'a',entityId:'e'});p.assets=[{id:'v',name:'clip.mp4',kind:'video',file:new Blob(['v']),width:1920,height:1080,duration:10,hasAudio:true}];p.clips=[{id:'c',assetId:'v',start:0,duration:3,trimStart:2,volume:.5,scale:1,rotation:0,x:.5,y:.5}];
  const plan=renderPlan(p,{edge:720,publish:false,textFiles:[]});
  assert.ok(plan.args.includes('libx264'));assert.ok(plan.args.includes('aac'));assert.ok(plan.args.includes('+faststart'));assert.equal(plan.duration,3);assert.match(plan.args.join(' '),/volume=0.5/);
  p.clips[0].duration=121;assert.throws(()=>renderPlan(p,{edge:720,publish:true,textFiles:[]}));
});
