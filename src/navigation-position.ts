import {PositionError} from './current-position.ts';
import {isNativeWebView,siteCurrentFix,siteCurrentPosition} from './site-bridge.web.ts';
import {getWebPosition,recentMeasuredWebPosition,webLocationGranted} from './web-position.ts';
import type {Fix} from './meter.ts';
// A measured 50–250 m fix can display the driver's position and route preview.
// Turn instructions require <=50 m, independently of map display and billing.
export function navigationGuidanceReady(fix:Fix|null,now=Date.now()):boolean{
 return !!fix&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=50&&Number.isFinite(fix.time)&&fix.time<=now+3000&&now-fix.time<=15000;
}
async function requestNavigationPosition(ask=false,signal?:AbortSignal,precise=false):Promise<Fix>{
 if(signal?.aborted)throw new PositionError('position');
 const cached=recentMeasuredWebPosition(precise?3000:10000,precise?50:250);
 const nativeGranted=typeof window!=='undefined'&&(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}).__YALLA_NATIVE_LOCATION_GRANTED__===true;
 if(cached){
  if(isNativeWebView()){if(nativeGranted)return cached}
  else{try{if(navigator.permissions?.query&&(await navigator.permissions.query({name:'geolocation'})).state==='denied')throw new PositionError('permission')}catch(error){if(error instanceof PositionError)throw error}return cached}
 }
 let point;
 if(isNativeWebView()){
  if(precise){const fix=await siteCurrentFix(ask,signal);if(!navigationGuidanceReady(fix))throw new PositionError('accuracy');return fix}
  point=await siteCurrentPosition(ask,signal);
 }else{if(!ask&&!await webLocationGranted())throw new PositionError('permission');point=await getWebPosition(15000,precise?50:250,true,signal)}
 if(signal?.aborted)throw new PositionError('position');
 const measured=recentMeasuredWebPosition(precise?15000:20000,precise?50:250);
 if(!measured||Math.abs(measured.latitude-point.latitude)>0.000001||Math.abs(measured.longitude-point.longitude)>0.000001)throw new PositionError('accuracy');
 return measured;
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
  const update=()=>{const fix=recentMeasuredWebPosition(precise?15000:20000,precise?50:250);if(fix)finish(fix)};
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
