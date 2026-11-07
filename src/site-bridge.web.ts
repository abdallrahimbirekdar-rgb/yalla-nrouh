import {isCoordinate,type Coordinate} from './geo.ts';
import {announceWebPosition,getWebPosition,recentMeasuredWebPosition,refineWebPosition,webLocationGranted} from './web-position.ts';
import {PositionError} from './current-position.ts';
import type {Fix} from './meter.ts';
export type SiteWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void};__YALLA_NATIVE_LOCATION_GRANTED__?:boolean;__YALLA_NATIVE_AUTOFIX__?:{point:Coordinate;time:number;accuracy?:number}};
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
  if((event as CustomEvent).detail?.id===latestNativeGpsId&&isCoordinate(point))announceWebPosition(point,(event as CustomEvent).detail?.fix);
 });
 // Native can obtain GPS even if the webpage -> Android message never arrives.
 // Keep a recent result available when React mounts after the native event.
 const auto=(value:unknown)=>{
  const details=value as {point?:unknown;time?:unknown;accuracy?:unknown}|null;
  if(!details||!isCoordinate(details.point)||typeof details.time!=='number')return;
  const age=Date.now()-details.time;
  if(!Number.isFinite(age)||age< -3000||age>=30000)return;
  const {accuracy,point,time}=details;
  if(accuracy===undefined)announceWebPosition(point); // Older installed APKs omit accuracy.
  else if(typeof accuracy==='number'&&Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=250)
   announceWebPosition(point,{accuracy,time});
 };
 host.addEventListener('yalla:native-autofix',event=>auto((event as CustomEvent).detail));
 if(host.__YALLA_NATIVE_AUTOFIX__)auto(host.__YALLA_NATIVE_AUTOFIX__);
}
export type NativePositionResult={point:Coordinate|null;error:'permission'|'accuracy'|'services'|'position'|'timeout'|'unsupported'|null;fix?:Fix};
export function isNativeWebView():boolean{
 return typeof window!=='undefined'&&Boolean((window as SiteWindow).ReactNativeWebView);
}
export function nativeCurrentPosition(askPermission:boolean,signal?:AbortSignal,track=false,minFixTime?:number):Promise<NativePositionResult>{
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
   const error=point?null:['permission','accuracy','services','position','timeout'].includes(detail.error)?detail.error as NativePositionResult['error']:'position';
   const rawFix=detail.fix;
   const fix=point&&rawFix&&Number.isFinite(rawFix.accuracy)&&rawFix.accuracy>=0&&Number.isFinite(rawFix.time)&&rawFix.time>0?{...point,accuracy:rawFix.accuracy,time:rawFix.time} as Fix:undefined;
   if(point&&minFixTime!==undefined&&(!fix||fix.time<minFixTime||fix.time>Date.now()+3000||fix.accuracy>50))return;
   if(point){const shared=recentMeasuredWebPosition(20000,250);if(!shared||!fix||shared.time!==fix.time||Math.abs(shared.latitude-point.latitude)>0.000001||Math.abs(shared.longitude-point.longitude)>0.000001)announceWebPosition(point,fix?{accuracy:fix.accuracy,time:fix.time}:undefined)}
   cleanup();
   resolve({point,error,...(fix?{fix}:{})});
  };
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('yalla:native-position',finish);signal?.removeEventListener('abort',abort)};
  const abort=()=>{
   if(latestNativeGpsId===id)latestNativeGpsId=null;
   try{bridge.postMessage(JSON.stringify({type:'location-cancel',id}))}catch{}
   cleanup();resolve({point:null,error:'unsupported'});
  };
  const timer=setTimeout(()=>{if(latestNativeGpsId===id)latestNativeGpsId=null;try{bridge.postMessage(JSON.stringify({type:'location-cancel',id}))}catch{}cleanup();resolve({point:null,error:'timeout'})},askPermission?60000:25000);
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
export async function siteCurrentPosition(askPermission:boolean,signal?:AbortSignal):Promise<Coordinate>{
 if(isNativeWebView()){
  const host=window as SiteWindow;
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  if(signal?.aborted)throw new PositionError('position');
  signal?.addEventListener('abort',cancel,{once:true});
  try{
  const nativeRequest=nativeCurrentPosition(askPermission,controller.signal);
  // Give the native foreground GPS an opportunity to answer promptly, without
  // opening an unnecessary second WebView-origin permission prompt.
  let timer:ReturnType<typeof setTimeout>|undefined;
  const early=await Promise.race([
   nativeRequest.then(result=>({kind:'native' as const,result})),
   new Promise<{kind:'slow'}>(resolve=>{timer=setTimeout(()=>resolve({kind:'slow'}),1500)}),
  ]);
  if(timer)clearTimeout(timer);
  if(early.kind==='native'&&early.result.point)return early.result.point;
  if(early.kind==='native'&&['permission','accuracy','services'].includes(early.result.error??'')){
   throw new PositionError(early.result.error as 'permission'|'accuracy'|'services');
  }
  // This fallback works like the user's phone browser. It is enabled only
  // after Android has reported foreground permission, never after denial.
  // Driver metering deliberately stays on native precise GPS below.
  if(host.__YALLA_NATIVE_LOCATION_GRANTED__===true&&navigator.geolocation){
   try{
    const point=await Promise.any([
     nativeRequest.then(result=>{
      if(result.point)return result.point;
      throw new PositionError(result.error==='timeout'?'timeout':'position');
     }),
     getWebPosition(6500,250,false,controller.signal),
    ]);
    if(signal?.aborted)throw new PositionError('position');
    controller.abort();
    const measured=recentMeasuredWebPosition(20000,250);
    const same=measured&&Math.abs(measured.latitude-point.latitude)<0.000001&&Math.abs(measured.longitude-point.longitude)<0.000001;
    announceWebPosition(point,same?{accuracy:measured.accuracy,time:measured.time}:undefined);
    return point;
   }catch{/* Preserve the native error if both paths fail. */}
  }
  const result=early.kind==='native'?early.result:await nativeRequest;
  if(result.point)return result.point;
  throw new PositionError(
   result.error==='permission'||result.error==='accuracy'||result.error==='services'||result.error==='timeout'
    ?result.error:'position'
  );
  }finally{signal?.removeEventListener('abort',cancel);controller.abort()}
 }
 // Ordinary browsers keep their existing geolocation behavior.
 if(!askPermission&&!await webLocationGranted())throw new PositionError('permission');
 const point=await getWebPosition(6500,undefined,false,signal);
 if(!signal?.aborted)refineWebPosition();
 return point;
}
// Driver metering needs the actual native GPS timestamp and accuracy.
// Invalid/inaccurate fixes are NOT counted as traveled distance.
export async function siteCurrentFix(askPermission:boolean,signal?:AbortSignal,minFixTime?:number):Promise<Fix>{
 if(!isNativeWebView())throw new PositionError('position');
 const result=await nativeCurrentPosition(askPermission,signal,true,minFixTime);
 if(result.fix&&result.fix.accuracy<=50)return result.fix;
 throw new PositionError(
  result.error==='permission'||result.error==='accuracy'||result.error==='services'||result.error==='timeout'
   ?result.error:'position'
 );
}
export const siteMigrationPending=()=>false;
export async function loadSiteState(storage:Pick<Storage,'getItem'|'setItem'>,key:string):Promise<string|null>{
 const saved=storage.getItem(key);
 const host=window as SiteWindow;
 const bridge=host.ReactNativeWebView;
 if(!bridge)return saved;
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

export function nativeAction(type:'alerts-enable'|'notify'|'location-settings',text?:{title:string;body:string}):Promise<boolean>{
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
