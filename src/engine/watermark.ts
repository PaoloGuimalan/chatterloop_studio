// Reuses native assets/images/watermark.png and its wordmark rectangle
// [151,15,615,92] in the 630x144 asset. Size/placement match Watermark.chatterloop.
export async function watermarkImage(handle:string,width:number,height:number):Promise<Blob>{
  const logo=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('The Chatterloop export signature could not load.'));image.src='/studio/watermark.png';});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
  const side=Math.min(width,height),logoWidth=side*.22,scale=logoWidth/630,fontSize=side*.022,margin=15*scale;
  const text=handle?`@${handle.replace(/^@/,'')}`:'',logoHeight=144*scale,textTop=92*scale-.2*fontSize;
  const blockHeight=Math.max(logoHeight,text?textTop+fontSize*1.3+margin:logoHeight),left=side*.05,top=height-side*.12-blockHeight;
  ctx.drawImage(logo,left,top,logoWidth,logoHeight);
  if(text){ctx.font=`700 ${fontSize}px Inter, Arial, sans-serif`;ctx.textBaseline='top';ctx.fillStyle='#ffffffbf';ctx.shadowColor='#00000086';ctx.shadowBlur=12*scale;ctx.shadowOffsetY=3*scale;ctx.fillText(text,left+151*scale,top+textTop);}
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('The export signature could not be rendered.')),'image/png'));
}
