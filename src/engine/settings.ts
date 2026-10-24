export function coreSettings(base:string,isolated:boolean,concurrency:number){
  const threads=isolated&&concurrency>=2?Math.min(4,Math.floor(concurrency)):1;
  return {threads,corePath:`${base}ffmpeg/${threads>1?'mt/':''}`};
}
