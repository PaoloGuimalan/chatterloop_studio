import type {FFmpeg} from '@ffmpeg/ffmpeg';
import type {Project,Asset} from '../editor/model';
import {renderPlan,type RenderOptions} from './plan';
import {textFiles} from './media';
import {videoHasAudio} from './probe';
import {withDeadline} from './deadline';
let engine:FFmpeg|undefined,loading:Promise<FFmpeg>|undefined,generation=0;
export async function loadEngine(base:string,onState?:(label:string)=>void):Promise<FFmpeg>{
  if(engine?.loaded)return engine;
  if(loading)return loading;
  const current=generation;
  const pending=(async()=>{onState?.('Loading editor engine…');const {FFmpeg}=await import('@ffmpeg/ffmpeg');if(current!==generation)throw Error('Engine loading cancelled.');const ffmpeg=new FFmpeg();engine=ffmpeg;
    try{await withDeadline(ffmpeg.load({coreURL:new URL(`${base}ffmpeg/ffmpeg-core.js`,location.origin).href,wasmURL:new URL(`${base}ffmpeg/ffmpeg-core.wasm`,location.origin).href}),45000,'The editor engine took too long to load. Please retry.',()=>ffmpeg.terminate());if(current!==generation)throw Error('Engine loading cancelled.');return ffmpeg;}
    catch(error){ffmpeg.terminate();if(engine===ffmpeg)engine=undefined;throw error;}
  })();
  loading=pending;void pending.finally(()=>{if(loading===pending)loading=undefined;}).catch(()=>{});return pending;
}
export function cancelRender(){generation++;engine?.terminate();engine=undefined;loading=undefined;}
export async function probeAudio(asset:Asset,base:string,onState?:(label:string)=>void){
  onState?.('Loading editor engine…');
  const ffmpeg=await loadEngine(base),name=`probe-${asset.id}`,out=`${name}.json`;
  try{onState?.('Inspecting video audio…');await withDeadline(ffmpeg.writeFile(name,new Uint8Array(await asset.file.arrayBuffer())),30000,'The video file could not be opened. Please retry.',cancelRender);const code=await withDeadline(ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type','-of','json',name,'-o',out],20000),30000,'Video inspection took too long. Try another video or retry.',cancelRender);const data=await ffmpeg.readFile(out,'utf8');return videoHasAudio(String(data),code);}finally{for(const file of[name,out])try{await ffmpeg.deleteFile(file);}catch{}}
}
export async function render(project:Project,options:{edge:720|1080;publish:boolean;handle:string;base:string;onProgress:(progress:number,label:string)=>void}){
  const ffmpeg=await loadEngine(options.base,label=>options.onProgress(0,label));
  const w=project.orientation==='portrait'?options.edge:Math.round(options.edge*16/9/2)*2,h=project.orientation==='portrait'?Math.round(options.edge*16/9/2)*2:options.edge;
  options.onProgress(0,'Preparing text and export signature…');
  const captions=await textFiles(project,w,h,options.publish?undefined:options.handle);
  const plan=renderPlan(project,{...options,textFiles:captions} as RenderOptions);
  const names:string[]=[];let logs:string[]=[];
  const progress=({time}:{time:number})=>options.onProgress(Math.min(.99,time/1000000/plan.duration),'Rendering your edit…');
  const log=({message}:{message:string})=>{logs.push(message);if(logs.length>20)logs.shift();};
  ffmpeg.on('progress',progress);ffmpeg.on('log',log);
  try{
    options.onProgress(0,'Opening source media…');
    for(const file of plan.files){const blob=file.asset?.file||file.text?.blob;if(!blob)throw Error('A render asset is missing.');await withDeadline(ffmpeg.writeFile(file.name,new Uint8Array(await blob.arrayBuffer())),30000,'Opening source media took too long. Please retry.',cancelRender);names.push(file.name);}
    options.onProgress(0,'Rendering your edit…');
    const result=await ffmpeg.exec(plan.args);if(result!==0)throw Error([...logs].reverse().find(line=>/Error|Invalid|not found|No such/i.test(line))||'The edit could not be rendered.');
    const data=await ffmpeg.readFile('output.mp4');if(typeof data==='string')throw Error('The rendered video is unavailable.');
    const video=new Blob([new Uint8Array(data).buffer],{type:'video/mp4'});
    if(options.publish&&video.size>100*1024*1024)throw Error('The rendered Moment is larger than 100 MiB. Use 720p or shorten the edit.');
    if(await ffmpeg.exec(['-y','-i','output.mp4','-frames:v','1','-q:v','2','poster.jpg'])!==0)throw Error('The poster could not be created.');
    const posterData=await ffmpeg.readFile('poster.jpg');if(typeof posterData==='string')throw Error('Poster unavailable.');
    options.onProgress(1,'Ready');return{video,poster:new Blob([new Uint8Array(posterData).buffer],{type:'image/jpeg'}),width:plan.width,height:plan.height};
  }finally{ffmpeg.off('progress',progress);ffmpeg.off('log',log);for(const name of [...names,'output.mp4','poster.jpg'])try{await ffmpeg.deleteFile(name);}catch{/* A cancelled worker has no remaining filesystem. */}}
}
