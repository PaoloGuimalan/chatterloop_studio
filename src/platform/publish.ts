import type {Client,Session} from './client';
import type {Project} from '../editor/model';
import {momentSource,hasSound} from '../editor/model';
async function upload(client:Client,blob:Blob,name:string,purpose:string,signal:AbortSignal,onProgress:(progress:number)=>void){
  const created=await client.request('/media/uploads','POST',{purpose,files:[{name,size:blob.size,type:blob.type}]},signal);
  const plan=created.uploads?.[0];if(!plan?.uploadID)throw Error('Upload could not be prepared.');
  try{
    if(plan.mode==='single'){
      const response=await fetch(plan.url,{method:plan.method||'PUT',headers:plan.headers,body:blob,signal});if(!response.ok)throw Error('The storage upload failed.');onProgress(1);
    }else{
      const partSize=Number(plan.partSize);if(!partSize||!Array.isArray(plan.parts))throw Error('Unsupported upload plan.');
      for(let index=0;index<plan.parts.length;index++){
        const part=plan.parts[index];const response=await fetch(part.url,{method:part.method||'PUT',headers:part.headers,body:blob.slice(index*partSize,Math.min(blob.size,(index+1)*partSize)),signal});if(!response.ok)throw Error('A storage upload part failed. Please retry.');onProgress((index+1)/plan.parts.length);
      }
    }
    const completed=await client.request('/media/uploads/complete','POST',{uploads:[{uploadID:plan.uploadID}]},signal);
    if(!completed.results?.[0]?.ok)throw Error(completed.results?.[0]?.message||'Upload could not be confirmed.');
    return{url:plan.fileUrl,uploadID:plan.uploadID};
  }catch(error){void client.request(`/media/uploads/${encodeURIComponent(plan.uploadID)}`,'DELETE').catch(()=>{});throw error;}
}
export async function publishMoment(client:Client,session:Session,project:Project,output:{video:Blob;poster:Blob;width:number;height:number},form:{caption:string;privacy:'public'|'connections';allowReplies:boolean},signal:AbortSignal,onProgress:(progress:number)=>void){
  if(session.preview)throw Error('Publishing is unavailable in local preview.');
  if(project.owner.accountId!==session.accountId||project.owner.entityId!==session.entityId)throw Error('This draft belongs to a different acting account.');
  if([...form.caption].length>120)throw Error('Keep the caption within 120 characters.');
  const video=await upload(client,output.video,'moment.mp4','moment',signal,p=>onProgress(p*.85));
  const poster=await upload(client,output.poster,'poster.jpg','moment_poster',signal,p=>onProgress(.85+p*.14));
  const payload={content:{reference:{reference:video.url,referenceMediaType:'video/mp4',name:'moment.mp4'},data:form.caption},privacy:{status:form.privacy},allowReplies:form.allowReplies,tagging:{isTagged:false,users:[]},poster:{url:poster.url,w:output.width,h:output.height},source:momentSource(project),hasAudio:hasSound(project)};
  return client.request('/posts/moments/create','POST',{token:await client.sign(payload)},signal);
}
