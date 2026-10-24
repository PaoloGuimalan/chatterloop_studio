import {useEffect,useRef} from 'react';
import {CheckCircle2} from 'lucide-react';

export default function ShareSuccess({onContinue,toStudio}:{onContinue:()=>void;toStudio:boolean}){
  const next=useRef(onContinue),continued=useRef(false),button=useRef<HTMLButtonElement>(null);next.current=onContinue;
  function finish(){if(!continued.current){continued.current=true;next.current();}}
  useEffect(()=>{button.current?.focus();const timer=setTimeout(finish,1200);return()=>clearTimeout(timer);},[]);
  return <div className="modal-backdrop"><section className="modal share-complete" role="dialog" aria-modal="true" aria-labelledby="shared-title" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();button.current?.focus();}else if(e.key==='Escape')finish();}}><CheckCircle2 size={40} aria-hidden="true"/><h2 id="shared-title">Moment shared</h2><p className="help-text" role="status">Your Moment is live for 24 hours.</p><p className="help-text">Returning to {toStudio?'Studio':'Chatterloop Home'}…</p><button ref={button} className="primary" onClick={finish}>Continue</button></section></div>;
}
