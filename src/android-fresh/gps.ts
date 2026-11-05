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
