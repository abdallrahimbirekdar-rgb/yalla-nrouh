import {isCoordinate,type Coordinate} from './geo.ts';
import {announceWebPosition,getWebPosition,refineWebPosition,webLocationGranted} from './web-position.ts';
import {PositionError} from './current-position.ts';
import type {Fix} from './meter.ts';
export type SiteWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void};__YALLA_NATIVE_LOCATION_GRANTED__?:boolean};
// The website owns its local data. Never block a launch or save while trying
// to import older APK data; the owner chose to start without that migration.
// Keep the native handshake only for optional foreground location status.
const nativePositionHosts=new WeakSet<SiteWindow>();
let latestNativeGpsId:string|null=null;
function listenNativePosition(host:SiteWindow){
 if(nativePositionHosts.has(host))return;
 nativePositionHosts.add(host);
 host.addEventListener('yalla:native-position',event=>{
  const point=(event as CustomEvent).detail?.point;
  if((event as CustomEvent).detail?.id===latestNativeGpsId&&isCoordinate(point))announceWebPosition(point);
 });
}
export type NativePositionResult={point:Coordinate|null;error:'permission'|'services'|'position'|'timeout'|'unsupported'|null;fix?:Fix};
export function isNativeWebView():boolean{
 return typeof window!=='undefined'&&Boolean((window as SiteWindow).ReactNativeWebView);
}
export function nativeCurrentPosition(askPermission:boolean,signal?:AbortSignal,track=false):Promise<NativePositionResult>{
 const bridge=typeof window!=='undefined'?(window as SiteWindow).ReactNativeWebView:undefined;
 if(!bridge)return Promise.resolve({point:null,error:'unsupported'});
 listenNativePosition(window as SiteWindow);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 latestNativeGpsId=id;
 return new Promise(resolve=>{
  const finish=(event:Event)=>{
   const detail=(event as CustomEvent).detail;
   if(detail?.id!==id)return;
   const point=isCoordinate(detail.point)?detail.point:null;
   const error=point?null:['permission','services','position','timeout'].includes(detail.error)?detail.error as NativePositionResult['error']:'position';
   const rawFix=detail.fix;
   const fix=point&&rawFix&&Number.isFinite(rawFix.accuracy)&&rawFix.accuracy>=0&&Number.isFinite(rawFix.time)&&rawFix.time>0?{...point,accuracy:rawFix.accuracy,time:rawFix.time} as Fix:undefined;
   cleanup();
   resolve({point,error,...(fix?{fix}:{})});
  };
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('yalla:native-position',finish);signal?.removeEventListener('abort',abort)};
  const abort=()=>{cleanup();resolve({point:null,error:'unsupported'})};
  const timer=setTimeout(()=>{cleanup();resolve({point:null,error:'timeout'})},11000);
  window.addEventListener('yalla:native-position',finish);
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  try{bridge.postMessage(JSON.stringify({type:'location',id,askPermission,...(track?{track:true}:{})}))}
  catch{cleanup();resolve({point:null,error:'unsupported'})}
 });
}
/**
 * Browser GPS on the website, native Expo GPS in the installed WebView.
 * Never request a fresh permission on automatic location attempts.
 * Older installed wrappers do not understand this request and fall back to web GPS.
 */
export async function siteCurrentPosition(askPermission:boolean):Promise<Coordinate>{
 if(isNativeWebView()){
  // The installed app has ONE location permission and ONE GPS provider:
  // Android Expo Location via the typed WebView bridge. Never fall back to
  // navigator.geolocation here: that creates a second WebView-origin prompt.
  const result=await nativeCurrentPosition(askPermission);
  if(result.point)return result.point;
  throw new PositionError(
   result.error==='permission'||result.error==='services'||result.error==='timeout'
    ?result.error:'position'
  );
 }
 // Ordinary browsers still use their own permission once.
 if(!askPermission&&!await webLocationGranted())throw new PositionError('permission');
 const point=await getWebPosition(6500);refineWebPosition();return point;
}
// Driver metering needs the actual native GPS timestamp and accuracy.
// Invalid/inaccurate fixes are NOT counted as traveled distance.
export async function siteCurrentFix(askPermission:boolean):Promise<Fix>{
 if(!isNativeWebView())throw new PositionError('position');
 const result=await nativeCurrentPosition(askPermission,undefined,true);
 if(result.fix&&result.fix.accuracy<=50)return result.fix;
 throw new PositionError(
  result.error==='permission'||result.error==='services'||result.error==='timeout'
   ?result.error:'position'
 );
}
export const siteMigrationPending=()=>false;
export async function loadSiteState(storage:Pick<Storage,'getItem'|'setItem'>,key:string):Promise<string|null>{
 const saved=storage.getItem(key);
 const host=window as SiteWindow;
 const bridge=host.ReactNativeWebView;
 if(!bridge)return saved;
 document.documentElement?.classList.add('yn-native-app');
 listenNativePosition(host);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const version=document.querySelector('meta[name="yalla-site-version"]')?.getAttribute('content')??null;
 const finish=(event:Event)=>{
  const value=(event as CustomEvent).detail;
  if(value?.id!==id||typeof value.locationGranted!=='boolean')return;
  cleanup();
  host.__YALLA_NATIVE_LOCATION_GRANTED__=value.locationGranted;
  host.dispatchEvent(new CustomEvent('yalla:native-location-permission',{detail:{granted:value.locationGranted}}));
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
