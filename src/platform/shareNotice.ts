const key='chatterloop:studio:moment-shared';
type Destination='studio'|'webapp';
export function rememberMomentShared(entityId:string,destination:Destination,now=Date.now()){
  try{sessionStorage.setItem(key,JSON.stringify({version:1,entityId,destination,createdAt:now}));}catch{/* The success dialog still confirms publication when storage is blocked. */}
}
export function consumeMomentShared(entityId:string,destination:Destination,now=Date.now()):string|null{
  try{const raw=sessionStorage.getItem(key);if(!raw)return null;sessionStorage.removeItem(key);const notice=JSON.parse(raw);
    return notice.version===1&&notice.entityId===entityId&&notice.destination===destination&&Number.isFinite(notice.createdAt)&&now>=notice.createdAt&&now-notice.createdAt<=300000?'Your Moment is live for 24 hours.':null;
  }catch{return null;}
}
