import {isCoordinate} from './geo.ts';
import {foregroundFix} from './foreground-fix.ts';
import {PositionError} from './current-position.ts';
import {isNativeWebView,siteCurrentFix,siteCurrentPosition} from './site-bridge.web.ts';
import {announceWebPosition,getWebPosition,recentMeasuredWebPosition,webLocationGranted} from './web-position.ts';
import type {Fix} from './meter.ts';
// A measured fix up to 250 m can display the driver's position and route preview.
// Turn instructions require <=50 m, independently of map display and billing.
export function navigationGuidanceReady(fix:Fix|null,now=Date.now()):boolean{
 return !!fix&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=50&&Number.isFinite(fix.time)&&fix.time<=now+3000&&now-fix.time<=15000;
}
async function requestNavigationPosition(ask=false,signal?:AbortSignal,precise=false):Promise<Fix>{
 const minFixTime=Date.now()-3000;
 if(signal?.aborted)throw new PositionError('position');
 const cached=recentMeasuredWebPosition(precise?3000:10000,precise?50:250);
 const nativeGranted=typeof window!=='undefined'&&(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}).__YALLA_NATIVE_LOCATION_GRANTED__===true;
 if(cached){
  if(isNativeWebView()){if(nativeGranted)return cached}
  else{try{if(navigator.permissions?.query&&(await navigator.permissions.query({name:'geolocation'})).state==='denied')throw new PositionError('permission')}catch(error){if(error instanceof PositionError)throw error}return cached}
 }
 let point;
 if(isNativeWebView()){
  if(precise){const fix=await siteCurrentFix(ask,signal,minFixTime);if(!navigationGuidanceReady(fix))throw new PositionError('accuracy');return fix}
  point=await siteCurrentPosition(ask,signal);
 }else{
  if(!ask&&!await webLocationGranted())throw new PositionError('permission');
  if(precise)return watchNavigationPosition(minFixTime,signal);
  point=await getWebPosition(15000,250,true,signal);
 }
 if(signal?.aborted)throw new PositionError('position');
 const measured=recentMeasuredWebPosition(20000,250);
 if(!measured||Math.abs(measured.latitude-point.latitude)>0.000001||Math.abs(measured.longitude-point.longitude)>0.000001)throw new PositionError('accuracy');
 return measured;
}

async function watchNavigationPosition(minFixTime:number,signal?:AbortSignal):Promise<Fix>{
 const gps=navigator.geolocation;
 if(!gps)throw new PositionError('position');
 let failure:PositionError|undefined;
 try{
  const fix=await foregroundFix<Fix>(async (next,fail)=>{
   const id=gps.watchPosition(result=>{
    const fix={latitude:result.coords.latitude,longitude:result.coords.longitude,accuracy:result.coords.accuracy,time:result.timestamp};
    if(!isCoordinate(fix)||fix.time<minFixTime||!navigationGuidanceReady(fix))return;
    next(fix);
   },error=>{
    if(error.code!==1)return;
    failure=new PositionError('permission');
    fail();
   },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
   return {remove:()=>gps.clearWatch(id)};
  },()=>true,signal??new AbortController().signal,15000);
  announceWebPosition(fix,{accuracy:fix.accuracy,time:fix.time});
  return fix;
 }catch(error){
  throw failure??error;
 }
}

// Every map consumes the same measured phone stream. A fix obtained by the
// upper driver map also resolves an already-pending navigation request.
export function navigationPosition(ask=false,signal?:AbortSignal,precise=false):Promise<Fix>{
 if(typeof window==='undefined')return requestNavigationPosition(ask,signal,precise);
 const host=window;const controller=new AbortController();
 return new Promise((resolve,reject)=>{
  let done=false;
  const cleanup=()=>{host.removeEventListener('yalla:location-ready',update);signal?.removeEventListener('abort',cancel)};
  const finish=(fix?:Fix,error?:unknown)=>{if(done)return;done=true;cleanup();if(error)reject(error);else resolve(fix!);controller.abort()};
  const update=()=>{const fix=recentMeasuredWebPosition(precise?3000:20000,precise?50:250);if(fix)finish(fix)};
  const cancel=()=>finish(undefined,new PositionError('position'));
  if(signal?.aborted){cancel();return}
  host.addEventListener('yalla:location-ready',update);signal?.addEventListener('abort',cancel,{once:true});
  void requestNavigationPosition(ask,controller.signal,precise).then(fix=>finish(fix),error=>finish(undefined,error));
 });
}
export function sharedNavigationDisplay(point:{latitude:number;longitude:number}){
 const measured=recentMeasuredWebPosition(20000,250);
 const match=measured&&Math.abs(measured.latitude-point.latitude)<0.000001&&Math.abs(measured.longitude-point.longitude)<0.000001;
 return {point,fix:match?measured:null,accuracy:match?measured.accuracy:null,guidanceReady:match?navigationGuidanceReady(measured):false};
}

// Live navigation owns its foreground subscription independently of one-shot
// requests for booking, driver availability and the fare meter.
export function watchDriverPosition(ask:boolean,onFix:(fix:Fix)=>void,onError:(code:string)=>void):(()=>void)|null{
 if(typeof window==='undefined')return null;
 const host=window as Window&{__YALLA_DRIVER_LOCATION_STREAM__?:boolean;ReactNativeWebView?:{postMessage:(message:string)=>void}};
 let lastTime=0;
 const deliver=(point:unknown,accuracy:unknown,time:unknown)=>{
  if(!isCoordinate(point)||typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<0||accuracy>250
     ||typeof time!=='number'||!Number.isFinite(time)||time<=lastTime||time<Date.now()-5000||time>Date.now()+3000)return;
  lastTime=time;
  onFix({...point,accuracy,time});
 };
 const bridge=host.ReactNativeWebView;
 if(bridge){
  if(!host.__YALLA_DRIVER_LOCATION_STREAM__)return null;
  const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const update=(event:Event)=>{
   const detail=(event as CustomEvent).detail;
   if(detail?.id!==id)return;
   if(detail.error){onError(detail.error);return}
   deliver(detail.point,detail.fix?.accuracy,detail.fix?.time);
  };
  host.addEventListener('yalla:native-position',update);
  try{bridge.postMessage(JSON.stringify({type:'driver-location-start',id,askPermission:ask}))}
  catch{host.removeEventListener('yalla:native-position',update);return null}
  return ()=>{
   host.removeEventListener('yalla:native-position',update);
   try{bridge.postMessage(JSON.stringify({type:'driver-location-stop',id}))}catch{}
  };
 }
 const gps=navigator.geolocation;
 if(!gps)return null;
 let active=true,watch:number|undefined;
 void (async()=>{
  if(!ask&&!await webLocationGranted()){if(active)onError('permission');return}
  if(!active)return;
  try{
   watch=gps.watchPosition(({coords,timestamp})=>{
    if(active)deliver({latitude:coords.latitude,longitude:coords.longitude},coords.accuracy,timestamp);
   },error=>{if(active)onError(error.code===1?'permission':error.code===3?'timeout':'position')},
   {enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }catch{onError('position')}
 })();
 return ()=>{active=false;if(watch!==undefined)gps.clearWatch(watch)};
}
