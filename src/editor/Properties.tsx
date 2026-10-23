import {useEffect,useState} from 'react';
import {AlignLeft,AlignCenter,AlignRight,Bold,Square,Move,Volume2,RotateCw,Maximize,Minimize,RotateCcw} from 'lucide-react';
import type {Project,Asset} from './model';
import {laneOf,type Pick,type Piece} from './timelineRules';
import {fillScale} from './geometry';

function NumberField({label,value,onChange,min=0,max=Number.MAX_SAFE_INTEGER,step=.1}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number}){
  return <label className="field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} onChange={event=>{if(event.target.value!==''&&Number.isFinite(Number(event.target.value)))onChange(Math.min(max,Math.max(min,Number(event.target.value))));}}/></label>;
}
interface Props{project:Project;pick:Pick|null;item:Piece|undefined;asset:Asset|undefined;onPatch:(patch:Record<string,unknown>)=>void;onFrame:(action:'fit'|'fill'|'rotate'|'reset')=>void;onGestureStart:()=>void;onGestureEnd:(cancel?:boolean)=>void;}
export default function Properties({project,pick,item,asset,onPatch,onFrame,onGestureStart,onGestureEnd}:Props){
  const [tab,setTab]=useState<'style'|'timing'>('style');
  useEffect(()=>setTab('style'),[pick?.id]);
  if(!item||!pick)return <><div className="section-heading"><h3>Properties</h3></div><p className="help-text">Select a clip, layer, text or audio track to edit. Drag items and their edges in the timeline.</p></>;
  const text='text'in item?item:undefined,title=text?'Text':asset?.name||'Properties';
  const Alignment=text?.align==='left'?AlignLeft:text?.align==='right'?AlignRight:AlignCenter;
  const maxScale=asset?Math.max(8,fillScale(asset.width/asset.height,project.orientation==='portrait'?9/16:16/9)*4):10;
  const rangeGesture={onPointerDown:onGestureStart,onPointerUp:()=>onGestureEnd(),onPointerCancel:()=>onGestureEnd(true)};
  return <><div className="section-heading"><h3 title={title}>{title}</h3><span>{pick.kind==='clips'?'Main clip':pick.kind==='audio'?'Audio':'Layer '+(laneOf(item)+1)}</span></div>
    <div className="inspector-tabs" role="tablist" aria-label="Layer properties"><button role="tab" aria-selected={tab==='style'} onClick={()=>setTab('style')}>Style</button><button role="tab" aria-selected={tab==='timing'} onClick={()=>setTab('timing')}>Timing</button></div>
    <div role="tabpanel" aria-label={tab==='style'?'Layer style':'Layer timing'}>
      {tab==='timing'?<><div className="field-grid"><NumberField label="Start (s)" value={item.start} onChange={start=>onPatch({start})}/><NumberField label="Duration (s)" value={item.duration} min={.5} max={asset&&asset.kind!=='image'&&'trimStart'in item?Math.max(.5,asset.duration-item.trimStart):Number.MAX_SAFE_INTEGER} onChange={duration=>onPatch({duration})}/>
        {'trimStart'in item&&asset?.kind!=='image'&&<><NumberField label="Source in (s)" value={item.trimStart} max={Math.max(0,(asset?.duration||0)-.5)} onChange={trimStart=>onPatch({trimStart})}/><NumberField label="Source out (s)" value={item.trimStart+item.duration} min={item.trimStart+.5} max={asset?.duration||item.duration} onChange={out=>onPatch({duration:out-item.trimStart})}/></>}
        {pick.kind!=='clips'&&<NumberField label={pick.kind==='audio'?'Audio lane':'Layer lane'} min={1} step={1} value={laneOf(item)+1} onChange={lane=>onPatch({lane:Math.round(lane)-1})}/>}</div><p className="help-text">Main trims carry following clips along. Layers and audio stay within their own lane.</p></>:<>
        {text&&<><label className="field"><span>Your words</span><textarea aria-label="Your text" value={text.text} maxLength={1000} rows={3} onChange={e=>onPatch({text:e.target.value})}/></label>
          <label className="field"><span>Typeface</span><select aria-label="Text typeface" value={text.font||'Inter'} onChange={e=>onPatch({font:e.target.value})}><option>Inter</option><option>Georgia</option><option value="monospace">Monospace</option></select></label>
          <div className="text-tools"><button aria-pressed={text.bold} onClick={()=>onPatch({bold:!text.bold})}><Bold size={17}/><span>Bold</span></button><button onClick={()=>onPatch({align:text.align==='left'?'center':text.align==='center'?'right':'left'})}><Alignment size={17}/><span>{text.align}</span></button><button aria-pressed={text.boxed} onClick={()=>onPatch({boxed:!text.boxed})}><Square size={16}/><span>Box</span></button></div>
          <div className="field"><span className="color-label">Color<input type="color" aria-label="Custom text color" value={text.color} onChange={e=>onPatch({color:e.target.value})}/></span><div className="swatches">{['#ffffff','#14161a','#1c7def','#ffe4ab','#ff97a1'].map(color=><button key={color} className={text.color===color?'chosen':''} style={{background:color}} aria-label={`Text color ${color}`} aria-pressed={text.color===color} onClick={()=>onPatch({color})}/>)}</div></div>
          <label className="field"><span className="range-label">Size <span>{text.size}</span></span><input aria-label="Text size" type="range" min={8} max={240} step={1} value={text.size} {...rangeGesture} onChange={e=>onPatch({size:Number(e.target.value)})}/></label>
        </>}
        {'volume'in item&&asset?.kind!=='image'&&<><h4><Volume2 size={14}/>Audio</h4><label className="field"><span>Volume · {Math.round(item.volume*100)}%</span><input aria-label="Volume" type="range" min={0} max={2} step={.01} value={item.volume} {...rangeGesture} onChange={e=>onPatch({volume:Number(e.target.value)})}/></label></>}
        {'fadeIn'in item&&<div className="field-grid"><NumberField label="Fade in (s)" value={item.fadeIn} max={item.duration/2} onChange={fadeIn=>onPatch({fadeIn})}/><NumberField label="Fade out (s)" value={item.fadeOut} max={item.duration/2} onChange={fadeOut=>onPatch({fadeOut})}/></div>}
      </>}
      {'x'in item&&<><h4><Move size={14}/>Framing</h4><div className="frame-tools"><button title="Fit whole media" onClick={()=>onFrame('fit')}><Minimize size={15}/>Fit</button>{!text&&<button title="Fill canvas" onClick={()=>onFrame('fill')}><Maximize size={15}/>Fill</button>}<button title="Rotate 90 degrees" onClick={()=>onFrame('rotate')}><RotateCw size={15}/>Rotate</button><button title="Reset framing" onClick={()=>onFrame('reset')}><RotateCcw size={15}/>Reset</button></div>
        <div className="field-grid"><NumberField label="Zoom" min={.02} max={maxScale} value={item.scale??1} onChange={scale=>onPatch({scale})}/><NumberField label="Rotation (°)" min={-36000} max={36000} step={1} value={item.rotation??0} onChange={rotation=>onPatch({rotation})}/><NumberField label="Position X (%)" value={item.x*100} max={100} step={1} onChange={x=>onPatch({x:x/100})}/><NumberField label="Position Y (%)" value={item.y*100} max={100} step={1} onChange={y=>onPatch({y:y/100})}/></div><p className="help-text">Drag on the preview to move. Use two fingers to zoom and rotate, or the selection handles.</p>
      </>}
    </div>
  </>;
}
