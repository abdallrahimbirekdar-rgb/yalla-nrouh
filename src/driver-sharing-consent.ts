type DriverSharingConsent={allowed:boolean;attemptedRide?:string};
type ConsentStorage=Pick<Storage,'getItem'|'setItem'>;
const key=(owner:string)=>'yn-driver-sharing-v1:'+owner;

export function readDriverSharingConsent(storage:ConsentStorage,owner:string):DriverSharingConsent{
 try{
  const saved=JSON.parse(storage.getItem(key(owner))??'null');
  if(saved?.allowed===true)return {allowed:true,attemptedRide:typeof saved.attemptedRide==='string'?saved.attemptedRide:undefined};
 }catch{/* Consent is opt-in even if storage is unavailable. */}
 return {allowed:false};
}

export function saveDriverSharingConsent(storage:ConsentStorage,owner:string,value:DriverSharingConsent):boolean{
 try{storage.setItem(key(owner),JSON.stringify(value));return true}catch{return false}
}

export function claimDriverSharingAttempt(storage:ConsentStorage,owner:string,rideId:string):boolean{
 const saved=readDriverSharingConsent(storage,owner);
 if(!saved.allowed||saved.attemptedRide===rideId)return false;
 // Write before starting so a manual stop, a notification stop or a reload
 // cannot silently restart sharing for this ride.
 return saveDriverSharingConsent(storage,owner,{allowed:true,attemptedRide:rideId});
}


export function shouldShareDriverInForeground(
 consent:DriverSharingConsent,rideId:string,backgroundAvailable:boolean,backgroundStartFailed:boolean,
):boolean{
 if(!consent.allowed)return false;
 // A recorded attempt might have ended with an explicit Android notification stop.
 return backgroundStartFailed||(!backgroundAvailable&&consent.attemptedRide!==rideId);
}
