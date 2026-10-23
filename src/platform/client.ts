import {decodePayload,nonce,signBody} from './protocol';
export interface Session {accountId:string;entityId:string;name:string;handle:string;canPublish:boolean;token:string;device:string;preview?:boolean}
export interface Config {hash:string;apiBase:string}
export class AuthenticationError extends Error {}
export function credentials(){return{token:localStorage.getItem('authtoken')||'',device:localStorage.getItem('device')||''};}
export function config():Config {
  const node=document.getElementById('studio-runtime');
  if(!node?.textContent)throw Error('Studio is temporarily unavailable.');
  const parsed=JSON.parse(node.textContent);if(!parsed.hash||!parsed.apiBase)throw Error('Studio is temporarily unavailable.');
  return parsed;
}
export function createClient(settings:Config,identity:{token:string;device:string}){
  async function request(path:string,method='GET',body?:unknown,signal?:AbortSignal){
    if(!identity.token||!identity.device)throw new AuthenticationError('Please sign in again.');
    const snapshot=credentials();
    if(snapshot.token!==identity.token||snapshot.device!==identity.device)throw new AuthenticationError('Your acting account changed.');
    let claims;try{claims=decodePayload(identity.token);}catch{throw new AuthenticationError('Please sign in again.');}
    const timer=AbortSignal.timeout(30000);
    const response=await fetch(`${settings.apiBase}${path}`,{method,mode:'cors',credentials:'omit',headers:{'x-access-token':identity.token,'Device-Token':identity.device,'X-Nonce':await nonce(String(claims.userID),settings.hash),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal?AbortSignal.any([signal,timer]):timer});
    const result=await response.json().catch(()=>null);
    if(response.status===401||(response.ok&&path==='/auth/jwtchecker'&&result?.status===false)||(!response.ok&&result?.message?.includes('Device'))||result?.message==='jwt expired'||result?.message==='invalid signature')throw new AuthenticationError('Please sign in again.');
    if(!response.ok||result?.status===false)throw Error(result?.message||result?.error||'Request failed. Please try again.');
    return result;
  }
  async function session():Promise<Session>{
    const response=await request('/auth/jwtchecker');const current=response.result?.active_entity;
    if(!current?.id)throw Error('The current account could not be resolved.');
    const user=decodePayload(response.result.usertoken),claims=decodePayload(identity.token);
    return{accountId:String(claims.userID),entityId:current.id,name:current.name||user.fullname?.firstName||user.userID||'Your account',handle:current.slug||user.userID||'',canPublish:true,...identity};
  }
  return{request,session,sign:(value:Record<string,unknown>)=>signBody(value,settings.hash)};
}
export type Client=ReturnType<typeof createClient>;
