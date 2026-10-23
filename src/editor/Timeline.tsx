import {useState} from 'react';
import {Copy,Film,Layers,Minus,Music,Plus,Scissors,Trash2,Type} from 'lucide-react';
import {duration,type Project} from './model';
import {timecode} from './Preview';
import Waveform from './Waveform';

export type Selection={kind:'clips'|'layers'|'texts'|'audio';id:string}|null;
interface Props {
  project:Project;time:number;selection:Selection;urls:Record<string,string>;busy:boolean;
  onSelect:(selection:Selection,time:number)=>void;onSeek:(time:number)=>void;
  onSplit:()=>void;onDuplicate:()=>void;onDelete:()=>void;
}
export default function Timeline({project,time,selection,urls,busy,onSelect,onSeek,onSplit,onDuplicate,onDelete}:Props){
  const [zoom,setZoom]=useState(1),total=duration(project),span=Math.max(total,6)/Math.min(zoom,1);
  const tracks=[{key:'texts',label:'Text',Icon:Type},{key:'clips',label:'Clips',Icon:Film},...(project.layers.length?[{key:'layers',label:'Layers',Icon:Layers}]:[]),{key:'audio',label:'Audio',Icon:Music}] as const;
  const seek=(value:number)=>onSeek(Math.max(0,Math.min(total,value)));
  return <section className="timeline" aria-label="Timeline">
    <div className="timeline-toolbar"><strong>Timeline</strong>
      <button disabled={busy||selection?.kind!=='clips'} onClick={onSplit}><Scissors size={14}/><span>Split</span></button>
      <button disabled={busy||!selection} onClick={onDuplicate}><Copy size={14}/><span>Duplicate</span></button>
      <button disabled={busy||!selection} onClick={onDelete}><Trash2 size={14}/><span>Delete</span></button>
      <div className="timeline-zoom"><button className="icon-button" aria-label="Zoom timeline out" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,value-.25))}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom timeline in" disabled={zoom>=3} onClick={()=>setZoom(value=>Math.min(3,value+.25))}><Plus size={14}/></button></div>
    </div>
    <div className="timeline-scroll"><div className="timeline-inner" style={{width:`${Math.max(1,zoom)*100}%`,minWidth:400}}>
      <div className="timeline-ruler"><div className="ruler-scale">{Array.from({length:7},(_,index)=><span key={index} style={{left:`${index/6*100}%`}}>{timecode(index/6*span).replace(/\.\d$/,'')}</span>)}<input aria-label="Playhead" aria-valuetext={timecode(time)} type="range" min={0} max={span} step={.05} value={time} onChange={event=>seek(Number(event.target.value))}/></div></div>
      {tracks.map(({key,label,Icon})=><div className={`track-row track-${key}`} key={key}>
        <span className="track-label"><Icon size={13}/>{label}</span>
        <div className="track-lane" onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();seek((event.clientX-box.left)/box.width*span);}}}>
          {project[key as 'texts'|'clips'|'layers'|'audio'].map(item=>{
            const asset='assetId'in item?project.assets.find(a=>a.id===item.assetId):undefined;
            const title='text'in item?item.text:asset?.name||'Media';
            return <button key={item.id} style={{left:`${item.start/span*100}%`,width:`${item.duration/span*100}%`}} className={`track-item ${selection?.id===item.id?'selected':''}`} title={title} onClick={()=>onSelect({kind:key as NonNullable<Selection>['kind'],id:item.id},item.start)}>
              {asset?.kind==='image'?<img className="track-thumb" src={urls[asset.id]} alt=""/>:asset?.kind==='video'?<video className="track-thumb" src={urls[asset.id]} muted preload="metadata"/>:asset?.kind==='audio'?<Music size={14}/>:null}
              <span>{title.replace(/\.(mp4|mov|webm|png|jpe?g|wav|mp3|m4a)$/i,'')}</span>
              {'fadeIn'in item&&<Waveform asset={asset} track={item}/>}
            </button>;
          })}
        </div>
      </div>)}
      <div className="playhead" style={{left:`calc(60px + (100% - 60px) * ${time/span})`}}/>
    </div></div>
  </section>;
}
