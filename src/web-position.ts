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
   if(result.state==='denied')return nativeGranted; // An embedded WebView can have native permission even if the origin reports denied.
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
export function getWebPosition(timeout=7000):Promise<Coordinate>{
 if(typeof navigator==='undefined'||!navigator.geolocation)return Promise.reject(new PositionError('position'));
 return new Promise((resolve,reject)=>{
  navigator.geolocation.getCurrentPosition(
   result=>{
    const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
    if(isCoordinate(point)){recentFix={point,at:Date.now()};resolve(point)}else reject(new PositionError('position'));
   },
   error=>reject(new PositionError(error.code===1?'permission':error.code===3?'timeout':'position')),
   {enableHighAccuracy:false,maximumAge:30000,timeout}
  );
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
