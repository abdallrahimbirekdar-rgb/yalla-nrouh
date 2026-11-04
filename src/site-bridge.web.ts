export type SiteWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void};__YALLA_NATIVE_LOCATION_GRANTED__?:boolean};
// The website owns its local data. Never block a launch or save while trying
// to import older APK data; the owner chose to start without that migration.
// Keep the native handshake only for optional foreground location status.
export const siteMigrationPending=()=>false;
export async function loadSiteState(storage:Pick<Storage,'getItem'|'setItem'>,key:string):Promise<string|null>{
 const saved=storage.getItem(key);
 const host=window as SiteWindow;
 const bridge=host.ReactNativeWebView;
 if(!bridge)return saved;
 document.documentElement?.classList.add('yn-native-app');
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const version=document.querySelector('meta[name="yalla-site-version"]')?.getAttribute('content')??null;
 const finish=(event:Event)=>{
  const value=(event as CustomEvent).detail;
  if(value?.id!==id||typeof value.locationGranted!=='boolean')return;
  cleanup();
  host.__YALLA_NATIVE_LOCATION_GRANTED__=value.locationGranted;
 };
 const request=()=>{try{bridge.postMessage(JSON.stringify({type:'bootstrap',id,needsSavedState:false,version}))}catch{/* Web data remains usable. */}};
 const cleanup=()=>{clearInterval(retry);clearTimeout(timeout);host.removeEventListener('yalla:native-bootstrap',finish)};
 host.addEventListener('yalla:native-bootstrap',finish);
 const retry=setInterval(request,1000);
 const timeout=setTimeout(cleanup,5000);
 request();
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
