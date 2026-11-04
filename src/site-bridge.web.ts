import {readSaved} from './persistence.ts';
export type SiteWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void};__YALLA_NATIVE_LOCATION_GRANTED__?:boolean};
export async function loadSiteState(storage:Pick<Storage,'getItem'|'setItem'>,key:string):Promise<string|null>{
 const saved=storage.getItem(key);const host=window as SiteWindow;const bridge=host.ReactNativeWebView;
 if(!bridge)return saved;
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const payload=await new Promise<{savedState:string|null;locationGranted:boolean}>((resolve,reject)=>{
  const finish=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.id!==id||typeof value.locationGranted!=='boolean'||(value.savedState!==null&&typeof value.savedState!=='string'))return;cleanup();resolve(value)};
  const timer=setTimeout(()=>{cleanup();reject(Error('Could not restore application data. Try again.'))},5000);
  const cleanup=()=>{clearTimeout(timer);host.removeEventListener('yalla:native-bootstrap',finish)};
  host.addEventListener('yalla:native-bootstrap',finish);
  const version=document.querySelector('meta[name="yalla-site-version"]')?.getAttribute('content')??null;
  try{bridge.postMessage(JSON.stringify({type:'bootstrap',id,needsSavedState:saved===null,version}))}catch(error){cleanup();reject(error)}
 });
 host.__YALLA_NATIVE_LOCATION_GRANTED__=payload.locationGranted;
 // Import the old APK's local data once. Never overwrite the website's newer data.
 if(saved===null&&payload.savedState!==null){readSaved(payload.savedState);storage.setItem(key,payload.savedState);return payload.savedState}
 return saved;
}

export function nativeAction(type:'alerts-enable'|'notify',text?:{title:string;body:string}):Promise<boolean>{
 const host=window as SiteWindow;const bridge=host.ReactNativeWebView;if(!bridge)return Promise.resolve(false);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 return new Promise((resolve,reject)=>{
  const finish=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.id!==id||typeof value.ok!=='boolean')return;cleanup();resolve(value.ok)};
  const timer=setTimeout(()=>{cleanup();reject(Error('Native action timed out'))},30000);
  const cleanup=()=>{clearTimeout(timer);host.removeEventListener('yalla:native-result',finish)};
  host.addEventListener('yalla:native-result',finish);
  try{bridge.postMessage(JSON.stringify({type,id,...text}))}catch(error){cleanup();reject(error)}
 });
}
