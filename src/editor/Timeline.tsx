import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Copy,Film,Layers,Minus,Music,Plus,Scissors,Trash2,Type,VolumeX} from 'lucide-react';
import {duration,type Project} from './model';
import {laneCount,laneOf,orderedOverlays,slideItem,resizeItem,moveItem,liftClip,dropLayer,reorderClip,type Pick,type TimelineKind} from './timelineRules';
import {timecode} from './Preview';
import Waveform from './Waveform';
import {timelineOverflow} from './overflow';

export type Selection=Pick|null;
export type TimelineAction='split'|'duplicate'|'delete'|'lift'|'main'|'forward'|'backward'|'previous'|'next'|'earlier'|'later'|'mute';
interface Props {
  project:Project;time:number;selection:Selection;urls:Record<string,string>;busy:boolean;
  onSelect:(selection:Selection,time:number)=>void;onSeek:(time:number)=>void;
  onAction:(action:TimelineAction)=>void;onAdd:(kind:TimelineKind)=>void;
  onEdit:(project:Project)=>void;onGestureStart:()=>void;onGestureEnd:(cancel?:boolean)=>void;
  onResize:(height:number)=>void;
}
type Drag={before:Project;pick:Pick;edge?:'head'|'tail';x:number;y:number;scroll:number;pps:number;started:number;moved:boolean;reorder:boolean;result:Project;next:Pick};
export default function Timeline({project,time,selection,urls,busy,onSelect,onSeek,onAction,onAdd,onEdit,onGestureStart,onGestureEnd,onResize}:Props){
  const [zoom,setZoom]=useState(1),[viewport,setViewport]=useState(600),[dragging,setDragging]=useState(false);
  const scroll=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null),drag=useRef<Drag>(),suppressClick=useRef(false);
  const [overflow,setOverflow]=useState({left:false,right:false,up:false,down:false,above:0,below:0});
  function measureOverflow(){
    const element=scroll.current;if(!element)return;const box=element.getBoundingClientRect();
    const rows=Array.from(element.querySelectorAll<HTMLElement>('.track-row')).map(row=>{const rect=row.getBoundingClientRect();return{top:rect.top,bottom:rect.bottom,occupied:row.dataset.occupied==='true'};});
    const items=Array.from(element.querySelectorAll<HTMLElement>('.track-item')).map(item=>{const rect=item.getBoundingClientRect();return{left:rect.left,right:rect.right};});
    const next=timelineOverflow({left:box.left+72,right:box.right,top:box.top+24,bottom:box.bottom},rows,items);
    if(element.scrollLeft<=1)next.left=false;if(element.scrollTop<=1){next.up=false;next.above=0;}
    setOverflow(previous=>(Object.keys(next) as (keyof typeof next)[]).every(key=>next[key]===previous[key])?previous:next);
  }
  function scrollPage(horizontal:number,vertical:number){const element=scroll.current;if(element)element.scrollBy({left:horizontal*Math.max(100,element.clientWidth*.7),top:vertical*Math.max(50,element.clientHeight*.75),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  useEffect(()=>{const element=scroll.current;if(!element)return;let frame=0;const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measureOverflow);};const observer=new ResizeObserver(update);observer.observe(element);if(element.firstElementChild)observer.observe(element.firstElementChild);element.addEventListener('scroll',update,{passive:true});update();return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('scroll',update);};},[]);
  const pps=48*zoom,total=duration(project),span=Math.max(6,total+2,(viewport-72)/pps),width=72+span*pps;
  const selected=selection?project[selection.kind].find(x=>x.id===selection.id):undefined;
  const selectedHasAudio=selected&&'volume'in selected&&(!('assetId'in selected)||project.assets.find(asset=>asset.id===selected.assetId)?.kind!=='image');
  useLayoutEffect(measureOverflow,[project,pps]);
  useEffect(()=>{const element=scroll.current;if(!element)return;const observer=new ResizeObserver(()=>setViewport(element.clientWidth));observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{const element=scroll.current;if(!element||dragging)return;const x=72+time*pps;if(x<element.scrollLeft+72)element.scrollLeft=Math.max(0,x-90);else if(x>element.scrollLeft+element.clientWidth-20)element.scrollLeft=x-element.clientWidth+40;},[time,pps,dragging]);
  function start(event:PointerEvent<HTMLDivElement>,pick:Pick,edge?:'head'|'tail'){
    if(busy||event.button!==0)return;event.stopPropagation();event.preventDefault();
    const item=project[pick.kind].find(x=>x.id===pick.id)!;
    onSelect(pick,time>=item.start&&time<item.start+item.duration?time:item.start);onGestureStart();
    drag.current={before:project,pick,edge,x:event.clientX,y:event.clientY,scroll:scroll.current?.scrollLeft||0,pps,started:performance.now(),moved:false,reorder:event.shiftKey,result:project,next:pick};
    panel.current?.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d)return;const dx=event.clientX-d.x+(scroll.current?.scrollLeft||0)-d.scroll;
    if(!d.moved&&Math.hypot(event.clientX-d.x,event.clientY-d.y)<4)return;
    if(!d.moved){d.reorder=d.reorder||performance.now()-d.started>450;d.moved=true;setDragging(true);}
    const item=d.before[d.pick.kind].find(x=>x.id===d.pick.id)!;let next:Project;
    if(d.edge)next=resizeItem(d.before,d.pick.kind,d.pick.id,d.edge,dx/d.pps);
    else{
      const hit=document.elementsFromPoint(event.clientX,event.clientY).map(x=>x.closest<HTMLElement>('[data-track-kind]')).find(Boolean);
      const target=hit?.dataset.trackKind as TimelineKind|undefined,lane=Number(hit?.dataset.lane??laneOf(item));
      if(d.pick.kind==='clips'&&target==='layers'){next=liftClip(d.before,d.pick.id,item.start+dx/d.pps,lane);d.next={kind:'layers',id:d.pick.id};}
      else if(d.pick.kind==='layers'&&target==='clips'){const center=item.start+dx/d.pps+item.duration/2,slot=d.before.clips.filter(c=>c.start+c.duration/2<center).length;next=dropLayer(d.before,d.pick.id,slot);d.next={kind:'clips',id:d.pick.id};}
      else if(d.pick.kind==='clips'&&d.reorder){const center=item.start+dx/d.pps+item.duration/2,slot=d.before.clips.filter(c=>c.id!==item.id&&c.start+c.duration/2<center).length;next=reorderClip(d.before,item.id,slot);d.next=d.pick;}
      else if(d.pick.kind!=='clips'&&target===(d.pick.kind==='audio'?'audio':'layers')&&lane!==laneOf(item)){next=moveItem(d.before,d.pick.kind,item.id,item.start+dx/d.pps,lane);d.next=d.pick;}
      else{next=slideItem(d.before,d.pick.kind,item.id,dx/d.pps);d.next=d.pick;}
    }
    d.result=next;onEdit(next);
    const element=scroll.current;if(element){const rect=element.getBoundingClientRect();if(event.clientX>rect.right-35)element.scrollLeft+=14;else if(event.clientX<rect.left+85)element.scrollLeft-=14;if(event.clientY>rect.bottom-25)element.scrollTop+=12;else if(event.clientY<rect.top+30)element.scrollTop-=12;}
  }
  function finish(event:PointerEvent<HTMLDivElement>,cancel=false){
    const d=drag.current;if(!d)return;drag.current=undefined;setDragging(false);suppressClick.current=d.moved;
    if(panel.current?.hasPointerCapture(event.pointerId))panel.current.releasePointerCapture(event.pointerId);
    onGestureEnd(cancel);if(!cancel&&d.moved){const item=d.result[d.next.kind].find(x=>x.id===d.next.id);if(item)onSelect(d.next,Math.min(time,item.start+item.duration));}
  }
  const overlays=orderedOverlays(project),count=laneCount(project,'layers'),audioCount=laneCount(project,'audio');
  const tracks=[...Array.from({length:count+1},(_,i)=>({kind:'layers' as const,lane:count-i,label:i===0?'+ Layer':`Layer ${count-i+1}`,items:overlays.filter(x=>laneOf(x.item)===count-i),Icon:Layers})),
    {kind:'clips' as const,lane:0,label:'Clips',items:project.clips.map(item=>({kind:'clips' as const,item})),Icon:Film},
    ...Array.from({length:audioCount+1},(_,lane)=>({kind:'audio' as const,lane,label:lane===audioCount?'+ Audio':`Audio ${lane+1}`,items:project.audio.filter(x=>laneOf(x)===lane).map(item=>({kind:'audio' as const,item})),Icon:Music}))];
  const step=pps>=96?1:pps>=32?5:15;
  return <section className={`timeline ${dragging?'dragging':''}`} aria-label="Timeline" ref={panel} onPointerMove={move} onPointerUp={event=>finish(event as unknown as PointerEvent<HTMLDivElement>)} onPointerCancel={event=>finish(event as unknown as PointerEvent<HTMLDivElement>,true)} onLostPointerCapture={event=>{if(drag.current)finish(event as unknown as PointerEvent<HTMLDivElement>,true);}}>
    <div className="timeline-resizer" role="separator" aria-label="Resize timeline" aria-orientation="horizontal" tabIndex={0} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();onResize((panel.current?.clientHeight||240)+(event.key==='ArrowUp'?25:-25));}}} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))onResize((panel.current?.getBoundingClientRect().bottom||0)-event.clientY);}} onPointerUp={event=>event.currentTarget.releasePointerCapture(event.pointerId)}/>
    <div className="timeline-top"><strong>Timeline</strong><div className="timeline-add">
      <button disabled={busy} onClick={()=>onAdd('clips')}><Plus size={13}/><Film size={14}/>Media</button>
      <button disabled={busy} onClick={()=>onAdd('layers')}><Plus size={13}/><Layers size={14}/>Layer</button>
      <button disabled={busy} onClick={()=>onAdd('texts')}><Plus size={13}/><Type size={14}/>Text</button>
      <button disabled={busy} onClick={()=>onAdd('audio')}><Plus size={13}/><Music size={14}/>Audio</button>
    </div><div className="timeline-zoom"><button className="icon-button" aria-label="Zoom timeline out" disabled={zoom<=.25} onClick={()=>setZoom(value=>Math.max(.25,value/1.5))}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom timeline in" disabled={zoom>=8} onClick={()=>setZoom(value=>Math.min(8,value*1.5))}><Plus size={14}/></button></div></div>
    <div className="timeline-toolbar" aria-label="Selection tools">
      {([{action:'split',label:'Split',Icon:Scissors},{action:'duplicate',label:'Duplicate',Icon:Copy},...(selection?.kind==='clips'?[{action:'lift',label:'To layer',Icon:Layers},{action:'earlier',label:'Move earlier',Icon:ArrowLeft},{action:'later',label:'Move later',Icon:ArrowRight}]:[]),...(selection?.kind==='layers'?[{action:'main',label:'To main',Icon:Film}]:[]),...(selection&&(selection.kind==='layers'||selection.kind==='texts')?[{action:'forward',label:'Forward',Icon:ArrowUp},{action:'backward',label:'Backward',Icon:ArrowDown}]:[]),{action:'previous',label:'Anchor previous',Icon:ArrowLeft},{action:'next',label:'Anchor next',Icon:ArrowRight},...(selectedHasAudio&&selected&&'volume'in selected?[{action:'mute',label:selected.volume?'Mute':'Unmute',Icon:VolumeX}]:[]),{action:'delete',label:'Delete',Icon:Trash2}] as {action:TimelineAction;label:string;Icon:typeof Plus}[]).map(({action,label,Icon})=><button key={action} disabled={busy||!selection} onClick={()=>onAction(action)}><Icon size={14}/><span>{label}</span></button>)}
      {selection&&<button onClick={()=>onSelect(null,time)}>Done</button>}
    </div>
    <div className="timeline-viewport">
    <div className="timeline-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Timeline tracks"><div className="timeline-inner" style={{width,minWidth:'100%'}}>
      <div className="timeline-ruler"><div className="ruler-scale">{Array.from({length:Math.floor(span/step)+1},(_,index)=><span key={index} style={{left:index*step*pps}}>{timecode(index*step).replace(/\.\d$/,'')}</span>)}<input aria-label="Playhead" aria-valuetext={timecode(time)} type="range" min={0} max={span} step={.01} value={time} onChange={event=>onSeek(Math.min(total,Number(event.target.value)))}/></div></div>
      {tracks.map(({kind,lane,label,items,Icon})=><div className={`track-row track-${kind} ${!items.length?'empty-lane':''}`} data-occupied={items.length>0} key={`${kind}-${lane}`}>
        <button className="track-label" title={!items.length?`Add ${kind==='audio'?'audio':kind==='clips'?'media':'a layer'}`:label} disabled={busy} onClick={()=>onAdd(kind)}><Icon size={13}/><span>{label}</span></button>
        <div className="track-lane" data-track-kind={kind} data-lane={lane} onClick={event=>{if(suppressClick.current){suppressClick.current=false;return;}if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();onSelect(null,Math.min(total,Math.max(0,(event.clientX-box.left)/pps)));}}}>
          {items.map(({kind:itemKind,item})=>{
            const asset='assetId'in item?project.assets.find(a=>a.id===item.assetId):undefined,title='text'in item?item.text:asset?.name||'Media';
            return <div role="button" tabIndex={busy?-1:0} aria-label={`${itemKind==='texts'?'Text':kind==='clips'?'Clip':kind==='audio'?'Audio':'Layer'}: ${title}`} aria-pressed={selection?.id===item.id} key={item.id} style={{left:item.start*pps,width:Math.max(8,item.duration*pps)}} className={`track-item ${itemKind==='texts'?'text-item':''} ${selection?.id===item.id?'selected':''}`} title={`${title}\nDrag to slide. Hold then drag to reorder or change lanes. Drag either edge to trim.`}
              onPointerDown={event=>start(event,{kind:itemKind,id:item.id})}
              onKeyDown={event=>{if(busy)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect({kind:itemKind,id:item.id},item.start);}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();onEdit(slideItem(project,itemKind,item.id,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:.1)));}else if(event.key==='Delete'){onSelect({kind:itemKind,id:item.id},time);if(selection?.id===item.id)onAction('delete');}}}>
              {asset?.kind==='image'?<img className="track-thumb" src={urls[asset.id]} alt="" draggable={false}/>:asset?.kind==='video'?<video className="track-thumb" src={urls[asset.id]} muted preload="metadata"/>:asset?.kind==='audio'?<Music size={14}/>:<Type size={14}/>}
              <span>{title.replace(/\.(mp4|mov|webm|png|jpe?g|wav|mp3|m4a)$/i,'')}</span>
              {'fadeIn'in item&&<Waveform asset={asset} track={item}/>}
              {selection?.id===item.id&&(['head','tail'] as const).map(edge=><div key={edge} className={`trim-handle ${edge}`} role="slider" tabIndex={0} aria-label={`Trim ${edge==='head'?'start':'end'} of ${title}`} aria-valuemin={0} aria-valuemax={Math.max(total,item.start+item.duration)} aria-valuenow={edge==='head'?item.start:item.start+item.duration} onPointerDown={event=>start(event,{kind:itemKind,id:item.id},edge)} onKeyDown={event=>{if(busy)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.stopPropagation();event.preventDefault();onEdit(resizeItem(project,itemKind,item.id,edge,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:.1)));}}}><i/></div>)}
            </div>;
          })}
        </div>
      </div>)}
      <div className="playhead" style={{left:72+time*pps}}/>
    </div></div>
    {(['left','right','up','down'] as const).map(edge=>overflow[edge]&&<div key={edge} className={`timeline-edge timeline-edge-${edge}`} aria-hidden="true"/>)}
    {overflow.left&&<button className="timeline-page timeline-page-left" aria-label="Scroll timeline left" onClick={()=>scrollPage(-1,0)}><ChevronLeft size={13}/></button>}
    {overflow.right&&<button className="timeline-page timeline-page-right" aria-label="Scroll timeline right" onClick={()=>scrollPage(1,0)}><ChevronRight size={13}/></button>}
    </div>
    <div className="timeline-help"><span className="timeline-help-text">Drag to slide · Drag edges to trim · Hold or Shift-drag to reorder · Drag between rows to move layers</span>
      {overflow.up&&<button className="timeline-more" aria-label={`Scroll up${overflow.above?`, ${overflow.above} more ${overflow.above===1?'track':'tracks'} above`:''}`} onClick={()=>scrollPage(0,-1)}><ChevronUp size={11}/>{overflow.above>0&&<span>{overflow.above} {overflow.above===1?'track':'tracks'}</span>}</button>}
      {overflow.down&&<button className="timeline-more" aria-label={`Scroll down${overflow.below?`, ${overflow.below} more ${overflow.below===1?'track':'tracks'} below`:''}`} onClick={()=>scrollPage(0,1)}>{overflow.below>0&&<span>{overflow.below} {overflow.below===1?'track':'tracks'}</span>}<ChevronDown size={11}/></button>}
    </div>
  </section>;
}
