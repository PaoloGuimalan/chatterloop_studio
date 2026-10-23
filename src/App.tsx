import {useEffect,useRef,useState} from 'react';
import {Clapperboard,Plus,ArrowLeft,SunMoon,Trash2,Film,MessagesSquare} from 'lucide-react';
import {config,credentials,createClient,AuthenticationError,type Session,type Client} from './platform/client';
import {avatarBlob,listDrafts,loadDraft,removeDraft,saveDraft} from './platform/storage';
import {route,navigate} from './platform/routes';
import {cancelRender} from './engine/render';
import {newProject,type Project} from './editor/model';
import Editor from './editor/Editor';

export function Brand(){return <a className="brand" href="/studio/" onClick={e=>{e.preventDefault();navigate('/studio/');}}><span className="brand-icon"><MessagesSquare size={20}/></span><strong>chatterloop<span>studio</span></strong></a>;}
export function Avatar({session}:{session:Session}){
  const [photo,setPhoto]=useState('');
  useEffect(()=>{let live=true,url='';setPhoto('');void avatarBlob(session.entityId).then(blob=>{if(live&&blob){url=URL.createObjectURL(blob);setPhoto(url);}}).catch(()=>{});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[session.entityId]);
  const words=session.name.trim().split(/\s+/);const initials=(words.length>1?words.slice(0,2).map(word=>word[0]).join(''):session.name.slice(0,2)).toUpperCase();
  return <span className="avatar" title={session.name}>{photo?<img alt={session.name} src={photo}/>:initials}</span>;
}
export default function App(){
  const [path,setPath]=useState(location.pathname),[session,setSession]=useState<Session>(),[client,setClient]=useState<Client>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [dark,setDark]=useState(()=>localStorage.getItem('cl_theme')==='dark'||(!localStorage.getItem('cl_theme')&&matchMedia('(prefers-color-scheme: dark)').matches));
  const [project,setProject]=useState<Project>(),[drafts,setDrafts]=useState<Project[]>([]),[loading,setLoading]=useState(true);
  const [deleteTarget,setDeleteTarget]=useState<Project>(),[deleting,setDeleting]=useState(false);const creating=useRef<Project>();
  const preview=import.meta.env.DEV&&new URLSearchParams(location.search).get('preview')==='1';
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('cl_theme',dark?'dark':'light');},[dark]);
  useEffect(()=>{const onPop=()=>{setPath(location.pathname);setError('');};addEventListener('popstate',onPop);return()=>removeEventListener('popstate',onPop);},[]);
  useEffect(()=>{
    let live=true;setError('');setLoading(true);const initial=credentials();
    if(preview){setSession({accountId:'local-preview',entityId:'preview-entity',token:'',device:'',name:'Preview',handle:'preview',canPublish:false,preview:true});return()=>{live=false;};}
    if(!initial.token||!initial.device){location.replace('/login');return;}
    try{const api=createClient(config(),initial);void api.session().then(value=>{if(live){setClient(api);setSession(value);}}).catch(e=>{if(live){if(e instanceof AuthenticationError)location.replace('/login');else{setError(e.message);setLoading(false);}}});}catch(e){setError((e as Error).message);setLoading(false);}
    const changed=()=>{const next=credentials();if(next.token!==initial.token||next.device!==initial.device){cancelRender();setSession(undefined);setClient(undefined);setProject(undefined);setError('');setLoading(true);navigate('/studio/');setAttempt(value=>value+1);}};
    addEventListener('storage',changed);addEventListener('focus',changed);
    return()=>{live=false;removeEventListener('storage',changed);removeEventListener('focus',changed);};
  },[attempt,preview]);
  useEffect(()=>{
    if(!session)return;let live=true;setLoading(true);setProject(undefined);const current=route(path);
    if(current.kind!=='new')creating.current=undefined;
    const load=async()=>{
      if(current.kind==='home')setDrafts(await listDrafts(session));
      else if(current.kind==='new'){
        const fresh=creating.current??=newProject(session);await saveDraft(fresh);if(live){const destination=`/studio/moments/drafts/${fresh.id}`;history.replaceState({},'',`${destination}${preview?'?preview=1':''}`);setPath(destination);}
      }else if(current.kind==='draft'){const draft=await loadDraft(current.id!,session);if(live)setProject(draft);}
    };
    void load().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
  },[path,session,attempt]);
  const themeButton=<button className="icon-button" aria-label={dark?'Use light theme':'Use dark theme'} title="Change theme" onClick={()=>setDark(!dark)}><SunMoon size={18}/></button>;
  if(session&&project&&!loading)return <Editor key={project.id} initial={project} session={session} client={client} themeButton={themeButton}/>;
  const current=route(path);
  return <div className="landing"><header className="app-header"><Brand/><div className="header-actions">{themeButton}{session&&<Avatar session={session}/>}</div></header>
    <main className="landing-content">{preview&&<p className="preview-badge">Local design preview · publishing disabled</p>}
      {error?<section className="empty-state"><h1>Studio couldn’t open</h1><p role="alert">{error}</p><button className="primary" onClick={()=>setAttempt(attempt+1)}>Try again</button><button onClick={()=>navigate('/studio/')}>Back to Studio</button></section>:loading?<section className="empty-state"><span className="spinner"/><p>Opening your studio…</p></section>:current.kind==='disabled'?<section className="empty-state"><Film size={40}/><h1>Scenes are coming</h1><p>You can create Moments in Studio today.</p><button onClick={()=>navigate('/studio/')}><ArrowLeft size={16}/>Back to Studio</button></section>:current.kind==='missing'?<section className="empty-state"><h1>This project path isn’t available</h1><button onClick={()=>navigate('/studio/')}>Back to Studio</button></section>:<>
        <div className="welcome"><div><p className="eyebrow">YOUR CREATIVE SPACE</p><h1>A little moment. Your whole story.</h1><p>Bring your photos, clips and ideas together.</p></div><Clapperboard size={58}/></div>
        <div className="creation-options"><button className="create-card" onClick={()=>navigate(`/studio/moments/new${preview?'?preview=1':''}`)}><span className="create-symbol"><Plus/></span><strong>Create a Moment</strong><span>Photos, video, text and music</span></button><button className="create-card" disabled><Film/><strong>Create a Scene</strong><span>Coming soon</span></button></div>
        <div className="section-heading"><h2>Your drafts</h2><span>Saved on this device</span></div>
        {!drafts.length?<div className="draft-empty">Your next story starts here. Create a Moment to begin.</div>:<div className="draft-grid">{drafts.map(draft=><article key={draft.id} className="draft-card"><button onClick={()=>navigate(`/studio/moments/drafts/${draft.id}${preview?'?preview=1':''}`)}><Clapperboard size={28}/><strong>{draft.name}</strong><span>{new Date(draft.updatedAt).toLocaleDateString()} · Moment</span></button><button className="icon-button" title={`Delete ${draft.name}`} aria-label={`Delete ${draft.name}`} onClick={()=>setDeleteTarget(draft)}><Trash2 size={15}/></button></article>)}</div>}
      </>}
    </main><footer className="landing-footer">chatterloop studio · Make it yours.</footer>{deleteTarget&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this draft?</h2><p className="help-text">“{deleteTarget.name}” and its imported media will be removed from this device. This cannot be undone.</p><div className="modal-actions"><button autoFocus disabled={deleting} onClick={()=>setDeleteTarget(undefined)}>Cancel</button><button className="primary" disabled={deleting} onClick={()=>{setDeleting(true);void removeDraft(deleteTarget.id,session!).then(()=>{setDrafts(items=>items.filter(d=>d.id!==deleteTarget.id));setDeleteTarget(undefined);}).catch(e=>{setError(e.message);setDeleteTarget(undefined);}).finally(()=>setDeleting(false));}}>Delete draft</button></div></section></div>}</div>;
}
