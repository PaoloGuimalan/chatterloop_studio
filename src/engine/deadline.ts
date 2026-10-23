export async function withDeadline<T>(task:Promise<T>,milliseconds:number,message:string,onTimeout?:()=>void):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(Error(message));},milliseconds);})]);}
  finally{clearTimeout(timer);}
}
