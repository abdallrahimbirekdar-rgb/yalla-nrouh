import {PositionError} from './current-position.ts';
// Share foreground requests, release a stalled native call after a fixed time.
export function createPositionJobs<T>(load:(precise:boolean)=>Promise<T>,timeoutMs=9500){
 const jobs=new Map<boolean,Promise<T>>();
 return (precise:boolean):Promise<T>=>{
  const pending=jobs.get(precise);if(pending)return pending;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const request=Promise.race([Promise.resolve().then(()=>load(precise)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PositionError('timeout')),timeoutMs)})]).finally(()=>{if(timer)clearTimeout(timer);if(jobs.get(precise)===request)jobs.delete(precise)});
  jobs.set(precise,request);return request;
 };
}
