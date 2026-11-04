import {restoreState,initialState,categories,regions,type AppState,type TripDraft} from './domain.ts';
import {isCoordinate} from './geo.ts';
export const emptyDraft:TripDraft={pickup:'',destination:'',region:0,intercity:false,category:'classic'};
export function restoreDraft(value:unknown):TripDraft {
 const d=value as TripDraft;
 if(!d||typeof d.pickup!=='string'||typeof d.destination!=='string'||d.pickup.length>200||d.destination.length>200||!Number.isInteger(d.region)||!regions[d.region]||typeof d.intercity!=='boolean'||!categories.some(c=>c.id===d.category)||(d.pickupPoint!==undefined&&!isCoordinate(d.pickupPoint))||(d.destinationPoint!==undefined&&!isCoordinate(d.destinationPoint)))return {...emptyDraft};
 return {...d};
}
export function readSaved(raw:string|null):{state:AppState;draft:TripDraft} {
 if(raw===null)return {state:initialState,draft:{...emptyDraft}};
 const value=JSON.parse(raw);
 const state=restoreState(value?.storageVersion===2?value.state:value);
 if(!state)throw Error('Invalid saved data');
 return {state,draft:value?.storageVersion===2?restoreDraft(value.draft):{...emptyDraft}};
}
// Coalesce pending writes, serialize disk access, and keep the latest value for retry.
export function createLatestWriter(write:(value:string)=>Promise<unknown>,report:(ok:boolean)=>void) {
 let latest:string|undefined,pending:string|undefined,running:Promise<void>|undefined;
 function drain():Promise<void> {
  if(running)return running;
  running=(async()=>{while(pending!==undefined){const next=pending;pending=undefined;try{await write(next);report(true);}catch{report(false);}}})().finally(()=>{running=undefined;if(pending!==undefined)return drain();});
  return running;
 }
 return {enqueue(value:string){latest=value;pending=value;return drain();},retry(){if(latest!==undefined)pending=latest;return drain();},flush:drain};
}

// Only recover malformed payloads after a durable, byte-for-byte backup exists.
// Storage I/O failures still propagate: never overwrite a store we cannot read.
export async function loadRecoverable(get:(key:string)=>Promise<string|null>|string|null,set:(key:string,value:string)=>Promise<unknown>|unknown,key:string):Promise<{raw:string|null;recovered:boolean}> {
 const raw=await get(key);
 try{readSaved(raw);return {raw,recovered:false}}catch{}
 const backupKey=key+'-recovery-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 await set(backupKey,raw!);
 const value=JSON.parse(JSON.stringify({storageVersion:2,state:initialState,draft:emptyDraft}));
 // Keep independently valid settings and the draft, even if an old trip is invalid.
 try{const old=JSON.parse(raw!);const state=old?.storageVersion===2?old.state:old;
  const candidate=restoreState({...state,trips:[],activeTripId:null});
  if(candidate)value.state=candidate;
  if(old?.storageVersion===2)value.draft=restoreDraft(old.draft);
 }catch{}
 const repaired=JSON.stringify(value);
 // Persist only after the backup succeeds. Keep the backup until manually reviewed.
 await set(key,repaired);
 return {raw:repaired,recovered:true};
}
