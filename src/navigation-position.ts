import {PositionError} from './current-position.ts';
import {isNativeWebView,siteCurrentPosition} from './site-bridge.web.ts';
import {getWebPosition,recentMeasuredWebPosition,webLocationGranted} from './web-position.ts';
import type {Fix} from './meter.ts';
// A measured 50–250 m fix can display the driver's position and route preview.
// Turn instructions require <=50 m, independently of map display and billing.
export function navigationGuidanceReady(fix:Fix|null,now=Date.now()):boolean{
 return !!fix&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=50&&Number.isFinite(fix.time)&&fix.time<=now+3000&&now-fix.time<=15000;
}
export async function navigationPosition(ask=false,signal?:AbortSignal):Promise<Fix>{
 if(signal?.aborted)throw new PositionError('position');
 const cached=recentMeasuredWebPosition(10000,250);
 const nativeGranted=typeof window!=='undefined'&&(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}).__YALLA_NATIVE_LOCATION_GRANTED__===true;
 if(cached){
  if(isNativeWebView()){if(nativeGranted)return cached}
  else{try{if(navigator.permissions?.query&&(await navigator.permissions.query({name:'geolocation'})).state==='denied')throw new PositionError('permission')}catch(error){if(error instanceof PositionError)throw error}return cached}
 }
 let point;
 if(isNativeWebView())point=await siteCurrentPosition(ask,signal);
 else{if(!ask&&!await webLocationGranted())throw new PositionError('permission');point=await getWebPosition(15000,250,true)}
 if(signal?.aborted)throw new PositionError('position');
 const measured=recentMeasuredWebPosition(20000,250);
 if(!measured||Math.abs(measured.latitude-point.latitude)>0.000001||Math.abs(measured.longitude-point.longitude)>0.000001)throw new PositionError('accuracy');
 return measured;
}
