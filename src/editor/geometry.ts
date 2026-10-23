import type {Project,Clip,TextLayer} from './model';
import {orderedOverlays,type Pick} from './timelineRules';
export type Point={x:number;y:number};
export type Transform=Point&{scale:number;rotation:number};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
export function fitCanvas(width:number,height:number,aspect:number){const w=Math.max(0,Math.min(width,height*aspect));return {width:w,height:w/aspect};}
export function fillScale(mediaAspect:number,canvasAspect:number){const ratio=mediaAspect/canvasAspect;return Math.max(ratio,1/ratio);}
export function defaultScale(asset:{width:number;height:number},orientation:Project['orientation']){const scale=fillScale(asset.width/asset.height,orientation==='portrait'?9/16:16/9);return scale<=1.3?scale:1;}
export function gestureTransform(base:Transform,from:Point,to:Point,zoom:number,turn:number,width:number,height:number,maxScale=10,snap=true):Transform {
  const scale=clamp(base.scale*zoom,Math.min(.2,base.scale*.2),maxScale),ratio=scale/base.scale;
  const vx=base.x*width-from.x,vy=base.y*height-from.y,c=Math.cos(turn),s=Math.sin(turn);
  let x=clamp((to.x+(vx*c-vy*s)*ratio)/width,0,1),y=clamp((to.y+(vx*s+vy*c)*ratio)/height,0,1),rotation=base.rotation+turn*180/Math.PI;
  if(snap){if(Math.abs(x-.5)*width<8)x=.5;if(Math.abs(y-.5)*height<8)y=.5;const quarter=Math.round(rotation/90)*90;if(Math.abs(rotation-quarter)<=4)rotation=quarter;}
  return{x,y,scale,rotation};
}
export function mediaBounds(item:Clip,asset:{width:number;height:number},width:number,height:number){const fit=Math.min(width/asset.width,height/asset.height)*item.scale;return{width:asset.width*fit,height:asset.height*fit,x:item.x*width,y:item.y*height,rotation:item.rotation};}
export function textBounds(item:TextLayer,width:number,height:number){const size=item.size*width/(width<height?1080:1920)*(item.scale??1),lines=item.text.split('\n'),w=Math.max(size,...lines.map(x=>x.length*size*.65))+size*.5,h=lines.length*size*1.25+size*.3,rotation=item.rotation??0,offset=item.align==='left'?w/2:item.align==='right'?-w/2:0;return{width:w,height:h,x:item.x*width+offset*Math.cos(rotation*Math.PI/180),y:item.y*height+offset*Math.sin(rotation*Math.PI/180),rotation};}
export function hitTest(p:Project,time:number,x:number,y:number):Pick|null {
  const width=p.orientation==='portrait'?540:960,height=p.orientation==='portrait'?960:540;
  const choices=[...p.clips.map(item=>({kind:'clips' as const,item})),...orderedOverlays(p)];
  for(const {kind,item} of choices.reverse()){
    if(time<item.start||time>=item.start+item.duration)continue;
    const asset='assetId'in item?p.assets.find(a=>a.id===item.assetId):undefined;
    const box='text'in item?textBounds(item,width,height):asset?mediaBounds(item as Clip,asset,width,height):null;if(!box)continue;
    const angle=-box.rotation*Math.PI/180,dx=x*width-box.x,dy=y*height-box.y;
    if(Math.abs(dx*Math.cos(angle)-dy*Math.sin(angle))<=box.width/2&&Math.abs(dx*Math.sin(angle)+dy*Math.cos(angle))<=box.height/2)return{kind,id:item.id};
  }
  return null;
}
// Same inverse-corner crop used by native visiblePart: avoid scaling giant
// off-canvas images merely to discard their pixels after an overlay.
export function visibleMediaRect(mw:number,mh:number,cw:number,ch:number,t:Transform){
  const factor=Math.min(cw/mw,ch/mh)*t.scale,angle=t.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const points=[[0,0],[cw,0],[0,ch],[cw,ch]].map(([x,y])=>{const dx=x-t.x*cw,dy=y-t.y*ch;return{x:(dx*c+dy*s)/factor+mw/2,y:(-dx*s+dy*c)/factor+mh/2};});
  const left=clamp(Math.floor(Math.min(...points.map(p=>p.x))+1e-6),0,mw),top=clamp(Math.floor(Math.min(...points.map(p=>p.y))+1e-6),0,mh);
  const right=clamp(Math.ceil(Math.max(...points.map(p=>p.x))-1e-6),0,mw),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p.y))-1e-6),0,mh);
  const width=Math.max(1,right-left),height=Math.max(1,bottom-top),ox=((left+right)/2-mw/2)*factor,oy=((top+bottom)/2-mh/2)*factor;
  return{left,top,width,height,drawWidth:width*factor,drawHeight:height*factor,x:t.x*cw+ox*c-oy*s,y:t.y*ch+ox*s+oy*c};
}
