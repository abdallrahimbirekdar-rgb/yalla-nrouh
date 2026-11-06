type Store={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>};
type Permission={granted:boolean;canAskAgain:boolean};

/** Record setup before opening the system dialog, even if it is dismissed. */
export async function setupPermission<T extends Permission>(store:Store,key:string,read:()=>Promise<T>,request:()=>Promise<T>):Promise<T>{
 const current=await read();
 if(await store.getItem(key)==='done')return current;
 await store.setItem(key,'done');
 return current.granted||!current.canAskAgain?current:request();
}
