export function alphaBounds(data:Uint8Array|Uint8ClampedArray,width:number,height:number){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=y;}
  if(right<0)return{x:0,y:0,width:Math.min(2,width),height:Math.min(2,height)};
  // FFmpeg's 4:2:0 overlay coordinates align to two-pixel chroma blocks.
  const x=Math.floor(left/2)*2,y=Math.floor(top/2)*2;
  return{x,y,width:Math.min(width,Math.ceil((right+1)/2)*2)-x,height:Math.min(height,Math.ceil((bottom+1)/2)*2)-y};
}
export async function compactOverlay(blob:Blob,width:number,height:number){
  if(typeof createImageBitmap==='undefined')return{blob,x:0,y:0};
  const image=await createImageBitmap(blob);
  try{
    const source=document.createElement('canvas');source.width=width;source.height=height;
    const ctx=source.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
    const box=alphaBounds(ctx.getImageData(0,0,width,height).data,width,height);
    if(box.width===width&&box.height===height)return{blob,x:0,y:0};
    const tile=document.createElement('canvas');tile.width=box.width;tile.height=box.height;
    tile.getContext('2d')!.drawImage(source,box.x,box.y,box.width,box.height,0,0,box.width,box.height);
    const cropped=await new Promise<Blob>((resolve,reject)=>tile.toBlob(value=>value?resolve(value):reject(Error('The export overlay could not be prepared.')),'image/png'));
    return{blob:cropped,x:box.x,y:box.y};
  }finally{image.close();}
}
