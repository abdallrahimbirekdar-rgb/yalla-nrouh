// Standalone, typed bridge for the rebuilt Android host.
// Never execute strings received from the website; only parse a small JSON protocol.
const SITE_ORIGIN='https://abdallrahimbirekdar-rgb.github.io';
export const SITE=SITE_ORIGIN+'/yalla-nrouh/';
export type WebMessage=
 |{type:'bootstrap';id:string;version:string|null}
 |{type:'location';id:string;askPermission:boolean;track:boolean}
 |{type:'location-cancel';id:string}
  |{type:'driver-location-start';id:string;askPermission:boolean}
  |{type:'driver-location-stop';id:string}
 |{type:'driver-speak';id:string;text:string;language:'ar'|'en'}
 |{type:'driver-speech-stop'}
 |{type:'driver-voice-setup'}
 |{type:'ride-share-start';id:string;rideId:string;secret:string}
 |{type:'ride-share-stop';id:string;rideId:string}
 |{type:'ride-share-status';id:string}
 |{type:'ride-maps'|'ride-yandex'|'ride-osmand';id:string;latitude:number;longitude:number;adjacent:boolean}
 |{type:'location-settings';id:string}
 |{type:'alerts-enable';id:string}
 |{type:'notify';id:string;title:string;body:string}
 |{type:'status';safeToReload:boolean;canGoBack:boolean;language?:'ar'|'en';theme?:'system'|'light'|'dark';signedOut?:true}
 |{type:'refresh'}
 |{type:'back-default'};
const idOK=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9-]{1,80}$/i.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function trustedSite(value:string):boolean{
 try{const u=new URL(value);return u.origin===SITE_ORIGIN
 &&!u.username&&!u.password&&(u.pathname==='/yalla-nrouh'||u.pathname.startsWith('/yalla-nrouh/'))}
 catch{return false}
}
export function trustedWebMessage(source:string,documentUrl:string):boolean{
 // Android's WebMessageListener exposes only the sender origin. The legacy bridge
 // exposes the full URL. In both cases a trusted top-level document must be loaded.
 return trustedSite(documentUrl)&&(source===SITE_ORIGIN||trustedSite(source));
}
export function externalTarget(value:string):boolean{
 try{return ['https:','http:','tel:','mailto:','sms:','geo:','whatsapp:'].includes(new URL(value).protocol)}
 catch{return false}
}
export function readWebMessage(raw:string):WebMessage|null{
 if(raw.length>4096)return null;
 try{
  const v=JSON.parse(raw) as Record<string,unknown>;
  if(!v||typeof v!=='object')return null;
  if(v.type==='bootstrap'&&idOK(v.id)&&typeof v.needsSavedState==='boolean')
   return {type:'bootstrap',id:v.id,version:typeof v.version==='string'?v.version:null};
  if(v.type==='location'&&idOK(v.id)&&typeof v.askPermission==='boolean'
    &&(v.track===undefined||typeof v.track==='boolean'))
   return {type:'location',id:v.id,askPermission:v.askPermission,track:v.track===true};
  if(v.type==='location-cancel'&&idOK(v.id))return {type:'location-cancel',id:v.id};
   if(v.type==='driver-location-start'&&idOK(v.id)&&typeof v.askPermission==='boolean')return {type:'driver-location-start',id:v.id,askPermission:v.askPermission};
   if(v.type==='driver-location-stop'&&idOK(v.id))return {type:'driver-location-stop',id:v.id};
  if(v.type==='driver-speak'&&idOK(v.id)&&typeof v.text==='string'&&v.text.trim()&&v.text.length<=240&&(v.language==='ar'||v.language==='en'))
   return {type:'driver-speak',id:v.id,text:v.text,language:v.language};
  if(v.type==='driver-speech-stop')return {type:'driver-speech-stop'};
  if(v.type==='driver-voice-setup')return {type:'driver-voice-setup'};
  if(v.type==='ride-share-start'&&idOK(v.id)&&uuid(v.rideId)&&uuid(v.secret))return {type:v.type,id:v.id,rideId:v.rideId,secret:v.secret};
  if(v.type==='ride-share-stop'&&idOK(v.id)&&uuid(v.rideId))return {type:v.type,id:v.id,rideId:v.rideId};
  if(v.type==='ride-share-status'&&idOK(v.id))return {type:v.type,id:v.id};
  if((v.type==='ride-maps'||v.type==='ride-yandex'||v.type==='ride-osmand')&&idOK(v.id)&&typeof v.latitude==='number'&&Math.abs(v.latitude)<=90
   &&typeof v.longitude==='number'&&Math.abs(v.longitude)<=180&&typeof v.adjacent==='boolean')
   return {type:v.type,id:v.id,latitude:v.latitude,longitude:v.longitude,adjacent:v.adjacent};
  if(v.type==='location-settings'&&idOK(v.id))return {type:'location-settings',id:v.id};
  if(v.type==='alerts-enable'&&idOK(v.id))return {type:'alerts-enable',id:v.id};
  if(v.type==='notify'&&idOK(v.id)&&typeof v.title==='string'&&v.title.length<=200&&typeof v.body==='string'&&v.body.length<=1000)
   return {type:'notify',id:v.id,title:v.title,body:v.body};
  if(v.type==='status'&&typeof v.safeToReload==='boolean'&&typeof v.canGoBack==='boolean')
   return {type:'status',safeToReload:v.safeToReload,canGoBack:v.canGoBack,
     ...((v.language==='ar'||v.language==='en')?{language:v.language}:{}),
     ...(v.signedOut===true?{signedOut:true as const}:{}),
     ...((v.theme==='system'||v.theme==='light'||v.theme==='dark')?{theme:v.theme}:{})};
  if(v.type==='refresh')return {type:'refresh'};
  if(v.type==='back-default')return {type:'back-default'};
 }catch{}
 return null;
}
const js=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
export function eventScript(name:string,detail:unknown):string{
 return 'window.dispatchEvent(new CustomEvent('+js(name)+',{detail:'+js(detail)+'}));true;';
}
export function bootstrapScript(id:string,granted:boolean,driverSpeech=false,driverVoiceSetup=false):string{
 return 'window.__YALLA_DRIVER_LOCATION_STREAM__=true;window.__YALLA_DRIVER_SPEECH__='+js(driverSpeech)+';window.__YALLA_DRIVER_VOICE_SETUP__='+js(driverVoiceSetup)+';window.__YALLA_NATIVE_LOCATION_GRANTED__='+js(granted)+';'
  +eventScript('yalla:native-bootstrap',{id,savedState:null,locationGranted:granted})
  +eventScript('yalla:native-location-permission',{granted});
}
export type PositionPoint={latitude:number;longitude:number};
export function autoFixScript(point:PositionPoint,time:number):string{
 const payload={point,time};
 return 'window.__YALLA_NATIVE_AUTOFIX__='+js(payload)+';'
  +eventScript('yalla:native-autofix',payload);
}
export type PositionResponse={
 id:string;point:PositionPoint|null;
 error?:'permission'|'accuracy'|'services'|'position'|'timeout';
 fix?:{accuracy:number;time:number};
};
export function positionScript(response:PositionResponse):string{
 return eventScript('yalla:native-position',response);
}
export function diagnosticScript(value:unknown):string{
 return 'window.__YALLA_GPS_STATUS__='+js(value)+';'+eventScript('yalla:gps-status',value);
}
