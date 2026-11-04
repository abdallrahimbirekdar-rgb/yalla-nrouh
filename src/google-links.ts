import {isCoordinate,type Coordinate} from './geo.ts';
export function googleDirections(destination:Coordinate|string,origin?:Coordinate|string,navigate=false):string {
 const text=(value:Coordinate|string)=>{if(typeof value==='string'){if(!value.trim()||value.length>200)throw Error('Invalid address');return value.trim();}if(!isCoordinate(value))throw Error('Invalid coordinate');return value.latitude.toFixed(6)+','+value.longitude.toFixed(6);};
 const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',text(destination));url.searchParams.set('travelmode','driving');if(origin!==undefined)url.searchParams.set('origin',text(origin));if(navigate)url.searchParams.set('dir_action','navigate');return url.toString();
}
