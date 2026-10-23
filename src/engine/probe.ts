export function videoHasAudio(json:string,exitCode:number):boolean {
  // core 0.12.10 emits valid ffprobe output while leaving ret at its reset value (-1).
  // Require a real video stream; an unset return value alone never means success.
  if(exitCode!==0&&exitCode!==-1)throw Error('Cannot inspect this video. Try another MP4.');
  let result;try{result=JSON.parse(json);}catch{throw Error('The video metadata could not be read.');}
  if(!Array.isArray(result.streams)||!result.streams.some((s:{codec_type:string})=>s.codec_type==='video'))throw Error('No readable video stream was found.');
  return result.streams.some((s:{codec_type:string})=>s.codec_type==='audio');
}
