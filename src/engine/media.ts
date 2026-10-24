import {uid,type Asset,type Project,type TextLayer} from '../editor/model';
import {watermarkImage} from './watermark';
import {withDeadline} from './deadline';
import {compactOverlay} from './overlay';
import type {TextFile} from './plan';
export async function posterFromVideo(file:Blob,width:number,height:number,signal?:AbortSignal):Promise<Blob>{
  signal?.throwIfAborted();
  const url=URL.createObjectURL(file),video=document.createElement('video'),canvas=document.createElement('canvas');
  video.preload='auto';video.muted=true;video.playsInline=true;
  let abort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(signal?.reason||Error('Poster creation cancelled.'));signal?.addEventListener('abort',abort,{once:true});});
  const task=<T>(promise:Promise<T>)=>withDeadline(Promise.race([promise,cancelled]),15000,'The Moment poster could not be prepared. Please retry.');
  try{
    await task(new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(Error('This browser could not open the rendered video to create its poster.'));video.src=url;video.load();}));
    signal?.throwIfAborted();
    if(!video.videoWidth||!video.videoHeight)throw Error('The rendered video has no readable poster frame.');
    canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('The Moment poster canvas is unavailable.');
    context.drawImage(video,0,0,width,height);
    return await task(new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?.type==='image/jpeg'?resolve(blob):reject(Error('The Moment poster could not be saved as JPEG.')),'image/jpeg',.9)));
  }finally{
    signal?.removeEventListener('abort',abort);video.onloadeddata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);canvas.width=0;canvas.height=0;
  }
}
export async function importAsset(file:File):Promise<Asset>{
  const kind=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':null;
  if(!kind)throw Error(`${file.name}: choose a photo, video, or audio file.`);
  if(file.size>300*1024*1024)throw Error('Choose files smaller than 300 MiB for browser editing.');
  const url=URL.createObjectURL(file);
  try{
    if(kind==='image'){
      const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error(`Cannot open ${file.name}`));image.src=url;});
      return{id:uid(),kind,name:file.name,file,width:image.naturalWidth,height:image.naturalHeight,duration:6,hasAudio:false};
    }
    const element=document.createElement(kind==='video'?'video':'audio');element.preload='metadata';element.src=url;
    await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Media information timed out.')),12000);element.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};element.onerror=()=>{clearTimeout(timeout);reject(Error(`This browser cannot preview ${file.name}. Try MP4, MP3 or WAV.`));};});
    if(!Number.isFinite(element.duration)||element.duration<=0)throw Error('This media has no readable duration.');
    const video=element as HTMLVideoElement;
    return{id:uid(),kind,name:file.name,file,duration:element.duration,width:kind==='video'?video.videoWidth:0,height:kind==='video'?video.videoHeight:0,hasAudio:kind==='audio'||!!((video as any).audioTracks?.length||(video as any).mozHasAudio||(video as any).webkitAudioDecodedByteCount)};
  }finally{URL.revokeObjectURL(url);}
}
export function paintText(ctx:CanvasRenderingContext2D,layer:TextLayer,width:number,height:number,baseWidth:number){
  ctx.save();
  const scale=width/baseWidth,size=layer.size*scale*(layer.scale??1),font=layer.font==='Georgia'?'Georgia, serif':layer.font==='monospace'?'monospace':'Inter, Arial, sans-serif';ctx.font=`${layer.bold?700:400} ${size}px ${font}`;ctx.textBaseline='middle';
  const lines=layer.text.split('\n'),lineHeight=size*1.25;
  const widths=lines.map(line=>ctx.measureText(line).width);let x=layer.x*width,y=layer.y*height;
  if(layer.rotation){ctx.translate(x,y);ctx.rotate(layer.rotation*Math.PI/180);x=0;y=0;}
  const max=Math.max(1,...widths),left=layer.align==='center'?x-max/2:layer.align==='right'?x-max:x;
  if(layer.boxed){const color=layer.color.replace('#','');const values=[0,2,4].map(i=>parseInt(color.slice(i,i+2),16)||0);ctx.fillStyle=values[0]*.2126+values[1]*.7152+values[2]*.0722>128?'#111827dd':'#ffffffdd';ctx.fillRect(left-size*.25,y-lines.length*lineHeight/2-size*.15,max+size*.5,lines.length*lineHeight+size*.3);}
  ctx.fillStyle=layer.color;ctx.textAlign=layer.align;
  lines.forEach((line,index)=>ctx.fillText(line,x,y+(index-(lines.length-1)/2)*lineHeight));
  ctx.restore();
}
export function textCanvas(layer:TextLayer,width:number,height:number,baseWidth:number):Promise<Blob>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paintText(canvas.getContext('2d')!,layer,width,height,baseWidth);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Text could not be rendered.')),'image/png'));
}
export async function textFiles(project:Project,width:number,height:number,watermark?:string){
  await withDeadline(Promise.all([document.fonts.load('400 16px Inter'),document.fonts.load('700 16px Inter')]),10000,'The editor fonts could not load. Reload Studio and retry.');
  const baseWidth=project.orientation==='portrait'?1080:1920;
  const items:TextFile[]=await Promise.all(project.texts.map(async(layer,index)=>({name:`text-${index}.png`,layerId:layer.id,start:layer.start,duration:layer.duration,...await compactOverlay(await textCanvas(layer,width,height,baseWidth),width,height)})));
  if(watermark!==undefined){items.push({name:'watermark.png',start:0,duration:Math.max(...[...project.clips,...project.layers,...project.texts,...project.audio].map(item=>item.start+item.duration)),...await compactOverlay(await withDeadline(watermarkImage(watermark,width,height),15000,'The export signature could not load. Reload Studio and retry.'),width,height)});}
  return items;
}
