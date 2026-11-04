// Only the website-restricted public Maps JavaScript key belongs in this bundle.
export function webMapsKey(value:string|undefined){return value?.trim()||null}
export type LatLng={lat:number;lng:number};
type MapEvent={latLng?:{lat:()=>number;lng:()=>number}|null};
type Listener={remove:()=>void};
export interface GoogleMap {
 addListener:(name:string,callback:(event:MapEvent)=>void)=>Listener;
 setOptions:(options:Record<string,unknown>)=>void;
 getBounds:()=>{contains:(point:LatLng)=>boolean}|undefined;
 getCenter:()=>{lat:()=>number;lng:()=>number}|undefined;
 setCenter:(point:LatLng)=>void;
 setZoom:(zoom:number)=>void;
 fitBounds:(bounds:unknown,padding?:number)=>void;
}
export interface GoogleMarker {position:LatLng|undefined;map:GoogleMap|null;gmpDraggable:boolean;addListener:(name:string,callback:(event:MapEvent)=>void)=>Listener}
export interface GoogleLine {setMap:(map:GoogleMap|null)=>void;setPath:(points:LatLng[])=>void}
export interface GoogleMaps {
 importLibrary?:(name:string)=>Promise<unknown>;
 Map:new(host:HTMLElement,options:Record<string,unknown>)=>GoogleMap;
 LatLngBounds:new()=>{extend:(point:LatLng)=>void};
 Polyline:new(options:Record<string,unknown>)=>GoogleLine;
 marker:{AdvancedMarkerElement:new(options:Record<string,unknown>)=>GoogleMarker};
 event:{clearInstanceListeners:(instance:unknown)=>void};
}
type MapsWindow=Window&{google?:{maps:GoogleMaps};__yallaGoogleMapsReady?:()=>void;gm_authFailure?:()=>void};
let loading:Promise<GoogleMaps>|null=null;
const authListeners=new Set<()=>void>();
export function onMapsAuthFailure(listener:()=>void){authListeners.add(listener);return()=>{authListeners.delete(listener)}}
export function loadGoogleMaps(key:string|null,language:string):Promise<GoogleMaps>{
 if(!key)return Promise.reject(Error('not_configured'));
 const target=window as MapsWindow;
 if(target.google?.maps?.marker)return Promise.resolve(target.google.maps);
 if(loading)return loading;
 loading=new Promise<GoogleMaps>((resolve,reject)=>{
  const script=document.createElement('script');let settled=false;
  const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();delete target.__yallaGoogleMapsReady;loading=null;reject(Error('map_load'))};
  const timer=setTimeout(fail,20000);
  target.__yallaGoogleMapsReady=()=>{if(!target.google?.maps?.marker){fail();return}settled=true;clearTimeout(timer);delete target.__yallaGoogleMapsReady;resolve(target.google.maps)};
  target.gm_authFailure=()=>{for(const listener of authListeners)listener();fail()};
  const params=new URLSearchParams({key,callback:'__yallaGoogleMapsReady',loading:'async',libraries:'marker',v:'quarterly',language:language==='ar'?'ar':'en'});
  script.src='https://maps.googleapis.com/maps/api/js?'+params;script.async=true;script.onerror=fail;document.head.appendChild(script);
 });
 return loading;
}
