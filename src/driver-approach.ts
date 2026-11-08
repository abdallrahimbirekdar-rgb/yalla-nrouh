import type {Coordinate} from './geo.ts';

/** Only recent, measured driver positions may appear as a live taxi marker. */
export function liveDriverFix(fix:{point:Coordinate;time:number}|null,now=Date.now()){
 if(!fix||!Number.isFinite(fix.time)||fix.time>now+3000||now-fix.time>=30000)return null;
 return fix;
}

/** A Google street route wins; a direct line is only a labelled fallback. */
export function driverApproachPath(
 fix:{point:Coordinate;time:number}|null,
 meetingPoint:Coordinate,
 streetRoute:Coordinate[]|undefined,
){
 if(!fix)return {path:undefined,fallback:false};
 if(streetRoute&&streetRoute.length>1)return {path:streetRoute,fallback:false};
 return {path:[fix.point,meetingPoint],fallback:true};
}
