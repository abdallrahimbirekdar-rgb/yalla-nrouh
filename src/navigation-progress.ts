import type {Coordinate} from './geo.ts';
import type {RoutePlan} from './routing.ts';
const radians=(value:number)=>value*Math.PI/180;
export function distanceMeters(a:Coordinate,b:Coordinate):number{
 const dLat=radians(b.latitude-a.latitude),dLng=radians(b.longitude-a.longitude);
 const h=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function navigationProgress(plan:RoutePlan,position:Coordinate){
 const points=plan.points;let total=0,best=Infinity,along=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];const scale=Math.cos(radians((a.latitude+b.latitude+position.latitude)/3));
  const ax=(a.longitude-position.longitude)*scale,ay=a.latitude-position.latitude;
  const dx=(b.longitude-a.longitude)*scale,dy=b.latitude-a.latitude;const square=dx*dx+dy*dy;
  const fraction=square?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/square)):0;
  const projected={latitude:a.latitude+(b.latitude-a.latitude)*fraction,longitude:a.longitude+(b.longitude-a.longitude)*fraction};
  const gap=distanceMeters(position,projected),length=distanceMeters(a,b);
  if(gap<best){best=gap;along=total+length*fraction}total+=length;
 }
 const ratio=total?Math.max(0,Math.min(1,along/total)):0;
 const traveled=ratio*plan.meters,remainingMeters=Math.max(0,plan.meters-traveled);
 const stepTotal=plan.steps.reduce((sum,step)=>sum+step.meters,0);
 const stepPosition=ratio*stepTotal;let index=0,edge=0;
 while(index<plan.steps.length-1&&edge+plan.steps[index].meters<=stepPosition){edge+=plan.steps[index].meters;index++}
 const step=plan.steps[index];
 return {remainingMeters,remainingSeconds:Math.max(0,plan.seconds*(1-ratio)),offRouteMeters:best,
  instruction:step?.instruction??'',nextInstruction:plan.steps[index+1]?.instruction??'',
  nextTurnMeters:Math.max(0,edge+(step?.meters??0)-stepPosition),
  arrived:distanceMeters(position,plan.to)<=35};
}
