import {cloudCurrentToken,cloudRemoveDriverPush} from './cloud-api';
export const driverPushKey=(owner:string)=>'yalla-driver-push:'+owner;
export function savedDriverPushToken(owner:string){
 try{return localStorage.getItem(driverPushKey(owner))}catch{return null}
}
export async function removeDriverPush(owner:string){
 const token=savedDriverPushToken(owner);
 if(!token)return;
 await cloudRemoveDriverPush(await cloudCurrentToken(),token);
 localStorage.removeItem(driverPushKey(owner));
}
