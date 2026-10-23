export function route(path:string):{kind:'home'|'new'|'draft'|'disabled'|'missing';id?:string}{
  if(path==='/studio'||path==='/studio/')return{kind:'home'};
  if(path==='/studio/moments/new')return{kind:'new'};
  if(/^\/studio\/scenes(?:\/|$)/.test(path))return{kind:'disabled'};
  const match=path.match(/^\/studio\/moments\/drafts\/([a-zA-Z0-9-]+)$/);
  return match?{kind:'draft',id:match[1]}:{kind:'missing'};
}
export const navigate=(path:string)=>{if(!path.includes('?')&&new URLSearchParams(location.search).get('preview')==='1')path+='?preview=1';history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));};
