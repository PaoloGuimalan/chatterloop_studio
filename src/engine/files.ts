import type {FFmpeg,FFFSType} from '@ffmpeg/ffmpeg';
import {withDeadline} from './deadline';
export async function openSource(ffmpeg:FFmpeg,name:string,blob:Blob){
  if(blob.size>=32*1024*1024){
    const directory=`/source-${name}`;await ffmpeg.createDir(directory);
    if(!await ffmpeg.mount('WORKERFS' as FFFSType,{blobs:[{name,data:blob}]},directory))throw Error('This browser could not open the source file for streaming. Please retry.');
    return{path:`${directory}/${name}`,close:async()=>{if(ffmpeg.loaded)await withDeadline((async()=>{await ffmpeg.unmount(directory);await ffmpeg.deleteDir(directory);})(),5000,'Source cleanup timed out.',()=>ffmpeg.terminate());}};
  }
  await ffmpeg.writeFile(name,new Uint8Array(await blob.arrayBuffer()));
  return{path:name,close:async()=>{if(ffmpeg.loaded)await ffmpeg.deleteFile(name);}};
}
