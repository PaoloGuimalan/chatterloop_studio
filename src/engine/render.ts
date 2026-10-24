import type {FFmpeg} from '@ffmpeg/ffmpeg';
import type {Project,Asset} from '../editor/model';
import {renderPlan,type RenderOptions} from './plan';
import {textFiles,posterFromVideo} from './media';
import {videoMetadata} from './probe';
import {withDeadline} from './deadline';
import {coreSettings} from './settings';
import {encodedFrameProgress} from './progress';
import {failureMessage} from '../platform/errors';
import {openSource} from './files';
let engine:FFmpeg|undefined,loading:Promise<FFmpeg>|undefined,generation=0,engineThreads=1;
export async function loadEngine(base:string,onState?:(label:string)=>void):Promise<FFmpeg>{
  if(engine?.loaded)return engine;
  if(loading)return loading;
  const current=generation;
  const pending=(async()=>{const {FFmpeg}=await import('@ffmpeg/ffmpeg');
    const preferred=coreSettings(base,globalThis.crossOriginIsolated&&typeof SharedArrayBuffer!=='undefined',navigator.hardwareConcurrency||1);
    const candidates=preferred.threads>1?[preferred,coreSettings(base,false,1)]:[preferred];
    for(const [index,settings] of candidates.entries()){
      if(current!==generation)throw Error('Engine loading cancelled.');
      onState?.('Loading editor engine…');
      const ffmpeg=new FFmpeg();engine=ffmpeg;
      try{
        const coreURL=new URL(`${settings.corePath}ffmpeg-core.js`,location.origin).href,wasmURL=new URL(`${settings.corePath}ffmpeg-core.wasm`,location.origin).href;
        const workerURL=settings.threads>1?new URL(`${settings.corePath}ffmpeg-core.worker.js`,location.origin).href:undefined;
        await withDeadline(ffmpeg.load({coreURL,wasmURL,workerURL}),45000,'The editor engine took too long to load. Please retry.',()=>ffmpeg.terminate());
        if(current!==generation)throw Error('Engine loading cancelled.');engineThreads=settings.threads;return ffmpeg;
      }catch(error){ffmpeg.terminate();if(engine===ffmpeg)engine=undefined;if(current!==generation||index===candidates.length-1)throw error;}
    }
    throw Error('The editor engine is unavailable.');
  })();
  loading=pending;void pending.finally(()=>{if(loading===pending)loading=undefined;}).catch(()=>{});return pending;
}
export function cancelRender(){generation++;engine?.terminate();engine=undefined;loading=undefined;}
function releaseEngine(ffmpeg:FFmpeg){ffmpeg.terminate();if(engine===ffmpeg){engine=undefined;loading=undefined;engineThreads=1;}}
export async function probeMedia(asset:Asset,base:string,onState?:(label:string)=>void){
  onState?.('Loading editor engine…');
  const ffmpeg=await loadEngine(base),name=`probe-${asset.id}`,out=`${name}.json`;
  let source:Awaited<ReturnType<typeof openSource>>|undefined;
  try{onState?.('Reading video details…');source=await withDeadline(openSource(ffmpeg,name,asset.file),30000,'The video file could not be opened. Please retry.',cancelRender);const code=await withDeadline(ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type,avg_frame_rate,r_frame_rate','-of','json',source.path,'-o',out],20000),30000,'Video inspection took too long. Try another video or retry.',cancelRender);const data=await ffmpeg.readFile(out,'utf8');return videoMetadata(String(data),code);}finally{try{await source?.close();if(ffmpeg.loaded)await ffmpeg.deleteFile(out);}catch{}}
}
export interface RenderedEdit {video:Blob;poster:Blob|null;width:number;height:number}
export async function render(project:Project,options:{edge:720|1080;publish:boolean;preparePoster?:boolean;bitrateScale?:number;handle:string;base:string;signal?:AbortSignal;onProgress:(progress:number,label:string)=>void;onMetadata?:(assets:Asset[])=>void}):Promise<RenderedEdit>{
  const ffmpeg=await loadEngine(options.base,label=>options.onProgress(0,label));
  try{return await renderJob(ffmpeg,project,options);}
  catch(error){
    if(/memory access out of bounds|out of memory|memory allocation|Aborted\(OOM\)/i.test(failureMessage(error,'')))throw Error('The video renderer encountered a memory error. Please retry; use 720p if it happens again.',{cause:error});
    throw error;
  }finally{
    // FS.unlink does not release the WASM heap or encoder thread state. A
    // completed/crashed job must never become the next Export/Share session.
    releaseEngine(ffmpeg);
  }
}
async function renderJob(ffmpeg:FFmpeg,project:Project,options:Parameters<typeof render>[1]):Promise<RenderedEdit>{
  const used=new Set([...project.clips,...project.layers].map(item=>item.assetId));
  let updated=false;const assets:Asset[]=[];
  for(const asset of project.assets){
    if(asset.kind==='video'&&used.has(asset.id)&&!Number.isFinite(asset.fps)){
      const metadata=await probeMedia(asset,options.base,label=>options.onProgress(0,label));assets.push({...asset,...metadata});updated=true;
    }else assets.push(asset);
  }
  if(updated){project={...project,assets};options.onMetadata?.(assets);}
  const w=project.orientation==='portrait'?options.edge:Math.round(options.edge*16/9/2)*2,h=project.orientation==='portrait'?Math.round(options.edge*16/9/2)*2:options.edge;
  options.onProgress(0,'Preparing text and export signature…');
  const captions=await textFiles(project,w,h,options.publish?undefined:options.handle);
  const plan=renderPlan(project,{...options,textFiles:captions,threads:engineThreads} as RenderOptions);
  const logs:string[]=[];
  const renderLabel='Rendering your edit…';
  let lastProgress=0,lastUpdate=0,encoding=false;
  const log=({message}:{message:string})=>{
    logs.push(message);if(logs.length>20)logs.shift();
    const progress=encoding?encodedFrameProgress(message,plan.fps,plan.duration):undefined;
    if(progress===undefined)return;
    lastProgress=Math.max(lastProgress,progress);
    if(performance.now()-lastUpdate>=200){lastUpdate=performance.now();options.onProgress(lastProgress,renderLabel);}
  };
  ffmpeg.on('log',log);
  try{
    options.onProgress(0,'Opening source media…');
    const paths=new Map<string,string>();
    for(const file of plan.files){const blob=file.asset?.file||file.text?.blob;if(!blob)throw Error('A render asset is missing.');const source=await withDeadline(openSource(ffmpeg,file.name,blob),30000,'Opening source media took too long. Please retry.',cancelRender);paths.set(file.name,source.path);}
    options.onProgress(0,renderLabel);
    encoding=true;
    const result=await ffmpeg.exec(plan.args.map(arg=>paths.get(arg)??arg));encoding=false;if(result!==0)throw Error([...logs].reverse().find(line=>/Error|Invalid|not found|No such/i.test(line))||'The edit could not be rendered.');
    const data=await ffmpeg.readFile('output.mp4');if(typeof data==='string')throw Error('The rendered video is unavailable.');
    const video=new Blob([new Uint8Array(data).buffer],{type:'video/mp4'});
    if(options.publish&&video.size>100*1024*1024){
      if(options.bitrateScale)throw Error('This Moment could not fit the upload limit. Try 720p or shorten the edit.');
      releaseEngine(ffmpeg);options.onProgress(0,'Optimizing your Moment for sharing…');return render(project,{...options,bitrateScale:.6});
    }
    if(!options.publish||options.preparePoster===false){options.onProgress(1,'Ready');return{video,poster:null,width:plan.width,height:plan.height};}
    options.onProgress(.99,'Preparing the Moment poster…');
    // The shipped WASM MJPEG encoder can trap on full-HD frames. Decode the
    // actual finished edit with the browser after releasing the WASM heap.
    releaseEngine(ffmpeg);
    const poster=await posterFromVideo(video,plan.width,plan.height,options.signal);
    options.onProgress(1,'Ready');return{video,poster,width:plan.width,height:plan.height};
  }finally{ffmpeg.off('log',log);}
}
