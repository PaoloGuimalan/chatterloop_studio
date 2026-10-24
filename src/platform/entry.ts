export interface EntryContext {origin:'studio'|'webapp';autosave:boolean;backTo:string}
export function safeReturnTo(value:string|null){
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return '/';
  try{const path=decodeURIComponent(value.split(/[?#]/)[0]);if(path.startsWith('//')||path.includes('\\')||/^\/(studio|login|register)(?:\/|$)/i.test(path))return '/';}catch{return '/';}
  return value;
}
export function entryContext(search:string):EntryContext{const query=new URLSearchParams(search);return query.get('from')==='webapp'?{origin:'webapp',autosave:false,backTo:safeReturnTo(query.get('returnTo'))}:{origin:'studio',autosave:true,backTo:'/studio/'};}
export const shareDestination=(entry:EntryContext)=>entry.origin==='webapp'?'/':'/studio/';
export const entryQuery=(entry:EntryContext)=>entry.origin==='webapp'?`from=webapp&returnTo=${encodeURIComponent(entry.backTo)}`:'';
export const shouldWarnBeforeUnload=(state:{leaving:boolean;unsaved:boolean;busy:boolean;importing:boolean})=>!state.leaving&&(state.unsaved||state.busy||state.importing);
