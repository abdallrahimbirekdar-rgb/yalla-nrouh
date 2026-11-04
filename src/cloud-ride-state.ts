type Snapshot={owner:string|null;known:boolean;active:boolean};
let state:Snapshot={owner:null,known:true,active:false};const listeners=new Set<()=>void>();
const publish=()=>{for(const listener of listeners)listener()};
export const readRideState=()=>state;
export function subscribeRideState(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function setRideOwner(owner:string|null){if(state.owner===owner)return;state={owner,known:!owner,active:false};publish()}
export function receiveRideState(owner:string|null,rides:{status:string}[]){if(!owner||owner!==state.owner)return;state={owner,known:true,active:rides.some(r=>!['completed','cancelled'].includes(r.status))};publish()}
