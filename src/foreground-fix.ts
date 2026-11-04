import {PositionError} from './current-position.ts';
export type Subscription={remove:()=>void};
// A temporary foreground subscription, not a background tracking service.
// Cleanup also handles callbacks/timeouts arriving before registration resolves.
export function foregroundFix<T>(subscribe:(next:(fix:T)=>void,error:()=>void)=>Promise<Subscription>,accept:(fix:T)=>boolean,signal:AbortSignal,timeoutMs=20000):Promise<T>{
 return new Promise((resolve,reject)=>{
  let subscription:Subscription|undefined,finished=false;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);subscription?.remove()};
  const fail=()=>{if(finished)return;finished=true;cleanup();reject(new PositionError('position'))};
  const abort=()=>fail();
  const timer=setTimeout(()=>{if(finished)return;finished=true;cleanup();reject(new PositionError('timeout'))},timeoutMs);
  if(signal.aborted){abort();return}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{if(finished)return;return subscribe(fix=>{if(finished||!accept(fix))return;finished=true;cleanup();resolve(fix)},fail)}).then(value=>{subscription=value;if(finished)subscription?.remove()}).catch(fail);
 });
}
