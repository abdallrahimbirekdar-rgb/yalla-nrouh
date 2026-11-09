import {readResumeRide,resumable,saveResumeRide,type ResumeRide} from './ride-resume.ts';
type Snapshot={owner:string|null;known:boolean;active:boolean;resume:ResumeRide|null};
let state:Snapshot={owner:null,known:true,active:false,resume:null};const listeners=new Set<()=>void>();
const publish=()=>{for(const listener of listeners)listener()};
export const readRideState=()=>state;
export function subscribeRideState(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function setRideOwner(owner:string|null){if(state.owner===owner)return;state={owner,known:!owner,active:false,resume:owner?readResumeRide(owner):null};publish()}
export function receiveRideState(owner:string|null,rides:{status:string;id?:string;passenger_id?:string;driver_id?:string|null}[]){
 if(!owner||owner!==state.owner)return;
 const active=rides.some(r=>!['completed','cancelled'].includes(r.status));
 const current=rides.find(ride=>(ride.passenger_id===owner||ride.driver_id===owner)&&resumable(ride));
 const resume=resumable(current)?{id:current.id,status:current.status}:null;
 saveResumeRide(owner,resume);
 state={owner,known:true,active,resume};publish();
}
export function forgetResumeRide(owner:string,id:string){
 if(state.owner!==owner||state.resume?.id!==id)return;
 saveResumeRide(owner,null);
 state={...state,resume:null};publish();
}
