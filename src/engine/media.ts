import {uid,type Asset,type Project,type TextLayer} from '../editor/model';
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
  const scale=width/baseWidth,size=layer.size*scale,font=layer.font==='Georgia'?'Georgia, serif':layer.font==='monospace'?'monospace':'Inter, Arial, sans-serif';ctx.font=`${layer.bold?700:400} ${size}px ${font}`;ctx.textBaseline='middle';
  const lines=layer.text.split('\n'),lineHeight=size*1.25;
  const widths=lines.map(line=>ctx.measureText(line).width),x=layer.x*width,y=layer.y*height;
  const max=Math.max(1,...widths),left=layer.align==='center'?x-max/2:layer.align==='right'?x-max:x;
  if(layer.boxed){ctx.fillStyle='#111827dd';ctx.fillRect(left-size*.25,y-lines.length*lineHeight/2-size*.15,max+size*.5,lines.length*lineHeight+size*.3);}
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
  await Promise.all([document.fonts.load('400 16px Inter'),document.fonts.load('700 16px Inter')]);
  const baseWidth=project.orientation==='portrait'?1080:1920;
  const items=await Promise.all(project.texts.map(async(layer,index)=>({name:`text-${index}.png`,start:layer.start,duration:layer.duration,blob:await textCanvas(layer,width,height,baseWidth)})));
  if(watermark){items.push({name:'watermark.png',start:0,duration:Math.max(...[...project.clips,...project.layers,...project.texts,...project.audio].map(item=>item.start+item.duration)),blob:await textCanvas({id:'mark',text:`chatterloop · @${watermark}`,x:.96,y:.96,size:24,bold:true,boxed:false,color:'#ffffff',align:'right',start:0,duration:1},width,height,baseWidth)});}
  return items;
}
