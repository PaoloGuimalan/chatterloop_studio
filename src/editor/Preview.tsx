import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Maximize,Minimize,Play,Pause,SkipBack,SkipForward,Smartphone,PanelBottomClose,PanelBottomOpen} from 'lucide-react';
import {duration,playbackSources,type Project,type Clip} from './model';
import {paintText} from '../engine/media';
import {orderedOverlays,type Pick} from './timelineRules';
import {fitCanvas,fillScale,mediaBounds,textBounds,type Transform} from './geometry';
import useCanvasInteraction from './useCanvasInteraction';
export function timecode(value:number){const seconds=Math.max(0,value);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(1).padStart(4,'0')}`;}
interface Props{project:Project;time:number;playing:boolean;setTime:(value:number)=>void;setPlaying:(value:boolean)=>void;historyControls:ReactNode;onOrientationChange:(value:Project['orientation'])=>void;selection:Pick|null;busy:boolean;onSelect:(pick:Pick|null)=>void;onTransform:(pick:Pick,transform:Transform)=>void;onGestureStart:()=>void;onGestureEnd:(cancel?:boolean)=>void;focusPreview:boolean;onToggleFocus:()=>void;}
export default function Preview({project,time,playing,setTime,setPlaying,historyControls,onOrientationChange,selection,busy,onSelect,onTransform,onGestureStart,onGestureEnd,focusPreview,onToggleFocus}:Props){
  const canvas=useRef<HTMLCanvasElement>(null),surface=useRef<HTMLDivElement>(null),media=useRef(new Map<string,HTMLImageElement|HTMLMediaElement>()),state=useRef({project,time,playing});state.current={project,time,playing};
  const [expanded,setExpanded]=useState(false),[nativeFull,setNativeFull]=useState(false);
  const holder=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null),[space,setSpace]=useState({width:0,height:0});
  const audioContext=useRef<AudioContext>(),gains=useRef(new Map<string,GainNode>());
  const interaction=useCanvasInteraction({project,time,selection,busy,frame,onSelect,onTransform,onGestureStart,onGestureEnd});
  useEffect(()=>{const node=holder.current;if(!node)return;const observer=new ResizeObserver(()=>setSpace({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>()=>{void audioContext.current?.close();audioContext.current=undefined;gains.current.clear();},[]);
  const sourceKey=JSON.stringify(playbackSources(project));
  useEffect(()=>{
    const urls:string[]=[];const map=media.current;
    for(const instance of playbackSources(project)){const asset=project.assets.find(a=>a.id===instance.assetId);if(!asset)continue;const url=URL.createObjectURL(asset.file);urls.push(url);if(asset.kind==='image'){const image=new Image();image.src=url;map.set(instance.id,image);}else{const element=document.createElement(asset.kind==='video'?'video':'audio');element.preload='auto';if(element instanceof HTMLVideoElement)element.playsInline=true;element.src=url;map.set(instance.id,element);}}
    return()=>{for(const url of urls)URL.revokeObjectURL(url);for(const element of map.values())if(element instanceof HTMLMediaElement){element.pause();element.removeAttribute('src');element.load();}map.clear();for(const gain of gains.current.values())gain.disconnect();gains.current.clear();};
  },[project.assets,sourceKey]);
  useEffect(()=>{
    if(busy){for(const element of media.current.values())if(element instanceof HTMLMediaElement)element.pause();return;}
    let frame=0;const draw=()=>{
      const {project:p,time:playhead,playing:play}=state.current,ctx=canvas.current?.getContext('2d');if(!ctx||!canvas.current)return;
      const t=Math.min(playhead,Math.max(0,duration(p)-1/30));
      const width=p.orientation==='portrait'?540:960,height=p.orientation==='portrait'?960:540;
      if(canvas.current.width!==width||canvas.current.height!==height){canvas.current.width=width;canvas.current.height=height;}
      ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);const audible=new Set<string>();
      const sync=(id:string,item:{start:number;duration:number;trimStart:number;volume:number;fadeIn?:number;fadeOut?:number})=>{
        const element=media.current.get(id);if(!(element instanceof HTMLMediaElement))return;
        const active=t>=item.start&&t<item.start+item.duration;
        if(!active)return;audible.add(id);const sourceTime=item.trimStart+(t-item.start);
        if(Math.abs(element.currentTime-sourceTime)>(play?.24:.035)&&!element.seeking)try{element.currentTime=sourceTime;}catch{}
        const elapsed=t-item.start,fade=Math.min(1,item.fadeIn?elapsed/item.fadeIn:1,item.fadeOut?(item.duration-elapsed)/item.fadeOut:1);
        if(play&&!gains.current.has(id))try{const context=audioContext.current??=new AudioContext(),gain=context.createGain();context.createMediaElementSource(element).connect(gain);gain.connect(context.destination);gains.current.set(id,gain);void context.resume().catch(()=>{});}catch{/* Browsers without Web Audio retain normal media playback. */}
        const gain=gains.current.get(id);if(gain){gain.gain.value=Math.max(0,item.volume*fade);element.volume=1;}else element.volume=Math.max(0,Math.min(1,item.volume*fade));if(play&&element.paused)void element.play().catch(()=>{});if(!play&&!element.paused)element.pause();
      };
      const visual=(clip:Clip,layer:boolean)=>{
        if(t<clip.start||t>=clip.start+clip.duration)return;
        const asset=p.assets.find(a=>a.id===clip.assetId),element=media.current.get(clip.id);if(!asset||!element)return;
        if(element instanceof HTMLMediaElement){sync(clip.id,clip);if((element as HTMLVideoElement).readyState<2)return;}else if(!(element as HTMLImageElement).complete)return;
        const source=element as CanvasImageSource;
        try{
          if(!layer&&p.background.type==='color'){ctx.fillStyle=p.background.color;ctx.fillRect(0,0,width,height);}
          if(!layer&&p.background.type==='blur'){const cover=Math.max(width/asset.width,height/asset.height);ctx.save();ctx.filter='blur(16px)';ctx.drawImage(source,(width-asset.width*cover)/2-15,(height-asset.height*cover)/2-15,asset.width*cover+30,asset.height*cover+30);ctx.restore();}
          const scale=Math.min(width/asset.width,height/asset.height)*clip.scale;ctx.save();ctx.translate(clip.x*width,clip.y*height);ctx.rotate(clip.rotation*Math.PI/180);ctx.drawImage(source,-asset.width*scale/2,-asset.height*scale/2,asset.width*scale,asset.height*scale);ctx.restore();
        }catch{/* A just-seeked frame will be available on the next animation tick. */}
      };
      p.clips.forEach(item=>visual(item,false));
      for(const entry of orderedOverlays(p))if(entry.kind==='layers')visual(entry.item as Clip,true);else if('text'in entry.item&&t>=entry.item.start&&t<entry.item.start+entry.item.duration)paintText(ctx,entry.item,width,height,p.orientation==='portrait'?1080:1920);
      p.audio.forEach(item=>sync(item.id,item));
      for(const [id,element] of media.current)if(element instanceof HTMLMediaElement&&!audible.has(id))element.pause();
      frame=requestAnimationFrame(draw);
    };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[busy]);
  useEffect(()=>{if(!playing)for(const element of media.current.values())if(element instanceof HTMLMediaElement)element.pause();},[playing]);
  useEffect(()=>{const change=()=>setNativeFull(document.fullscreenElement===surface.current);document.addEventListener('fullscreenchange',change);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};addEventListener('keydown',key);return()=>{document.removeEventListener('fullscreenchange',change);removeEventListener('keydown',key);};},[]);
  const fullscreen=async()=>{if(document.fullscreenElement){await document.exitFullscreen();return;}if(expanded){setExpanded(false);return;}try{if(!surface.current?.requestFullscreen)throw Error();await surface.current.requestFullscreen();}catch{setExpanded(true);}};
  const empty=!project.clips.length&&!project.layers.length&&!project.texts.length;
  const size=fitCanvas(space.width,space.height,project.orientation==='portrait'?9/16:16/9);
  const selected=selection?project[selection.kind].find(item=>item.id===selection.id):undefined;
  const asset=selected&&'assetId'in selected?project.assets.find(a=>a.id===selected.assetId):undefined;
  const visibleTime=Math.min(time,Math.max(0,duration(project)-1/30));
  const w=project.orientation==='portrait'?540:960,h=project.orientation==='portrait'?960:540;
  const box=selected&&visibleTime>=selected.start&&visibleTime<selected.start+selected.duration?('text'in selected?textBounds(selected,w,h):asset&&'scale'in selected?mediaBounds(selected as Clip,asset,w,h):null):null;
  function doubleClick(){
    if(!selection||!selected||!('x'in selected)||busy)return;
    if('text'in selected){requestAnimationFrame(()=>Array.from(document.querySelectorAll<HTMLTextAreaElement>('.inspector textarea,.mobile-inspector textarea')).find(element=>element.getClientRects().length>0)?.focus());return;}
    if(asset){const fill=fillScale(asset.width/asset.height,w/h);onTransform(selection,{x:.5,y:.5,rotation:0,scale:Math.abs((selected.scale??1)-fill)<.01?1:fill});}
  }
  return <section ref={surface} className={`preview-area ${expanded?'expanded':''}`} aria-label="Canvas preview">
    <div className="preview-heading"><label className="canvas-format"><Smartphone size={14}/><select aria-label="Canvas orientation" disabled={busy} value={project.orientation} onChange={e=>onOrientationChange(e.target.value as Project['orientation'])}><option value="portrait">Portrait · 9:16</option><option value="landscape">Landscape · 16:9</option></select></label>
      <div className="preview-tools">{historyControls}<button className="icon-button" title={focusPreview?'Show editing panels':'Hide editing panels'} aria-label={focusPreview?'Show editing panels':'Hide editing panels'} onClick={onToggleFocus}>{focusPreview?<PanelBottomOpen size={17}/>:<PanelBottomClose size={17}/>}</button><button className="icon-button" title={expanded||nativeFull?'Exit fullscreen':'Fullscreen preview'} aria-label={expanded||nativeFull?'Exit fullscreen':'Fullscreen preview'} onClick={()=>void fullscreen()}>{expanded||nativeFull?<Minimize size={17}/>:<Maximize size={17}/>}</button></div>
    </div>
    <div className="canvas-holder" ref={holder}><div ref={frame} className={`canvas-frame ${project.orientation}`} style={{width:size.width,height:size.height}} onPointerDown={event=>interaction.down(event)} onPointerMove={interaction.move} onPointerUp={event=>interaction.end(event)} onPointerCancel={event=>interaction.end(event,true)} onLostPointerCapture={event=>interaction.end(event,true)} onDoubleClick={doubleClick}>
      <canvas ref={canvas} aria-label="Moment composition"/>
      {empty&&<div className="canvas-empty"><span>Make this moment yours</span><small>Add a photo, clip or text to begin</small></div>}
      {box&&!busy&&<div className="canvas-selection" style={{left:`${box.x/w*100}%`,top:`${box.y/h*100}%`,width:`${box.width/w*100}%`,height:`${box.height/h*100}%`,transform:`translate(-50%,-50%) rotate(${box.rotation}deg)`}}><button className="canvas-scale-handle" aria-label="Resize selected layer" title="Drag to resize" onPointerDown={event=>interaction.down(event as unknown as React.PointerEvent<HTMLDivElement>,'scale')}/><button className="canvas-rotate-handle" aria-label="Rotate selected layer" title="Drag to rotate" onPointerDown={event=>interaction.down(event as unknown as React.PointerEvent<HTMLDivElement>,'rotate')}>↻</button></div>}
      {interaction.guides.x&&<div className="canvas-guide vertical"/>}{interaction.guides.y&&<div className="canvas-guide horizontal"/>}
    </div></div>
    <div className="transport"><button className="icon-button" aria-label="Go to beginning" onClick={()=>setTime(0)}><SkipBack size={17}/></button><button className="play-button" aria-label={playing?'Pause':'Play'} disabled={!duration(project)||busy} onClick={()=>{if(time>=duration(project))setTime(0);setPlaying(!playing);}}>{playing?<Pause size={18}/>:<Play size={18}/>}</button><span>{timecode(time)} <span className="muted">/ {timecode(duration(project))}</span></span><button className="icon-button" aria-label="Go to end" onClick={()=>{setPlaying(false);setTime(duration(project));}}><SkipForward size={17}/></button></div>
  </section>;
}
