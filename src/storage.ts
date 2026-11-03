import Storage from 'expo-sqlite/kv-store';
const key='yalla-nrouh-demo-v1';
export const load=()=>Storage.getItem(key);
export const save=(value:string)=>Storage.setItem(key,value);
