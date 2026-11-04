export const SITE_URL='https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/';
export function isSiteUrl(value:string){try{const url=new URL(value);return url.origin==='https://abdallrahimbirekdar-rgb.github.io'&&!url.username&&!url.password&&(url.pathname==='/yalla-nrouh'||url.pathname.startsWith('/yalla-nrouh/'))}catch{return false}}
export function externalLink(value:string){try{return ['https:','http:','tel:','mailto:','sms:','whatsapp:','geo:'].includes(new URL(value).protocol)}catch{return false}}
export function buildVersion(value:unknown):string|null{return typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value)?value:null}
export type ShellMessage={type:'bootstrap';id:string;needsSavedState:boolean;version:string|null}|{type:'status';safeToReload:boolean;canGoBack:boolean;language?:'ar'|'en';theme?:'system'|'light'|'dark'}|{type:'refresh'}|{type:'back-default'}|{type:'alerts-enable';id:string}|{type:'notify';id:string;title:string;body:string};
export function readShellMessage(raw:string):ShellMessage|null{
 if(raw.length>4096)return null;
 try{const value=JSON.parse(raw);if(value?.type==='bootstrap'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.needsSavedState==='boolean')return {type:'bootstrap',id:value.id,needsSavedState:value.needsSavedState,version:buildVersion(value.version)};
 if(value?.type==='status'&&typeof value.safeToReload==='boolean'&&typeof value.canGoBack==='boolean')return {type:'status',safeToReload:value.safeToReload,canGoBack:value.canGoBack,...(['ar','en'].includes(value.language)?{language:value.language}:{}),...(['system','light','dark'].includes(value.theme)?{theme:value.theme}:{})};
 if(value?.type==='alerts-enable'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id))return {type:'alerts-enable',id:value.id};
 if(value?.type==='notify'&&typeof value.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(value.id)&&typeof value.title==='string'&&value.title.length<=200&&typeof value.body==='string'&&value.body.length<=1000)return {type:'notify',id:value.id,title:value.title,body:value.body};
 if(value?.type==='refresh')return {type:'refresh'};
 if(value?.type==='back-default')return {type:'back-default'};
 }catch{}return null;
}
export function bootstrapScript(id:string,savedState:string|null,locationGranted:boolean){
 const value=JSON.stringify({id,savedState,locationGranted}).replace(/</g,'\\u003c');
 return `window.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:${value}}));true;`;
}

export function resultScript(id:string,ok:boolean){return `window.dispatchEvent(new CustomEvent('yalla:native-result',{detail:${JSON.stringify({id,ok})}}));true;`}
