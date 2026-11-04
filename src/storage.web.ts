import {loadSiteState,siteMigrationPending} from './site-bridge.web';
import {loadRecoverable} from './persistence';
const key='yalla-nrouh-demo-v1';
let recovered=false;
export const load=async()=>{await loadSiteState(globalThis.localStorage,key);const result=await loadRecoverable(k=>globalThis.localStorage.getItem(k),(k,v)=>globalThis.localStorage.setItem(k,v),key);recovered=result.recovered;return result.raw};
export const getMigrationPending=siteMigrationPending;
export const getLoadNotice=()=>recovered;
export const save=async(value:string)=>{globalThis.localStorage.setItem(key,value)};
