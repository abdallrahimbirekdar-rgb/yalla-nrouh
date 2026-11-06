export const SITE_URL='https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/';
export function isSiteUrl(value:string){try{const url=new URL(value);return url.origin==='https://abdallrahimbirekdar-rgb.github.io'&&!url.username&&!url.password&&(url.pathname==='/yalla-nrouh'||url.pathname.startsWith('/yalla-nrouh/'))}catch{return false}}
export function externalLink(value:string){try{return ['https:','http:','tel:','mailto:','sms:','whatsapp:','geo:'].includes(new URL(value).protocol)}catch{return false}}
export function buildVersion(value:unknown):string|null{return typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value)?value:null}
export type ShellMessage={type:'bootstrap';id:string;needsSavedState:boolean;version:string|null}|{type:'status';safeToReload:boolean;canGoBack:boolean;language?:'ar'|'en';theme?:'system'|'light'|'dark'}|{type:'refresh'}|{type:'back-default'}|{type:'location-settings';id:string}|{type:'alerts-enable';id:string}|{type:'notify';id:string;title:string;body:string}|{type:'driver-location-start';id:string;askPermission:boolean}|{type:'driver-location-stop';id:string}|{type:'location';id:string;askPermission:boolean;track?:true};
export function readShellMessage(raw:string):ShellMessage|null{
 if(raw.length>4096)return null;
 try{const value=JSON.parse(raw);if(value?.type==='bootstrap'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.needsSavedState==='boolean')return {type:'bootstrap',id:value.id,needsSavedState:value.needsSavedState,version:buildVersion(value.version)};
 if(value?.type==='status'&&typeof value.safeToReload==='boolean'&&typeof value.canGoBack==='boolean')return {type:'status',safeToReload:value.safeToReload,canGoBack:value.canGoBack,...(['ar','en'].includes(value.language)?{language:value.language}:{}),...(['system','light','dark'].includes(value.theme)?{theme:value.theme}:{})};
 if(value?.type==='location-settings'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id))return {type:'location-settings',id:value.id};
 if(value?.type==='alerts-enable'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id))return {type:'alerts-enable',id:value.id};
 if(value?.type==='notify'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.title==='string'&&value.title.length<=200&&typeof value.body==='string'&&value.body.length<=1000)return {type:'notify',id:value.id,title:value.title,body:value.body};
 if(value?.type==='driver-location-start'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.askPermission==='boolean')return {type:value.type,id:value.id,askPermission:value.askPermission};
 if(value?.type==='driver-location-stop'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id))return {type:value.type,id:value.id};
 if(value?.type==='location'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.askPermission==='boolean'&&(value.track===undefined||typeof value.track==='boolean'))return {type:'location',id:value.id,askPermission:value.askPermission,...(value.track===true?{track:true as const}:{})};
 if(value?.type==='refresh')return {type:'refresh'};
 if(value?.type==='back-default')return {type:'back-default'};
 }catch{}return null;
}
export function bootstrapScript(id:string,savedState:string|null,locationGranted:boolean,driverLocationStream=false){
 const value=JSON.stringify({id,savedState,locationGranted}).replace(/</g,'\\u003c');
 return `window.__YALLA_DRIVER_LOCATION_STREAM__=${driverLocationStream};window.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:${value}}));true;`;
}

export function resultScript(id:string,ok:boolean){return `window.dispatchEvent(new CustomEvent('yalla:native-result',{detail:${JSON.stringify({id,ok})}}));true;`}

/** Send coordinates to the trusted website as serialized data, never executable input. */
export function locationScript(id:string,point:{latitude:number;longitude:number}|null,error?:string,fix?:{accuracy:number|null;time:number}){
 const clean=point&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180?point:null;
 const code=typeof error==='string'&&['permission','accuracy','services','position','timeout'].includes(error)?error:null;
 // Accuracy is verified by the fare meter; never invent it.
 const safeFix=clean&&fix&&typeof fix.accuracy==='number'&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&Number.isFinite(fix.time)&&fix.time>0?{accuracy:fix.accuracy,time:fix.time}:null;
 const value=JSON.stringify({id,point:clean,error:code,...(safeFix?{fix:safeFix}:{})}).replace(/</g,'\\u003c');
 return `window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:${value}}));true;`;
}
