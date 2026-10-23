import {duration,validateProject,type Project,type Asset,type Clip} from '../editor/model';
export interface TextFile {name:string;start:number;duration:number;blob?:Blob}
export interface RenderOptions {edge:720|1080;publish:boolean;textFiles:TextFile[]}
const number=(value:number)=>Number(value.toFixed(4));
export function renderPlan(project:Project,options:RenderOptions){
  validateProject(project);const total=duration(project);
  if(options.publish&&total>120)throw Error('Trim this Moment to 2 minutes or less before sharing. Export can keep the full edit.');
  const width=project.orientation==='portrait'?options.edge:options.edge*16/9;
  const height=project.orientation==='portrait'?options.edge*16/9:options.edge;
  const w=Math.round(width/2)*2,h=Math.round(height/2)*2;
  const args=['-y','-f','lavfi','-i',`color=c=${project.background.color.replace('#','0x')}:s=${w}x${h}:r=30:d=${number(total)}`];
  const files:{name:string;asset?:Asset;text?:TextFile}[]=[],filters:string[]=[];
  let index=1,canvas='0:v';const audioLabels:string[]=[];
  const assetFor=(id:string)=>project.assets.find(asset=>asset.id===id)!;
  const addInput=(asset:Asset,item:{trimStart:number;duration:number})=>{
    const ext=asset.kind==='image'?'img':asset.kind==='audio'?'audio':'video';
    const name=`input-${index}.${ext}`;const id=index++;
    if(asset.kind==='image')args.push('-loop','1','-framerate','30');else args.push('-ss',String(number(item.trimStart)));
    args.push('-t',String(number(item.duration)),'-i',name);files.push({name,asset});return id;
  };
  const addSound=(id:number,item:{start:number;duration:number;volume:number;fadeIn?:number;fadeOut?:number})=>{
    const name=`sound${audioLabels.length}`;const fadeIn=Math.min(item.fadeIn||0,item.duration/2),fadeOut=Math.min(item.fadeOut||0,item.duration/2);
    filters.push(`[${id}:a]asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,volume=${number(item.volume)}${fadeIn?`,afade=t=in:d=${number(fadeIn)}`:''}${fadeOut?`,afade=t=out:st=${number(item.duration-fadeOut)}:d=${number(fadeOut)}`:''},adelay=${Math.round(item.start*1000)}|${Math.round(item.start*1000)}[${name}]`);audioLabels.push(name);
  };
  const visual=(clip:Clip,layer:boolean)=>{
    const asset=assetFor(clip.assetId);const id=addInput(asset,clip),start=number(clip.start),end=number(clip.start+clip.duration);
    const foreground=`fg${id}`;let source=`${id}:v`;
    if(!layer&&project.background.type==='blur'){
      filters.push(`[${source}]split=2[fgsrc${id}][bgsrc${id}]`);source=`fgsrc${id}`;
      filters.push(`[bgsrc${id}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:2,setsar=1,format=rgba,setpts=PTS-STARTPTS+${start}/TB[bg${id}]`);
      const result=`back${id}`;filters.push(`[${canvas}][bg${id}]overlay=0:0:enable='between(t,${start},${end})':eof_action=pass[${result}]`);canvas=result;
    }
    const fit=Math.min(w/asset.width,h/asset.height)*clip.scale;
    const sw=Math.max(2,Math.round(asset.width*fit/2)*2),sh=Math.max(2,Math.round(asset.height*fit/2)*2),angle=number(clip.rotation*Math.PI/180);
    filters.push(`[${source}]scale=${sw}:${sh},setsar=1,format=rgba${angle?`,rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=none`:''},setpts=PTS-STARTPTS+${start}/TB[${foreground}]`);
    const result=`canvas${id}`;filters.push(`[${canvas}][${foreground}]overlay=x=W*${number(clip.x)}-w/2:y=H*${number(clip.y)}-h/2:enable='between(t,${start},${end})':eof_action=pass[${result}]`);canvas=result;
    if(asset.kind==='video'&&asset.hasAudio&&clip.volume>0)addSound(id,clip);
  };
  project.clips.forEach(c=>visual(c,false));project.layers.forEach(c=>visual(c,true));
  for(const text of options.textFiles){const id=index++;args.push('-loop','1','-framerate','30','-t',String(text.duration),'-i',text.name);files.push({name:text.name,text});filters.push(`[${id}:v]format=rgba,setpts=PTS-STARTPTS+${number(text.start)}/TB[text${id}]`);const result=`caption${id}`;filters.push(`[${canvas}][text${id}]overlay=0:0:enable='between(t,${number(text.start)},${number(text.start+text.duration)})':eof_action=pass[${result}]`);canvas=result;}
  for(const track of project.audio){const id=addInput(assetFor(track.assetId),track);addSound(id,track);}
  const silent=index;args.push('-f','lavfi','-t',String(number(total)),'-i','anullsrc=channel_layout=stereo:sample_rate=44100');
  filters.push(`[${silent}:a]atrim=duration=${number(total)}[silence]`);audioLabels.unshift('silence');
  filters.push(`${audioLabels.map(label=>`[${label}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95,atrim=duration=${number(total)}[audio]`);
  filters.push(`[${canvas}]format=yuv420p[video]`);
  // A 100 MiB Moment keeps a margin for AAC and container overhead.
  const bitrate=options.publish?Math.min(12000000,Math.floor(100*1024*1024*.82*8/total)-128000):12000000;
  args.push('-filter_complex',filters.join(';'),'-map','[video]','-map','[audio]','-t',String(number(total)),'-r','30','-c:v','libx264','-preset','ultrafast','-crf','22','-maxrate',String(bitrate),'-bufsize',String(bitrate*2),'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads','1','output.mp4');
  return{args,files,width:w,height:h,duration:total};
}
