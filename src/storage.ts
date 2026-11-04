import Storage from 'expo-sqlite/kv-store';
import {loadRecoverable} from './persistence';
const key='yalla-nrouh-demo-v1';
let recovered=false;
export const load=async()=>{const result=await loadRecoverable(k=>Storage.getItem(k),(k,v)=>Storage.setItem(k,v),key);recovered=result.recovered;return result.raw};
export const getMigrationPending=()=>false;
export const getLoadNotice=()=>recovered;
export const save=(value:string)=>Storage.setItem(key,value);
