const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const bytes=(value:string)=>new TextEncoder().encode(value);
export function decodePayload(token:string):Record<string,any> {
  const part=token.split('.')[1];if(!part)throw Error('Invalid session');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')),c=>c.charCodeAt(0))));
}
export async function nonce(userId:string,hash:string):Promise<string>{
  if(!hash)throw Error('Studio is not configured');
  const digest=await crypto.subtle.digest('SHA-256',bytes(hash));
  const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const random=Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('');
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes(`${userId}.${Math.floor(Date.now()/1000)}.${random}`));
  const hex=(value:Uint8Array)=>Array.from(value,n=>n.toString(16).padStart(2,'0')).join('');
  return `${hex(iv)}.${hex(new Uint8Array(data))}`;
}
export async function signBody(value:Record<string,unknown>,hash:string):Promise<string>{
  if(!hash)throw Error('Studio is not configured');
  const header=encode(bytes(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const payload=encode(bytes(JSON.stringify({...value,iat:Math.floor(Date.now()/1000)})));
  const key=await crypto.subtle.importKey('raw',bytes(hash),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,bytes(`${header}.${payload}`));
  return `${header}.${payload}.${encode(new Uint8Array(signature))}`;
}
