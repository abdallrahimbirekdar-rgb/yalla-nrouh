import {readSaved} from './persistence.ts';
export type SiteWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void};__YALLA_NATIVE_LOCATION_GRANTED__?:boolean};
let migrationPending=false;
export const siteMigrationPending=()=>migrationPending;
export async function loadSiteState(storage:Pick<Storage,'getItem'|'setItem'>,key:string):Promise<string|null>{
 const saved=storage.getItem(key);const host=window as SiteWindow;const bridge=host.ReactNativeWebView;
 if(!bridge)return saved;
 document.documentElement?.classList.add('yn-native-app');
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 migrationPending=saved===null;
 const payload=await new Promise<{savedState:string|null;locationGranted:boolean}|null>((resolve)=>{
  const finish=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.id!==id||typeof value.locationGranted!=='boolean'||(value.savedState!==null&&typeof value.savedState!=='string'))return;cleanup();resolve(value)};
  // Android may deliver the first message before the native listener is ready.
  // Retry the same request; never make reading existing website data depend on it.
  const version=document.querySelector('meta[name="yalla-site-version"]')?.getAttribute('content')??null;
  const request=()=>{try{bridge.postMessage(JSON.stringify({type:'bootstrap',id,needsSavedState:saved===null,version}))}catch{}};
  const retry=setInterval(request,1000);
  const timer=setTimeout(()=>{cleanup();resolve(null)},saved===null?15000:3000);
  const cleanup=()=>{clearTimeout(timer);clearInterval(retry);host.removeEventListener('yalla:native-bootstrap',finish)};
  host.addEventListener('yalla:native-bootstrap',finish);
  request();
 });
 // Keep the map usable on a bridge failure, but block writes until migration
 // can be retried. The original native database is never cleared or replaced.
 if(!payload)return saved;
 migrationPending=false;
 host.__YALLA_NATIVE_LOCATION_GRANTED__=payload.locationGranted;
 // Import the old APK's local data once. Never overwrite the website's newer data.
 if(saved===null&&payload.savedState!==null){try{readSaved(payload.savedState)}catch{storage.setItem(key+'-native-recovery-'+Date.now(),payload.savedState);return null}storage.setItem(key,payload.savedState);return payload.savedState}
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
