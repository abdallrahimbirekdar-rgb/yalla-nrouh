export type ResumeRide={id:string;status:'requested'|'accepted'|'arrived'|'riding'};
const key=(owner:string)=>'yalla-active-ride:'+owner;
export const resumable=(value:unknown):value is ResumeRide=>{
 if(!value||typeof value!=='object')return false;
 const {id,status}=value as Partial<ResumeRide>;
 return typeof id==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)&&
  (status==='requested'||status==='accepted'||status==='arrived'||status==='riding');
};
export function readResumeRide(owner:string):ResumeRide|null{
 try{const value:unknown=JSON.parse(localStorage.getItem(key(owner))??'null');return resumable(value)?value:null}
 catch{return null}
}
export function saveResumeRide(owner:string,ride:ResumeRide|null){
 try{
  if(ride)localStorage.setItem(key(owner),JSON.stringify({id:ride.id,status:ride.status}));
  else localStorage.removeItem(key(owner));
 }catch{/* Server results still work when local storage is unavailable. */}
}
