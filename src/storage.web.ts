import {loadSiteState} from './site-bridge.web';
const key='yalla-nrouh-demo-v1';
export const load=async()=>loadSiteState(globalThis.localStorage,key);
export const save=async(value:string)=>globalThis.localStorage.setItem(key,value);
