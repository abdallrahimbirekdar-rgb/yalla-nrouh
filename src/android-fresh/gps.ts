// Pure, testable GPS subscription lifecycle. A new abort signal is passed
// per request; no cancelled global signal can poison subsequent launches.
export type GpsSubscription={remove:()=>void};
export type GpsFix={coords:{latitude:number;longitude:number;accuracy:number|null};timestamp:number};
export function acceptableFix(fix:GpsFix|null|undefined,maxAccuracy:number,maxAgeMs:number,now=Date.now()):boolean{
 if(!fix||!Number.isFinite(fix.coords?.latitude)||!Number.isFinite(fix.coords?.longitude))return false;
 if(Math.abs(fix.coords.latitude)>90||Math.abs(fix.coords.longitude)>180)return false;
 const accuracy=fix.coords.accuracy;
 if(typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<0||accuracy>maxAccuracy)return false;
 return Number.isFinite(fix.timestamp)&&fix.timestamp<=now+3000&&now-fix.timestamp<=maxAgeMs;
}
export async function deadlineOr<T>(work:Promise<T>,ms:number,fallback:T):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),ms)})]);}
 finally{if(timer)clearTimeout(timer)}
}
export function awaitFreshFix<T>(
 subscribe:(onFix:(fix:T)=>void,onError:()=>void)=>Promise<GpsSubscription>,
 valid:(fix:T)=>boolean,timeoutMs:number,signal?:AbortSignal
):Promise<T>{
 return new Promise((resolve,reject)=>{
  let done=false;let subscription:GpsSubscription|undefined;
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);subscription?.remove()};
  const finish=(error?:Error,fix?:T)=>{
   if(done)return;done=true;cleanup();
   if(error)reject(error);else resolve(fix as T);
  };
  const cancel=()=>finish(new Error('GPS_CANCELLED'));
  const timer=setTimeout(()=>finish(new Error('GPS_TIMEOUT')),timeoutMs);
  if(signal?.aborted){cancel();return}
  signal?.addEventListener('abort',cancel,{once:true});
  Promise.resolve().then(()=>{if(done)return null;return subscribe(value=>{if(!done&&valid(value))finish(undefined,value)},()=>finish(new Error('GPS_UNAVAILABLE')))})
   .then(value=>{if(value){subscription=value;if(done)value.remove()}})
   .catch(()=>finish(new Error('GPS_UNAVAILABLE')));
 });
}

export async function firstUsableMapFix<T>(
 subscribe:(accuracy:'high'|'balanced',signal:AbortSignal)=>Promise<T>,
 signal:AbortSignal,
):Promise<T>{
 if(signal.aborted)throw new Error('GPS_CANCELLED');
 const controller=new AbortController();
 const cancel=()=>controller.abort();
 signal.addEventListener('abort',cancel,{once:true});
 try{
  return await Promise.any([subscribe('high',controller.signal),subscribe('balanced',controller.signal)]);
 }catch(error){
  if(signal.aborted)throw new Error('GPS_CANCELLED');
  if(error instanceof AggregateError&&error.errors.some(cause=>cause instanceof Error&&cause.message==='GPS_TIMEOUT'))
   throw new Error('GPS_TIMEOUT');
  throw new Error('GPS_UNAVAILABLE');
 }finally{
  signal.removeEventListener('abort',cancel);
  cancel();
 }
}

// A map, route panel and startup can ask together. Share the provider, but
// cancelling one consumer must never cancel a fix another consumer still needs.
export class GpsTaskPool<T>{
 private jobs=new Map<string,{controller:AbortController;listeners:Set<{preview:(fix:T)=>void;resolve:(fix:T)=>void;reject:(error:unknown)=>void}>}>();
 request(key:string,signal:AbortSignal,preview:(fix:T)=>void,start:(signal:AbortSignal,preview:(fix:T)=>void)=>Promise<T>):Promise<T>{
  if(signal.aborted)return Promise.reject(new Error('GPS_CANCELLED'));
  let job=this.jobs.get(key);const fresh=!job;
  if(!job){job={controller:new AbortController(),listeners:new Set()};this.jobs.set(key,job)}
  const current=job;
  const result=new Promise<T>((resolve,reject)=>{
   const cleanup=()=>signal.removeEventListener('abort',cancel);
   const listener={preview,resolve:(fix:T)=>{cleanup();resolve(fix)},reject:(error:unknown)=>{cleanup();reject(error)}};
   const cancel=()=>{current.listeners.delete(listener);listener.reject(new Error('GPS_CANCELLED'));if(!current.listeners.size){current.controller.abort();if(this.jobs.get(key)===current)this.jobs.delete(key)}};
   current.listeners.add(listener);signal.addEventListener('abort',cancel,{once:true});
  });
  if(fresh)void Promise.resolve().then(()=>start(current.controller.signal,fix=>{for(const listener of current.listeners)listener.preview(fix)})).then(fix=>{for(const listener of current.listeners)listener.resolve(fix)},error=>{for(const listener of current.listeners)listener.reject(error)}).finally(()=>{current.listeners.clear();if(this.jobs.get(key)===current)this.jobs.delete(key)});
  return result;
 }
}
