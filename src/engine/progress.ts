// Input timestamps can jump after seeking or mixing. Count encoded output
// frames instead, and leave completion to the successful exec/read result.
export function encodedFrameProgress(message:string,fps:number,duration:number){
  const frame=/^\s*frame=\s*(\d+)/.exec(message),total=fps*duration;
  if(!frame||!Number.isFinite(total)||total<=0)return undefined;
  return Math.min(.99,Number(frame[1])/total);
}
