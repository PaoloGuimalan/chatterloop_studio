export function route(path:string):{kind:'home'|'new'|'edit'|'draft'|'disabled'|'missing';id?:string}{
  path=path.split(/[?#]/)[0];
  if(path==='/studio'||path==='/studio/')return{kind:'home'};
  if(path==='/studio/moments/new')return{kind:'new'};
  if(path==='/studio/moments/edit')return{kind:'edit'};
  if(/^\/studio\/scenes(?:\/|$)/.test(path))return{kind:'disabled'};
  const match=path.match(/^\/studio\/moments\/drafts\/([a-zA-Z0-9-]+)$/);
  return match?{kind:'draft',id:match[1]}:{kind:'missing'};
}
export const navigate=(path:string)=>{if(new URLSearchParams(location.search).get('preview')==='1'&&!new URLSearchParams(path.split('?')[1]).has('preview'))path+=`${path.includes('?')?'&':'?'}preview=1`;history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));};
export const leaveStudio=(path:string)=>{if(path==='/studio/'||path.startsWith('/studio/'))navigate(path);else location.replace(path);};
