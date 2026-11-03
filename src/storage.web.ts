const key='yalla-nrouh-demo-v1';
export const load=async()=>globalThis.localStorage.getItem(key);
export const save=async(value:string)=>globalThis.localStorage.setItem(key,value);
