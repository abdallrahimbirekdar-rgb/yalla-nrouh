import {PositionError} from './current-position.ts';
import type {Coordinate} from './geo.ts';

// Bound the whole request, including permission/bridge setup, rather than
// relying on the GPS provider to implement its own timeout correctly.
export async function positionDeadline(work:(signal:AbortSignal)=>Promise<Coordinate>,controller:AbortController,timeoutMs:number):Promise<Coordinate>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 let cancelled:(()=>void)|undefined;
 try{return await Promise.race([
  new Promise<Coordinate>((_,reject)=>{
   cancelled=()=>reject(new PositionError('position'));
   if(controller.signal.aborted){cancelled();return}
   controller.signal.addEventListener('abort',cancelled,{once:true});
   timer=setTimeout(()=>{reject(new PositionError('timeout'));controller.abort()},timeoutMs);
  }),
  Promise.resolve().then(()=>{if(controller.signal.aborted)throw new PositionError('position');return work(controller.signal)}),
 ])}finally{clearTimeout(timer);if(cancelled)controller.signal.removeEventListener('abort',cancelled)}
}
