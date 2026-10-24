export function videoMetadata(json:string,exitCode:number):{hasAudio:boolean;fps:number} {
  // core 0.12.10 emits valid ffprobe output while leaving ret at its reset value (-1).
  // Require a real video stream; an unset return value alone never means success.
  if(exitCode!==0&&exitCode!==-1)throw Error('Cannot inspect this video. Try another MP4.');
  let result;try{result=JSON.parse(json);}catch{throw Error('The video metadata could not be read.');}
  if(!Array.isArray(result.streams)||!result.streams.some((s:{codec_type:string})=>s.codec_type==='video'))throw Error('No readable video stream was found.');
  const rate=(value:unknown)=>{if(typeof value!=='string')return 0;const parts=value.split('/'),fps=Number(parts[0])/(parts.length>1?Number(parts[1]):1);return Number.isFinite(fps)&&fps>0&&fps<=1000?fps:0;};
  const videos=result.streams.filter((stream:{codec_type:string})=>stream.codec_type==='video');
  return{hasAudio:result.streams.some((stream:{codec_type:string})=>stream.codec_type==='audio'),fps:Math.max(...videos.map((stream:{avg_frame_rate?:string;r_frame_rate?:string})=>Math.max(rate(stream.avg_frame_rate),rate(stream.r_frame_rate))))||30};
}
export function videoHasAudio(json:string,exitCode:number):boolean{return videoMetadata(json,exitCode).hasAudio;}
