import {assertOwner,type Project,type Owner} from '../editor/model';
let opened:Promise<IDBDatabase>|undefined;
function database(){return opened??=new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open('chatterloop_studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'id'});
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Draft storage is busy. Close another Studio tab and retry.'));
  req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();opened=undefined;};resolve(req.result);};
}).catch(error=>{opened=undefined;throw error;});}
async function transaction<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest):Promise<T>{
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode);const request=operation(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft save interrupted.'));});
}
export async function saveDraft(project:Project){await transaction('readwrite',store=>store.put({...project,owner:{accountId:project.owner.accountId,entityId:project.owner.entityId}}));}
export async function loadDraft(id:string,owner:Owner){const p=await transaction<Project|undefined>('readonly',store=>store.get(id));if(!p)throw Error('This draft is unavailable on this device.');assertOwner(p,owner);return p;}
export async function listDrafts(owner:Owner){return(await transaction<Project[]>('readonly',store=>store.getAll())).filter(p=>p.version===1&&p.owner.accountId===owner.accountId&&p.owner.entityId===owner.entityId&&p.contentType==='moment').sort((a,b)=>b.updatedAt-a.updatedAt);}
export async function removeDraft(id:string,owner:Owner){await loadDraft(id,owner);await transaction('readwrite',store=>store.delete(id));}
export async function avatarBlob(entityId:string):Promise<Blob|null>{
  return new Promise(resolve=>{
    let done=false;const finish=(value:Blob|null)=>{if(!done){done=true;clearTimeout(timer);resolve(value);}};
    const timer=setTimeout(()=>finish(null),3000);const request=indexedDB.open('chatterloop_shared_media',1);
    // Studio is read-only: abort creation if webapp has never cached a photo.
    request.onupgradeneeded=()=>{request.transaction?.abort();finish(null);};request.onerror=()=>finish(null);request.onblocked=()=>finish(null);
    request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('entity_profiles')){db.close();finish(null);return;}
      const tx=db.transaction('entity_profiles','readonly');const read=tx.objectStore('entity_profiles').get(entityId);
      read.onsuccess=()=>{const b=read.result?.blob;finish(b instanceof Blob&&b.size>0&&b.type.startsWith('image/')?b:null);};read.onerror=()=>finish(null);tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();finish(null);};
    };
  });
}
