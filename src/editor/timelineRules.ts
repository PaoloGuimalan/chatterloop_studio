import {uid,duration,type Project,type Clip,type TextLayer,type AudioTrack} from './model';

// Port of native core/media/timeline.dart. Positions remain seconds in Studio.
export const MIN_PIECE=.5;
export type TimelineKind='clips'|'layers'|'texts'|'audio';
export type Piece=Clip|TextLayer|AudioTrack;
export type Pick={kind:TimelineKind;id:string};
export type Placed={kind:TimelineKind;item:Piece};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const end=(item:Piece)=>item.start+item.duration;
export const laneOf=(item:Piece)=>item.lane??0;
const put=(p:Project,kind:TimelineKind,list:Piece[])=>({...p,[kind]:list} as Project);
const replace=(p:Project,kind:TimelineKind,id:string,patch:Partial<Piece>)=>put(p,kind,p[kind].map(item=>item.id===id?{...item,...patch}:item));
export function orderedOverlays(p:Project):Placed[]{return [...p.layers.map(item=>({kind:'layers' as const,item})),...p.texts.map(item=>({kind:'texts' as const,item}))].sort((a,b)=>laneOf(a.item)-laneOf(b.item)||a.item.start-b.item.start);}
function group(p:Project,kind:TimelineKind):Placed[]{return kind==='clips'?p.clips.map(item=>({kind,item})):kind==='audio'?p.audio.map(item=>({kind,item})):orderedOverlays(p);}
const overlaps=(a:Piece,b:Piece)=>a.start<end(b)-1e-7&&b.start<end(a)-1e-7;
function row(p:Project,kind:TimelineKind,lane:number,except=''){return group(p,kind).filter(x=>x.item.id!==except&&(kind==='clips'||laneOf(x.item)===lane)).sort((a,b)=>a.item.start-b.item.start);}
function clear(p:Project,kind:TimelineKind,lane:number,item:Piece){return row(p,kind,lane,item.id).every(x=>!overlaps(item,x.item));}
export function laneCount(p:Project,kind:'layers'|'audio'){return Math.max(0,...group(p,kind).map(x=>laneOf(x.item)+1));}
function tidy(p:Project):Project {
  for(const kind of ['layers','audio'] as const){
    const entries=group(p,kind),used=[...new Set(entries.map(x=>laneOf(x.item)))].sort((a,b)=>a-b);
    for(const entry of entries)p=replace(p,entry.kind,entry.item.id,{lane:used.indexOf(laneOf(entry.item))});
  }
  return {...p,layers:[...p.layers].sort((a,b)=>laneOf(a)-laneOf(b)||a.start-b.start),texts:[...p.texts].sort((a,b)=>laneOf(a)-laneOf(b)||a.start-b.start),audio:[...p.audio].sort((a,b)=>laneOf(a)-laneOf(b)||a.start-b.start)};
}
export function normalizeProject(p:Project):Project {
  let next={...p,clips:p.clips.map(item=>({...item,lane:0})),layers:[],texts:[],audio:[]} as Project;
  for(const kind of ['layers','texts','audio'] as const)for(const item of p[kind]){
    let lane=item.lane??0;
    while(!clear(next,kind,lane,item))lane++;
    next=put(next,kind,[...next[kind],{...item,lane}]);
  }
  return tidy(next);
}
export function insertionTime(p:Project,time:number){return time>=duration(p)-MIN_PIECE?0:Math.max(0,time);}
export function insertClips(p:Project,added:Clip[],index=p.clips.length):Project {
  const at=clamp(index,0,p.clips.length),start=at?p.clips[at-1].start+p.clips[at-1].duration:0;
  let cursor=start;const list=added.map(item=>{const placed={...item,lane:0,start:cursor};cursor+=item.duration;return placed;});
  return {...p,clips:[...p.clips.slice(0,at),...list,...p.clips.slice(at).map(item=>({...item,start:item.start+cursor-start}))]};
}
export function placeItem(p:Project,kind:Exclude<TimelineKind,'clips'>,item:Piece,at:number):Project {
  const start=Math.max(0,at);let lane=0,room=Infinity;
  for(;;lane++){
    const neighbours=row(p,kind,lane),onTop=neighbours.some(x=>start>=x.item.start&&start<end(x.item));
    const next=neighbours.find(x=>x.item.start>start);room=next?next.item.start-start:Infinity;
    if(!onTop&&room>=MIN_PIECE)break;
  }
  return tidy(put(p,kind,[...p[kind],{...item,start,lane,duration:Math.min(item.duration,room)}]));
}
export function removeItem(p:Project,kind:TimelineKind,id:string):Project {
  const index=p[kind].findIndex(item=>item.id===id);if(index<0)return p;
  const item=p[kind][index];
  return tidy(put(p,kind,p[kind].filter(x=>x.id!==id).map((x,i)=>kind==='clips'&&i>=index?{...x,start:x.start-item.duration}:x)));
}
export function slideItem(p:Project,kind:TimelineKind,id:string,by:number):Project {
  const item=p[kind].find(x=>x.id===id);if(!item||!Number.isFinite(by)||by===0)return p;
  const entries=row(p,kind,laneOf(item)),i=entries.findIndex(x=>x.item.id===id);
  const packed=entries.slice(0,i).reduce((sum,x)=>sum+x.item.duration,0);
  const starts=entries.map(x=>x.item.start);starts[i]+=Math.max(by,Math.min(0,packed-item.start));
  for(let k=i+1;k<entries.length;k++)starts[k]=Math.max(starts[k],starts[k-1]+entries[k-1].item.duration);
  for(let k=i-1;k>=0;k--)starts[k]=Math.min(starts[k],starts[k+1]-entries[k].item.duration);
  for(let k=0;k<entries.length;k++)p=replace(p,entries[k].kind,entries[k].item.id,{start:starts[k]});
  return p;
}
export function resizeItem(p:Project,kind:TimelineKind,id:string,edge:'head'|'tail',by:number):Project {
  const item=p[kind].find(x=>x.id===id);if(!item||!Number.isFinite(by)||by===0)return p;
  const asset='assetId'in item?p.assets.find(a=>a.id===item.assetId):undefined;
  const sourced=asset&&asset.kind!=='image'&&'trimStart'in item,sourceIn='trimStart'in item?item.trimStart:0;
  const others=row(p,kind,laneOf(item),id),before=Math.max(0,...others.filter(x=>x.item.start<item.start).map(x=>end(x.item)));
  const after=others.find(x=>x.item.start>=end(item)-1e-7)?.item.start??Infinity;
  const shift=edge==='head'?clamp(by,Math.max(kind==='clips'?-Infinity:before-item.start,sourced?-sourceIn:-Infinity),item.duration-MIN_PIECE):0;
  const start=kind==='clips'?item.start:item.start+shift,trimStart=sourced?sourceIn+shift:sourceIn;
  const limit=Math.min(sourced?asset.duration-trimStart:Infinity,kind==='clips'?Infinity:after-start);
  const length=clamp(item.duration-shift+(edge==='tail'?by:0),MIN_PIECE,Math.max(MIN_PIECE,limit));
  let next=replace(p,kind,id,{start,duration:length,...('trimStart'in item?{trimStart}:{}),...('fadeIn'in item?{fadeIn:Math.min(item.fadeIn,length/2),fadeOut:Math.min(item.fadeOut,length/2)}:{})});
  if(kind==='clips'){
    const i=p.clips.findIndex(x=>x.id===id),change=length-item.duration;
    next={...next,clips:next.clips.map((x,k)=>k>i?{...x,start:x.start+change}:x)};
  }
  return next;
}
export function splitItem(p:Project,kind:TimelineKind,id:string,time:number):Project {
  const item=p[kind].find(x=>x.id===id);if(!item)return p;const left=time-item.start;
  if(left<MIN_PIECE-1e-7||item.duration-left<MIN_PIECE-1e-7)return p;
  const first={...item,duration:left,...('fadeOut'in item?{fadeOut:0}:{})};
  const second={...item,id:uid(),start:time,duration:item.duration-left,...('trimStart'in item?{trimStart:item.trimStart+left}:{}),...('fadeIn'in item?{fadeIn:0}:{})};
  return put(p,kind,p[kind].flatMap(x=>x.id===id?[first,second]:[x]));
}
export function duplicateTimelineItem(p:Project,kind:TimelineKind,id:string):Project {
  const item=p[kind].find(x=>x.id===id);if(!item)return p;const copy={...item,id:uid()};
  if(kind==='clips')return insertClips(p,[copy as Clip],p.clips.findIndex(x=>x.id===id)+1);
  const following=row(p,kind,laneOf(item)).find(x=>x.item.start>=end(item)-1e-7);
  if((following?.item.start??Infinity)-end(item)>=MIN_PIECE)return tidy(put(p,kind,[...p[kind],{...copy,start:end(item),duration:Math.min(item.duration,(following?.item.start??Infinity)-end(item))}]));
  return placeItem(p,kind,copy,item.start);
}
export function reorderClip(p:Project,id:string,index:number):Project {
  const item=p.clips.find(x=>x.id===id);if(!item||p.clips.indexOf(item)===index)return p;
  return insertClips(removeItem(p,'clips',id),[item],index);
}
export function moveItem(p:Project,kind:TimelineKind,id:string,wanted:number,lane:number):Project {
  const item=p[kind].find(x=>x.id===id);if(!item)return p;
  let from=0,best=Infinity,landing=Math.max(0,wanted);
  const gaps:({from:number;to:number})[]=[];
  for(const x of row(p,kind,lane,id)){if(x.item.start>from)gaps.push({from,to:x.item.start});from=Math.max(from,end(x.item));}
  gaps.push({from,to:Infinity});
  for(const gap of gaps){if(gap.to-gap.from<item.duration)continue;const at=clamp(wanted,gap.from,gap.to-item.duration),distance=Math.abs(at-wanted);if(distance<best){best=distance;landing=at;}}
  return tidy(replace(p,kind,id,{start:landing,lane:Math.max(0,lane)}));
}
export function liftClip(p:Project,id:string,at?:number,lane?:number):Project {
  const item=p.clips.find(x=>x.id===id);if(!item)return p;
  const next=removeItem(p,'clips',id),copy={...item,start:at??item.start};
  if(lane!==undefined)return moveItem({...next,layers:[...next.layers,copy]},'layers',id,copy.start,lane);
  let target=0;while(!clear(next,'layers',target,copy))target++;
  return tidy({...next,layers:[...next.layers,{...copy,lane:target}]});
}
export function dropLayer(p:Project,id:string,slot?:number):Project {
  const item=p.layers.find(x=>x.id===id);if(!item)return p;
  const edges=[...p.clips.map(x=>x.start),p.clips.length?end(p.clips.at(-1)!):0];
  const index=slot??edges.reduce((best,edge,i)=>Math.abs(edge-item.start)<Math.abs(edges[best]-item.start)?i:best,0);
  return tidy(insertClips({...p,layers:p.layers.filter(x=>x.id!==id)},[item],index));
}
export function anchorItem(p:Project,kind:TimelineKind,id:string,toNext:boolean):Project {
  const item=p[kind].find(x=>x.id===id);if(!item)return p;const others=row(p,kind,laneOf(item),id);
  const before=Math.max(0,...others.filter(x=>x.item.start<item.start).map(x=>end(x.item)));
  const after=others.find(x=>x.item.start>=end(item)-1e-7)?.item.start;
  return slideItem(p,kind,id,toNext?(after===undefined?0:after-end(item)):before-item.start);
}
export function restackItem(p:Project,kind:'layers'|'texts',id:string,forward:boolean):Project {
  const item=p[kind].find(x=>x.id===id);if(!item)return p;const current=laneOf(item);
  const neighbours=orderedOverlays(p).filter(x=>x.item.id!==id&&overlaps(x.item,item)&&(forward?laneOf(x.item)>current:laneOf(x.item)<current)).map(x=>laneOf(x.item));
  if(!neighbours.length)return p;const target=forward?Math.min(...neighbours)+1:Math.max(...neighbours),desired=forward?target:target-1;
  if(desired>=0&&desired<laneCount(p,'layers')&&clear(p,kind,desired,item))return tidy(replace(p,kind,id,{lane:desired}));
  for(const entry of orderedOverlays(p))p=replace(p,entry.kind,entry.item.id,{lane:entry.item.id===id?target:laneOf(entry.item)>=target?laneOf(entry.item)+1:laneOf(entry.item)});
  return tidy(p);
}
export function withAutoFades(p:Project):Project {
  return {...p,audio:p.audio.map(track=>{
    if(!track.autoFades)return track;
    const others=p.audio.filter(x=>x.id!==track.id&&laneOf(x)===laneOf(track));
    const before=others.some(x=>Math.abs(end(x)-track.start)<.001),after=others.some(x=>Math.abs(x.start-end(track))<.001);
    return {...track,fadeIn:track.duration>=2&&!before ? .3 : 0,fadeOut:track.duration>=4&&!after ? 1 : 0};
  })};
}
