import {ServiceError} from './api.ts';
// Sequential Google route requests obey the existing per-user server quota.
// Waiting work is cancellable and never sends a request after a screen closes.
export function createRouteScheduler(gapMs=3200){
 let tail:Promise<unknown>=Promise.resolve(),lastStart=0;
 return {run<T>(work:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  const result=tail.catch(()=>{}).then(async()=>{
   if(signal?.aborted)throw new ServiceError('network');
   const wait=Math.max(0,gapMs-(Date.now()-lastStart));
   if(wait)await new Promise<void>((resolve,reject)=>{
    const cancelled=()=>{clearTimeout(timer);reject(new ServiceError('network'))};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancelled);resolve()},wait);
    signal?.addEventListener('abort',cancelled,{once:true});
   });
   if(signal?.aborted)throw new ServiceError('network');lastStart=Date.now();try{return await work()}finally{lastStart=Date.now()}
  });tail=result;return result;
 }};
}
export const routeScheduler=createRouteScheduler();
