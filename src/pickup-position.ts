import type {Language} from './domain.ts';
import {translate} from './locale.ts';
import {PositionError} from './current-position.ts';
import type {Coordinate} from './geo.ts';
import {getWebPosition,recentVerifiedWebPosition} from './web-position.ts';
import {positionDeadline} from './position-deadline.ts';
export type PickupReader=(ask:boolean,signal?:AbortSignal)=>Promise<Coordinate>;
function ordinaryBrowser(){return typeof window!=='undefined'&&!(window as Window&{ReactNativeWebView?:unknown}).ReactNativeWebView&&typeof navigator!=='undefined'&&!!navigator.geolocation}
// Confirmation is a deliberate user action: a browser in "prompt" state
// must be allowed to request location, rather than being treated as denied.
export function pickupPosition(read:PickupReader,{controller=new AbortController(),reuseNative=false}={}):Promise<Coordinate>{
 return positionDeadline(async signal=>{
  if(!ordinaryBrowser()){
   const host=typeof window!=='undefined'?(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}):undefined;
   const recent=reuseNative&&host?.__YALLA_NATIVE_LOCATION_GRANTED__===true?recentVerifiedWebPosition():null;
   return recent??read(true,signal);
  }
  try{if(navigator.permissions?.query){const permission=await navigator.permissions.query({name:'geolocation'});if(permission.state==='denied')throw new PositionError('permission')}}
  catch(error){if(error instanceof PositionError)throw error}
  const recent=recentVerifiedWebPosition();if(recent)return recent;
  return getWebPosition(15000,250,true,signal);
 },controller,22000);
}
export function pickupPositionMessage(error:unknown,locale:Language|boolean):string{
 const language=typeof locale==='boolean'?(locale?'ar':'en'):locale;
 const code=error instanceof PositionError?error.code:'position';
 if(code==='permission')return ordinaryBrowser()?(translate(language,'المتصفح لا يسمح لهذا الموقع بالوصول إلى موقعك. افتح إعدادات الموقع بجوار شريط العنوان واسمح بالموقع، ثم أعد المحاولة.','This website has no location permission. Allow location in the browser site settings, then try again.')):(translate(language,'لم يُمنح التطبيق إذن الموقع. اسمح بالموقع من أذونات التطبيق ثم أعد المحاولة.','Allow location in the app permissions, then try again.'));
 if(code==='accuracy')return translate(language,'دقة الموقع الحالية لا تكفي لتحديد نقطة الانطلاق. فعّل الموقع الدقيق ثم أعد المحاولة.','Location accuracy is too low to set pickup. Turn on precise location and try again.');
 if(code==='services')return translate(language,'خدمة الموقع في الهاتف متوقفة. شغّلها ثم أعد المحاولة.','Phone location is off. Turn it on and try again.');
 if(code==='timeout')return translate(language,'لم تصل قراءة الموقع في الوقت المتاح. اضغط «استخدام موقعي الحالي» ثم أعد التأكيد.','Location took too long. Tap Use my current location, then confirm again.');
 return translate(language,'تعذر قراءة موقع الهاتف حاليًا. اضغط «استخدام موقعي الحالي» وأعد المحاولة.','Could not read your phone location. Tap Use my current location and try again.');
}
