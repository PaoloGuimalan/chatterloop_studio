import {useEffect,useRef,useState,type RefObject,type PointerEvent} from 'react';
import type {Project} from './model';
import {duration} from './model';
import {fillScale,gestureTransform,hitTest,type Point,type Transform} from './geometry';
import type {Pick} from './timelineRules';

interface Options {
  project:Project;time:number;selection:Pick|null;busy:boolean;frame:RefObject<HTMLDivElement>;
  onSelect:(pick:Pick|null)=>void;onTransform:(pick:Pick,transform:Transform)=>void;
  onGestureStart:()=>void;onGestureEnd:(cancel?:boolean)=>void;
}
type Gesture={pick:Pick;base:Transform;last:Transform;from:Point;distance:number;angle:number;mode:'move'|'scale'|'rotate';width:number;height:number;maxScale:number};
const focal=(points:Point[])=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a:Point,b:Point)=>Math.atan2(b.y-a.y,b.x-a.x);
export default function useCanvasInteraction(options:Options){
  const live=useRef(options);live.current=options;
  const points=useRef(new Map<number,Point>()),gesture=useRef<Gesture>(),wheelTimer=useRef<ReturnType<typeof setTimeout>>();
  const [guides,setGuides]=useState({x:false,y:false});
  function point(event:{clientX:number;clientY:number}){const rect=live.current.frame.current!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function reset(pick:Pick,mode:Gesture['mode'],base?:Transform){
    const {project,frame}=live.current,item=project[pick.kind].find(x=>x.id===pick.id);if(!item||!('x'in item)||!frame.current)return;
    const rect=frame.current.getBoundingClientRect(),list=[...points.current.values()],center=focal(list),transform=base??{x:item.x,y:item.y,scale:item.scale??1,rotation:item.rotation??0};
    const asset='assetId'in item?project.assets.find(x=>x.id===item.assetId):undefined,fill=asset?fillScale(asset.width/asset.height,rect.width/rect.height):1;
    const origin={x:transform.x*rect.width,y:transform.y*rect.height};
    gesture.current={pick,base:transform,last:transform,from:mode==='move'?center:origin,distance:list.length>1?distance(list[0],list[1]):distance(origin,center),angle:list.length>1?angle(list[0],list[1]):angle(origin,center),mode,width:rect.width,height:rect.height,maxScale:Math.max(8,fill*4)};
  }
  function down(event:PointerEvent<HTMLDivElement>,mode:Gesture['mode']='move'){
    const {busy,frame,project,time,selection,onSelect,onGestureStart}=live.current;if(busy||event.button!==0||!frame.current)return;
    event.preventDefault();event.stopPropagation();clearTimeout(wheelTimer.current);
    const p=point(event);points.current.set(event.pointerId,p);
    if(gesture.current){reset(gesture.current.pick,'move',gesture.current.last);}
    else{
      const effectiveTime=Math.min(time,Math.max(0,duration(project)-1/30)),hit=hitTest(project,effectiveTime,p.x/frame.current.clientWidth,p.y/frame.current.clientHeight);
      const selected=selection?project[selection.kind].find(x=>x.id===selection.id):undefined;
      const active=selected&&'x'in selected&&effectiveTime>=selected.start&&effectiveTime<selected.start+selected.duration;
      const pick=mode!=='move'?selection:active&&selection?.kind!=='clips'&&(!hit||hit.kind==='clips')?selection:hit;
      if(!pick){points.current.clear();onSelect(null);return;}
      onSelect(pick);onGestureStart();reset(pick,mode);
    }
    frame.current.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||!points.current.has(event.pointerId))return;event.preventDefault();points.current.set(event.pointerId,point(event));
    const list=[...points.current.values()],center=focal(list),origin={x:g.base.x*g.width,y:g.base.y*g.height};
    const zoom=list.length>1?distance(list[0],list[1])/Math.max(1,g.distance):g.mode==='scale'?distance(origin,center)/Math.max(1,g.distance):1;
    const turn=list.length>1?angle(list[0],list[1])-g.angle:g.mode==='rotate'?angle(origin,center)-g.angle:0;
    const transform=gestureTransform(g.base,g.from,g.mode==='move'?center:origin,zoom,turn,g.width,g.height,g.maxScale);
    g.last=transform;setGuides({x:transform.x===.5,y:transform.y===.5});live.current.onTransform(g.pick,transform);
  }
  function end(event:PointerEvent<HTMLDivElement>,cancel=false){
    const g=gesture.current;if(!g||!points.current.has(event.pointerId))return;
    points.current.delete(event.pointerId);
    if(cancel){gesture.current=undefined;points.current.clear();setGuides({x:false,y:false});live.current.onGestureEnd(true);}
    else if(points.current.size)reset(g.pick,'move',g.last);
    else{gesture.current=undefined;setGuides({x:false,y:false});live.current.onGestureEnd();}
    const frame=live.current.frame.current;if(frame?.hasPointerCapture(event.pointerId))frame.releasePointerCapture(event.pointerId);
  }
  useEffect(()=>{
    const element=options.frame.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{
      const {selection,busy,project,onGestureStart,onGestureEnd,onTransform}=live.current;if(!selection||busy)return;
      const item=project[selection.kind].find(x=>x.id===selection.id);if(!item||!('x'in item))return;event.preventDefault();
      if(!gesture.current)onGestureStart();
      const position=point(event),base={x:item.x,y:item.y,scale:item.scale??1,rotation:item.rotation??0};
      const transform=gestureTransform(base,position,position,event.altKey?1:Math.exp(-event.deltaY*.002),event.altKey?-event.deltaY*.003:0,element.clientWidth,element.clientHeight,64,false);
      onTransform(selection,transform);clearTimeout(wheelTimer.current);wheelTimer.current=setTimeout(()=>onGestureEnd(),200);
    };
    element.addEventListener('wheel',wheel,{passive:false});return()=>{element.removeEventListener('wheel',wheel);clearTimeout(wheelTimer.current);};
  },[options.frame]);
  return{down,move,end,guides};
}
