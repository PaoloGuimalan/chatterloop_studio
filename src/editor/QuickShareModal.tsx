import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Clapperboard,ImagePlus,X,Upload,Loader2} from 'lucide-react';
import {Avatar} from '../App';
import type {Client,Session} from '../platform/client';
import {AuthenticationError} from '../platform/client';
import {publishMoment} from '../platform/publish';
import {failureMessage} from '../platform/errors';
import {importAsset,posterFromVideo} from '../engine/media';
import {probeMedia,cancelRender} from '../engine/render';
import {MomentRender} from '../engine/share';
import {quickProject} from './quickProject';
import type {Project,MomentForm} from './model';
import './quick-share.css';
import ShareSuccess from './ShareSuccess';

export default function QuickShareModal({session,client,onClose,onEdit,onShared,toStudio=false}:{session:Session;client?:Client;onClose:()=>void;onEdit:(project:Project)=>void;onShared:()=>void;toStudio?:boolean}){
  const [project,setProject]=useState<Project>(),[mediaUrl,setMediaUrl]=useState(''),[thumbnail,setThumbnail]=useState('');
  const [form,setForm]=useState<MomentForm>({caption:'',privacy:'connections',allowReplies:true});
  const [busy,setBusy]=useState(false),[opening,setOpening]=useState(false),[error,setError]=useState(''),[label,setLabel]=useState(''),[progress,setProgress]=useState(0),[drag,setDrag]=useState(false);
  const [shared,setShared]=useState(false);
  const input=useRef<HTMLInputElement>(null),panel=useRef<HTMLElement>(null),job=useRef(new MomentRender()),controller=useRef<AbortController>(),run=useRef(0),locked=useRef(false);
  useEffect(()=>()=>{run.current++;controller.current?.abort();cancelRender();job.current.clear();},[]);
  useEffect(()=>{const before=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!locked.current&&!shared){event.preventDefault();onClose();}if(event.key!=='Tab')return;const controls=[...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')??[]].filter(node=>node.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(before?.isConnected)before.focus();};
  },[onClose,shared]);
  useEffect(()=>{if(!project)return;const url=URL.createObjectURL(project.assets[0].file);setMediaUrl(url);return()=>URL.revokeObjectURL(url);},[project]);
  useEffect(()=>{if(!project||project.assets[0].kind!=='video'){setThumbnail('');return;}const asset=project.assets[0],abort=new AbortController();let url='';
    void posterFromVideo(asset.file,Math.max(1,Math.round(asset.width*Math.min(1,720/asset.height))),Math.min(720,asset.height),abort.signal).then(blob=>{if(!abort.signal.aborted){url=URL.createObjectURL(blob);setThumbnail(url);}}).catch(()=>{});
    return()=>{abort.abort();if(url)URL.revokeObjectURL(url);setThumbnail('');};
  },[project]);
  async function choose(files:FileList|null){
    if(!files?.length||locked.current)return;if(files.length!==1){setError('Choose one photo or video, or combine media in Studio Editor.');return;}
    locked.current=true;setOpening(true);setProject(undefined);job.current.clear();setError('');setLabel('Opening your media…');const id=++run.current;
    try{let asset=await importAsset(files[0]);if(id!==run.current)return;quickProject(session,asset);
      if(asset.kind==='video')asset={...asset,...await probeMedia(asset,import.meta.env.BASE_URL,setLabel)};
      if(id!==run.current)return;job.current.clear();setProject(quickProject(session,asset));
    }catch(e){if(id===run.current)setError(failureMessage(e,'The media could not be opened.'));}finally{if(id===run.current){locked.current=false;setOpening(false);if(input.current)input.current.value='';}}
  }
  function cancel(){run.current++;controller.current?.abort();cancelRender();locked.current=false;setBusy(false);setOpening(false);setLabel('Cancelled');}
  async function share(){
    if(!project||locked.current)return;locked.current=true;setBusy(true);setError('');setProgress(0);controller.current=new AbortController();const id=++run.current,signal=controller.current.signal;
    try{const output=await job.current.prepare(project,{edge:1080,handle:session.handle,base:import.meta.env.BASE_URL,signal,onProgress:(p,text)=>{if(id===run.current){setProgress(p*.7);setLabel(text);}}});
      signal.throwIfAborted();if(!client||session.preview)throw Error('Publishing is disabled in local preview.');setLabel('Uploading your Moment…');
      await publishMoment(client,session,project,output,form,signal,p=>{if(id===run.current)setProgress(.7+p*.3);});if(id===run.current&&!signal.aborted)setShared(true);
    }catch(e){if(id===run.current&&!signal.aborted){if(e instanceof AuthenticationError)location.replace('/login');else setError(failureMessage(e,'Your Moment could not be shared. Please retry.'));}}finally{if(id===run.current){locked.current=false;setBusy(false);}}
  }
  if(shared)return <ShareSuccess onContinue={onShared} toStudio={toStudio}/>;
  return <div className="modal-backdrop"><section ref={panel} className="modal quick-share" role="dialog" aria-modal="true" aria-labelledby="quick-title">
    <div className="quick-preview" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDrag(true);}}} onDragLeave={()=>setDrag(false)} onDrop={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();setDrag(false);void choose(e.dataTransfer.files);}} data-drag={drag}>
      <div className="quick-identity"><Avatar session={session}/><strong>Your Moment</strong></div>
      {project&&mediaUrl?(project.assets[0].kind==='image'?<img src={mediaUrl} alt="Your selected Moment"/>:<video src={mediaUrl} poster={thumbnail||undefined} playsInline preload="metadata"/>):<div className="quick-placeholder"><Upload size={30}/><p>Drop a photo or video here</p><span>Videos up to 2 minutes</span></div>}
      <button className="quick-choose" disabled={busy||opening} onClick={()=>input.current?.click()}><ImagePlus size={17}/> {project?'Choose another file':'Choose media'}</button>
    </div>
    <div className="quick-details"><div className="section-heading"><h2 id="quick-title">Create Moment</h2><button className="icon-button" aria-label="Close Create Moment" disabled={busy||opening} onClick={onClose}><X size={19}/></button></div>
      <input hidden type="file" ref={input} accept="image/*,video/*" onChange={e=>void choose(e.target.files)}/>
      <label className="field"><span>Caption · {[...form.caption].length}/120</span><textarea rows={3} placeholder="Say something about it…" disabled={busy||opening} value={form.caption} onChange={e=>setForm({...form,caption:[...e.target.value].slice(0,120).join('')})}/></label>
      <label className="field"><span>Who can see this?</span><select disabled={busy||opening} value={form.privacy} onChange={e=>setForm({...form,privacy:e.target.value as MomentForm['privacy']})}><option value="public">Public · Anyone on Chatterloop</option><option value="connections">Contacts · People in your contacts</option></select></label>
      <label className="check-field"><input type="checkbox" disabled={busy||opening} checked={form.allowReplies} onChange={e=>setForm({...form,allowReplies:e.target.checked})}/>Allow replies &amp; reactions</label>
      <button className="quick-edit" disabled={!project||busy||opening} onClick={()=>project&&onEdit({...project,publishForm:form})}><Clapperboard size={17}/><span>Edit in Studio<small>Add text, layers, music and finishing touches</small></span></button>
      {error&&<p className="error-message" role="alert">{error}</p>}{(busy||opening)&&<div className="progress-status" role="status">{busy?<progress max={1} value={progress}/>:<Loader2 size={16} className="spin"/>}<span>{label}{busy?` · ${Math.round(progress*100)}%`:''}</span></div>}
      <div className="quick-footer"><small>Disappears from the feed after 24 hours</small><div className="modal-actions">{busy||opening?<button onClick={cancel}>Cancel</button>:<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!project||!client||session.preview} onClick={()=>void share()}><ArrowUpRight size={16}/>{error?'Retry sharing':'Share Moment'}</button></>}</div></div>
    </div>
  </section></div>;
}
