export type RidePushTarget={rideId:string;type:'driver-offer'|'passenger-accepted'|'passenger-arrived'};
export function readRidePushTarget(data:unknown):RidePushTarget|null{
 if(!data||typeof data!=='object')return null;
 const {rideId,type}=data as Record<string,unknown>;
 if(typeof rideId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rideId))return null;
 if(type!=='driver-offer'&&type!=='passenger-accepted'&&type!=='passenger-arrived')return null;
 return {rideId,type};
}
