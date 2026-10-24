import {duration,exportFrameRate,validateProject,type Project,type Asset,type Clip} from '../editor/model';
import {orderedOverlays} from '../editor/timelineRules';
import {visibleMediaRect} from '../editor/geometry';
export interface TextFile {name:string;layerId?:string;start:number;duration:number;blob?:Blob;x?:number;y?:number}
export interface RenderOptions {edge:720|1080;publish:boolean;textFiles:TextFile[];threads?:number;bitrateScale?:number}
const number=(value:number)=>Number(value.toFixed(4));
export function renderPlan(project:Project,options:RenderOptions){
  validateProject(project);const total=duration(project),fps=exportFrameRate(project);
  if(options.publish&&total>120)throw Error('Trim this Moment to 2 minutes or less before sharing. Export can keep the full edit.');
  const width=project.orientation==='portrait'?options.edge:options.edge*16/9;
  const height=project.orientation==='portrait'?options.edge*16/9:options.edge;
  const w=Math.round(width/2)*2,h=Math.round(height/2)*2;
  const single=project.clips.length===1?project.clips[0]:undefined,mainAsset=single?project.assets.find(asset=>asset.id===single.assetId):undefined;
  // An opaque, untransformed MP4 covering the entire edit is already a canvas.
  // Keep it in YUV instead of blurring and compositing two hidden full frames.
  const directBase=single&&mainAsset?.kind==='video'&&mainAsset.file.type==='video/mp4'&&single.start===0&&Math.abs(single.duration-total)<1e-6&&single.x===.5&&single.y===.5&&single.scale===1&&single.rotation%360===0&&Math.abs(mainAsset.width/mainAsset.height-w/h)<1e-6?single.id:undefined;
  // ffprobe's -v error survives core.reset(). Restore frame statistics for
  // every render, including the first quick share after video inspection.
  const args=['-y','-loglevel','info','-stats'];
  if(!directBase)args.push('-f','lavfi','-i',`color=c=black:s=${w}x${h}:r=${fps}:d=${number(total)}`);
  const files:{name:string;asset?:Asset;text?:TextFile}[]=[],filters:string[]=[];
  let index=directBase?0:1,canvas='0:v';const audioLabels:string[]=[];
  const assetFor=(id:string)=>project.assets.find(asset=>asset.id===id)!;
  const addInput=(asset:Asset,item:{trimStart:number;duration:number})=>{
    const ext=asset.kind==='image'?'img':asset.kind==='audio'?'audio':'video';
    const name=`input-${index}.${ext}`;const id=index++;
    if(asset.kind!=='image')args.push('-ss',String(number(item.trimStart)),'-t',String(number(item.duration)));
    args.push('-threads','1','-i',name);files.push({name,asset});return id;
  };
  const addSound=(id:number,item:{start:number;duration:number;volume:number;fadeIn?:number;fadeOut?:number})=>{
    const name=`sound${audioLabels.length}`;const fadeIn=Math.min(item.fadeIn||0,item.duration/2),fadeOut=Math.min(item.fadeOut||0,item.duration/2);
    filters.push(`[${id}:a]asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,volume=${number(item.volume)}${fadeIn?`,afade=t=in:d=${number(fadeIn)}`:''}${fadeOut?`,afade=t=out:st=${number(item.duration-fadeOut)}:d=${number(fadeOut)}`:''},adelay=${Math.round(item.start*1000)}|${Math.round(item.start*1000)}[${name}]`);audioLabels.push(name);
  };
  const visual=(clip:Clip,layer:boolean)=>{
    const asset=assetFor(clip.assetId);const id=addInput(asset,clip),start=number(clip.start),end=number(clip.start+clip.duration);
    const foreground=`fg${id}`;let source=`${id}:v`;
    const opaque=asset.kind==='video'&&asset.file.type==='video/mp4',unrotated=clip.rotation%360===0;
    const fit=Math.min(w/asset.width,h/asset.height)*clip.scale,drawWidth=asset.width*fit,drawHeight=asset.height*fit;
    const coversBackground=opaque&&unrotated&&clip.x*w-drawWidth/2<=0&&clip.y*h-drawHeight/2<=0&&clip.x*w+drawWidth/2>=w&&clip.y*h+drawHeight/2>=h;
    if(!layer&&clip.id===directBase){
      filters.push(`[${source}]scale=${w}:${h},setsar=1,setpts=PTS-STARTPTS[${foreground}]`);canvas=foreground;
      if(asset.hasAudio&&clip.volume>0)addSound(id,clip);
      return;
    }
    if(!layer&&!coversBackground&&project.background.type==='blur'){
      filters.push(`[${source}]split=2[fgsrc${id}][bgsrc${id}]`);source=`fgsrc${id}`;
      const cover=Math.max(w/asset.width,h/asset.height),cropW=Math.max(1,Math.floor(w/cover)),cropH=Math.max(1,Math.floor(h/cover));
      filters.push(`[bgsrc${id}]crop=${cropW}:${cropH},scale=${Math.max(2,Math.round(w/8)*2)}:${Math.max(2,Math.round(h/8)*2)},boxblur=10:2,scale=${w}:${h},eq=brightness=-0.08,setsar=1,format=rgba,setpts=PTS-STARTPTS+${start}/TB[bg${id}]`);
      const result=`back${id}`;filters.push(`[${canvas}][bg${id}]overlay=0:0:enable='between(t,${start},${end})':eof_action=${asset.kind==='image'?'repeat':'pass'}[${result}]`);canvas=result;
    }
    if(!layer&&!coversBackground&&project.background.type==='color'){
      filters.push(`color=c=${project.background.color.replace('#','0x')}:s=${w}x${h}:r=${fps}:d=${number(clip.duration)},format=rgba,setpts=PTS-STARTPTS+${start}/TB[bg${id}]`);
      const result=`back${id}`;filters.push(`[${canvas}][bg${id}]overlay=0:0:enable='between(t,${start},${end})':eof_action=pass[${result}]`);canvas=result;
    }
    const part=visibleMediaRect(asset.width,asset.height,w,h,clip);
    const sw=Math.max(2,Math.round(part.drawWidth/2)*2),sh=Math.max(2,Math.round(part.drawHeight/2)*2),angle=number(clip.rotation*Math.PI/180);
    filters.push(`[${source}]crop=${part.width}:${part.height}:${part.left}:${part.top}:exact=1,scale=${sw}:${sh},setsar=1,format=${opaque&&unrotated?'yuva420p':'rgba'}${angle?`,rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=none`:''},setpts=PTS-STARTPTS+${start}/TB[${foreground}]`);
    const result=`canvas${id}`;filters.push(`[${canvas}][${foreground}]overlay=x=${number(part.x)}-w/2:y=${number(part.y)}-h/2:enable='between(t,${start},${end})':eof_action=${asset.kind==='image'?'repeat':'pass'}[${result}]`);canvas=result;
    if(asset.kind==='video'&&asset.hasAudio&&clip.volume>0)addSound(id,clip);
  };
  const drawText=(text:TextFile)=>{const id=index++;args.push('-threads','1','-i',text.name);files.push({name:text.name,text});filters.push(`[${id}:v]format=rgba,setpts=PTS-STARTPTS+${number(text.start)}/TB[text${id}]`);const result=`caption${id}`;filters.push(`[${canvas}][text${id}]overlay=${number(text.x??0)}:${number(text.y??0)}:enable='between(t,${number(text.start)},${number(text.start+text.duration)})':eof_action=repeat[${result}]`);canvas=result;};
  const drawn=new Set<TextFile>();project.clips.forEach(c=>visual(c,false));
  for(const entry of orderedOverlays(project))if(entry.kind==='layers')visual(entry.item as Clip,true);else{
    const text=options.textFiles.find(file=>file.layerId===entry.item.id);if(text){drawText(text);drawn.add(text);}
  }
  for(const text of options.textFiles)if(!drawn.has(text))drawText(text);
  for(const track of project.audio){const id=addInput(assetFor(track.assetId),track);addSound(id,track);}
  // Keep silence in the same graph: a second lavfi input creates its own
  // automatic thread pool and can exhaust the multithread WASM worker pool.
  filters.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${number(total)}[silence]`);audioLabels.unshift('silence');
  filters.push(`${audioLabels.map(label=>`[${label}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95,atrim=duration=${number(total)}[audio]`);
  filters.push(`[${canvas}]format=yuv420p[video]`);
  // A 100 MiB Moment keeps a margin for AAC and container overhead.
  const bitrate=options.publish?Math.floor(Math.min(12000000,Math.floor(100*1024*1024*.82*8/total)-128000)*(options.bitrateScale??1)):12000000;
  const threads=Math.max(1,Math.min(4,Math.floor(options.threads||1)));
  args.push('-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map','[video]','-map','[audio]','-t',String(number(total)),'-r',String(fps),'-c:v','libx264','-preset','ultrafast','-crf','22','-maxrate',String(bitrate),'-bufsize',String(bitrate*2),'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads',String(threads),'output.mp4');
  return{args,files,width:w,height:h,duration:total,fps};
}
