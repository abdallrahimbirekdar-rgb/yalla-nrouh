export function passengerAlertEvent(ride:{
 id:string;driver_id:string|null;status:string;updated_at:string;
},now:number){
 const {id,driver_id,status,updated_at}=ride;
 if(!driver_id||(status!=='accepted'&&status!=='arrived'))return null;
 const age=now-Date.parse(updated_at);
 if(!Number.isFinite(age)||age < -15000||age>120000)return null;
 return {key:id+':'+driver_id+':'+status,status};
}
