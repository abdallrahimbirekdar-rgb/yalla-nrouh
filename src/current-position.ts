import {isCoordinate,type Coordinate} from './geo.ts';
export type PositionFailure='permission'|'services'|'timeout'|'position';
export class PositionError extends Error {code:PositionFailure;constructor(code:PositionFailure){super(code);this.code=code}}
export type PositionAdapter={
 permission:()=>Promise<{granted:boolean}>;
 requestPermission:()=>Promise<{granted:boolean}>;
 services:()=>Promise<boolean>;
 position:()=>Promise<{coords:Coordinate}>;
};
// One foreground fix, bounded in time. Never keep a watcher or use a stale fix.
export async function currentPosition(adapter:PositionAdapter,ask:boolean,timeoutMs=20000):Promise<Coordinate>{
 let expired=false;
 const check=()=>{if(expired)throw new PositionError('timeout')};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([
  (async()=>{
   let permission=await adapter.permission();check();
   if(!permission.granted&&ask){permission=await adapter.requestPermission();check()}
   if(!permission.granted)throw new PositionError('permission');
   const services=await adapter.services();check();
   if(!services)throw new PositionError('services');
   const fix=await adapter.position();check();
   if(!isCoordinate(fix.coords))throw new PositionError('position');
   return {latitude:fix.coords.latitude,longitude:fix.coords.longitude};
  })(),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new PositionError('timeout'))},timeoutMs)}),
 ]);}catch(error){throw error instanceof PositionError?error:new PositionError('position')}
 finally{if(timer)clearTimeout(timer)}
}
