import type {ReactNode} from 'react';
import {ArrowUpRight,Check,ChevronDown,Download} from 'lucide-react';
import {Avatar,Brand} from '../App';
import type {Session} from '../platform/client';

interface Props {
  name:string;
  saved:string;
  session:Session;
  themeButton:ReactNode;
  disabled:boolean;
  onRename:(name:string)=>void;
  onExport:()=>void;
  onShare:()=>void;
}

export default function EditorHeader({name,saved,session,themeButton,disabled,onRename,onExport,onShare}:Props){
  return <header className="app-header editor-header">
    <Brand/>
    <div className="project-summary">
      <div className="project-title">
        <label className="project-name">
          <span aria-hidden="true">{name||'Untitled moment'}</span>
          <input aria-label="Project name" value={name} maxLength={80} onChange={event=>onRename(event.target.value)}/>
        </label>
        <details className="content-select">
          <summary><span>Moment</span><ChevronDown size={12}/></summary>
          <div><button disabled>Scene <small>Coming soon</small></button></div>
        </details>
      </div>
      <span className="save-status" role="status"><Check size={12}/>{saved==='All changes saved'?'Moment draft saved on this device':saved}{session.preview&&<span className="preview-label"> · Preview</span>}</span>
    </div>
    <div className="header-actions">
      {themeButton}
      <button title="Export video" aria-label="Export video" className="export-button" disabled={disabled} onClick={onExport}><Download size={17}/><span>Export</span></button>
      <button className="primary share-button" title={session.preview?'Preview sharing options (publishing disabled)':'Share Moment'} disabled={disabled} onClick={onShare}><ArrowUpRight size={17}/><span>Share</span></button>
      <Avatar session={session}/>
    </div>
  </header>;
}
