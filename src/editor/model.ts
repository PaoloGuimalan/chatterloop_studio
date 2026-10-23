export interface Owner {accountId:string;entityId:string}
export interface Asset {id:string;name:string;kind:'image'|'video'|'audio';file:Blob;duration:number;width:number;height:number;hasAudio:boolean}
export interface Clip {id:string;assetId:string;start:number;duration:number;trimStart:number;volume:number;scale:number;rotation:number;x:number;y:number}
export interface TextLayer {id:string;text:string;start:number;duration:number;x:number;y:number;size:number;color:string;bold:boolean;boxed:boolean;align:'left'|'center'|'right';font?:'Inter'|'Georgia'|'monospace'}
export interface AudioTrack {id:string;assetId:string;start:number;duration:number;trimStart:number;volume:number;fadeIn:number;fadeOut:number}
export interface Project {version:1;id:string;owner:Owner;contentType:'moment';name:string;orientation:'portrait'|'landscape';background:{type:'color'|'blur';color:string};assets:Asset[];clips:Clip[];layers:Clip[];texts:TextLayer[];audio:AudioTrack[];updatedAt:number}
export const uid=()=>crypto.randomUUID();
export function newProject(owner:Owner):Project{return{version:1,id:uid(),owner:{accountId:owner.accountId,entityId:owner.entityId},contentType:'moment',name:'Untitled moment',orientation:'portrait',background:{type:'blur',color:'#111827'},assets:[],clips:[],layers:[],texts:[],audio:[],updatedAt:Date.now()};}
export function playbackSources(project:Project){return [...project.clips,...project.layers,...project.audio].map(item=>({id:item.id,assetId:item.assetId}));}
export function duplicateItem(project:Project,kind:'clips'|'layers'|'texts'|'audio',id:string):Project {
  const item=project[kind].find(value=>value.id===id);if(!item)return project;
  if(kind==='clips'){
    const end=item.start+item.duration;
    return {...project,clips:project.clips.flatMap(clip=>clip.id===id?[clip,{...clip,id:uid(),start:end}]:[{...clip,start:clip.start>=end?clip.start+item.duration:clip.start}])};
  }
  return {...project,[kind]:[...project[kind],{...item,id:uid(),start:item.start+item.duration}]};
}
export function assertOwner(project:Project,owner:Owner){if(project.version!==1||project.contentType!=='moment'||project.owner.accountId!==owner.accountId||project.owner.entityId!==owner.entityId)throw Error('This draft belongs to another account or is not supported.');}
export function duration(project:Project){return Math.max(0,...[...project.clips,...project.layers,...project.texts,...project.audio].map(item=>item.start+item.duration));}
export function splitClip(project:Project,id:string,time:number):Project {
  const clip=project.clips.find(c=>c.id===id);if(!clip||time<=clip.start+.05||time>=clip.start+clip.duration-.05)return project;
  const left=time-clip.start;return{...project,clips:project.clips.flatMap(c=>c.id===id?[{...c,duration:left},{...c,id:uid(),start:time,trimStart:c.trimStart+left,duration:c.duration-left}]:[c])};
}
export function clipFor(asset:Asset,start:number):Clip{return{id:uid(),assetId:asset.id,start,duration:asset.kind==='image'?6:Math.min(asset.duration,120),trimStart:0,volume:1,scale:1,rotation:0,x:.5,y:.5};}
export function validateProject(project:Project){
  assertOwner(project,project.owner);
  if(!duration(project)||!Number.isFinite(duration(project)))throw Error('Add media, text, or audio before exporting.');
  for(const item of [...project.clips,...project.layers,...project.audio,...project.texts]){
    if(!Number.isFinite(item.start)||item.start<0||!Number.isFinite(item.duration)||item.duration<=0)throw Error('Check the timeline timing.');
    if('assetId'in item){const asset=project.assets.find(a=>a.id===item.assetId);if(!asset||!(asset.file instanceof Blob))throw Error('A media file is missing.');if(!Number.isFinite(item.trimStart)||item.trimStart<0||(asset.kind!=='image'&&item.trimStart+item.duration>asset.duration+.1))throw Error('A clip extends beyond its source media.');if(!Number.isFinite(item.volume)||item.volume<0||item.volume>2)throw Error('Check the clip volume.');}
    if('scale'in item&&(!Number.isFinite(item.scale)||item.scale<.1||item.scale>4||![item.x,item.y,item.rotation].every(Number.isFinite)))throw Error('Check the clip transform.');
    if('text'in item&&(![item.x,item.y,item.size].every(Number.isFinite)||item.size<8||item.size>240))throw Error('Check the text size and position.');
    if('fadeIn'in item&&(![item.fadeIn,item.fadeOut].every(Number.isFinite)||item.fadeIn<0||item.fadeOut<0))throw Error('Check the audio fades.');
  }
}
