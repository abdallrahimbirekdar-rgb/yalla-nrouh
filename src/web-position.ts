import {isCoordinate,type Coordinate} from './geo.ts';
import {PositionError} from './current-position.ts';

// Read-only check: never trigger a browser location prompt on automatic launch.
// Android may already have native permission, but the website origin can be denied separately.
export async function webLocationGranted():Promise<boolean>{
 if(typeof navigator==='undefined'||!navigator.geolocation)return false;
 const nativeGranted=typeof window!=='undefined'&&(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}).__YALLA_NATIVE_LOCATION_GRANTED__===true;
 try{
  if(navigator.permissions?.query){
   const result=await navigator.permissions.query({name:'geolocation'});
   if(result.state==='denied')return false; // A website permission denial is authoritative even inside Android.
   if(result.state==='granted')return true;
  }
 }catch{/* Some Android WebViews do not implement Permissions.query. */}
 return nativeGranted;
}

// Use the browser's geolocation API inside the live WebView so site fixes
// do not depend on old native JavaScript bundled into an installed APK.
// A position just approved in the permission screen is kept only in memory.
// This avoids losing the first GPS fix while the booking screen mounts.
let recentFix:{point:Coordinate;at:number}|null=null;
export function recentWebPosition(maxAgeMs=12000):Coordinate|null{
 return recentFix&&Date.now()-recentFix.at<=maxAgeMs?recentFix.point:null;
}

// First paint uses a recent, reasonably fast network/GPS fix rather than
// waiting for a fresh high-accuracy satellite lock (slow indoors).
export function getWebPosition(timeout=7000,maxAccuracy?:number):Promise<Coordinate>{
 if(typeof navigator==='undefined'||!navigator.geolocation)return Promise.reject(new PositionError('position'));
 return new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>{settled=true;reject(new PositionError('timeout'))},timeout+500);
  const fail=(code:'permission'|'timeout'|'position')=>{if(settled)return;settled=true;clearTimeout(timer);reject(new PositionError(code))};
  try{navigator.geolocation.getCurrentPosition(result=>{
   const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
   if(!isCoordinate(point)){fail('position');return}
   if(maxAccuracy!==undefined&&(typeof result.coords.accuracy!=='number'||!Number.isFinite(result.coords.accuracy)||result.coords.accuracy<0||result.coords.accuracy>maxAccuracy||!Number.isFinite(result.timestamp)||Date.now()-result.timestamp>20000||result.timestamp>Date.now()+3000)){fail('position');return}
   recentFix={point,at:Date.now()};
   if(settled){if(typeof document!=='undefined'&&document.visibilityState==='visible')announceWebPosition(point);return}
   settled=true;clearTimeout(timer);resolve(point);
  },error=>fail(error.code===1?'permission':error.code===3?'timeout':'position'),{enableHighAccuracy:false,maximumAge:12000,timeout});}
  catch{fail('position')}
 });
}
// After the map has a first fix, improve it in the background while the site
// remains visible. This does not delay the first map centre or create a watcher.
let refining=false;
export function refineWebPosition(){
 if(refining||typeof navigator==='undefined'||!navigator.geolocation||typeof document!=='undefined'&&document.visibilityState==='hidden')return;
 refining=true;
 navigator.geolocation.getCurrentPosition(result=>{
  refining=false;
  if(typeof document!=='undefined'&&document.visibilityState==='hidden')return;
  const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
  if(isCoordinate(point))announceWebPosition(point);
 },()=>{refining=false},{enableHighAccuracy:true,maximumAge:0,timeout:11000});
}
export function announceWebPosition(point:Coordinate){
 if(!isCoordinate(point))return;
 recentFix={point,at:Date.now()};
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('yalla:location-ready',{detail:point}));
}
