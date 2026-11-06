import {ServiceError} from './api.ts';
import {isCoordinate,type Coordinate} from './geo.ts';
import type {RoutePlan,RouteStep} from './routing.ts';

export interface ValhallaStep extends RouteStep { shapeIndex:number }
export interface ValhallaPlan extends Omit<RoutePlan,'provider'|'steps'|'tariff'> {
 provider:'Valhalla';
 steps:ValhallaStep[];
}
export type DriverRoutePlan=RoutePlan|ValhallaPlan;

const demo='https://valhalla1.openstreetmap.de/route';
const pilotFingerprint='3503b7f26356e216e1e602aadc112be4e53299dc60f2466ca97a9ba8c9f53f52';

export async function isValhallaPilotDriver(userId:string){
 if(!globalThis.crypto?.subtle)return false;
 const bytes=new TextEncoder().encode(userId);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')===pilotFingerprint;
}

function decodeShape(shape:string):Coordinate[]{
 if(typeof shape!=='string'||!shape||shape.length>200000)throw new ServiceError('response');
 let index=0,latitude=0,longitude=0;
 const points:Coordinate[]=[];
 const read=()=>{
  let value=0,shift=0;
  while(index<shape.length&&shift<=25){
   const digit=shape.charCodeAt(index++)-63;
   if(digit<0||digit>63)break;
   value+=(digit&31)*2**shift;
   if(digit<32)return value%2?-(value+1)/2:value/2;
   shift+=5;
  }
  throw new ServiceError('response');
 };
 while(index<shape.length){
  latitude+=read();longitude+=read();
  const point={latitude:latitude/1e6,longitude:longitude/1e6};
  if(!isCoordinate(point)||points.length>=16000)throw new ServiceError('response');
  points.push(point);
 }
 if(points.length<2)throw new ServiceError('response');
 return points;
}

const arabic:Record<number,string>={
 1:'انطلق',2:'انطلق',3:'انطلق',4:'اقتربت من الوجهة',5:'الوجهة على اليمين',6:'الوجهة على اليسار',
 7:'تابع السير',8:'تابع للأمام',9:'انعطف قليلًا يمينًا',10:'انعطف يمينًا',11:'انعطف يمينًا بزاوية حادة',
 12:'استدر للعودة',13:'استدر للعودة',14:'انعطف يسارًا بزاوية حادة',15:'انعطف يسارًا',16:'انعطف قليلًا يسارًا',
 17:'خذ المدخل',18:'خذ المدخل على اليمين',19:'خذ المدخل على اليسار',20:'خذ المخرج على اليمين',
 21:'خذ المخرج على اليسار',22:'تابع للأمام',23:'الزم اليمين',24:'الزم اليسار',25:'اندمج مع الطريق',
 26:'ادخل الدوّار',27:'اخرج من الدوّار',28:'اصعد إلى العبّارة',29:'اخرج من العبّارة',
 37:'اندمج إلى اليمين',38:'اندمج إلى اليسار',
};

export function parseValhallaRoute(value:unknown,from:Coordinate,to:Coordinate,language:'ar'|'en'):ValhallaPlan{
 const trip=(value as {trip?:{status?:number;units?:string;legs?:{shape:string;summary:{length:number;time:number};maneuvers:unknown[]}[]}})?.trip;
 const leg=trip?.legs?.[0];
 if(trip?.status!==0||trip.units!=='kilometers'||trip.legs?.length!==1||!leg||!Array.isArray(leg.maneuvers)||!leg.maneuvers.length||leg.maneuvers.length>1000)throw new ServiceError('response');
 const points=decodeShape(leg.shape);
 const meters=leg.summary?.length*1000,seconds=leg.summary?.time;
 if(!Number.isFinite(meters)||meters<=0||meters>300000||!Number.isFinite(seconds)||seconds<0||seconds>86400)throw new ServiceError('response');
 let previousIndex=-1;
 const steps=leg.maneuvers.map(item=>{
  const m=item as {begin_shape_index:number;instruction:string;length:number;type:number;street_names?:unknown[];roundabout_exit_count?:number}|null;
  if(!m||!Number.isInteger(m.begin_shape_index)||m.begin_shape_index<0||m.begin_shape_index<previousIndex||m.begin_shape_index>=points.length
    ||!Number.isFinite(m.length)||m.length<0||typeof m.instruction!=='string'||!m.instruction||m.instruction.length>700)throw new ServiceError('response');
  previousIndex=m.begin_shape_index;
  let instruction=m.instruction;
  if(language==='ar'&&arabic[m.type]){
   instruction=arabic[m.type];
   const street=Array.isArray(m.street_names)&&typeof m.street_names[0]==='string'?m.street_names[0].slice(0,120):'';
   if(m.type===26&&typeof m.roundabout_exit_count==='number'&&Number.isInteger(m.roundabout_exit_count)&&m.roundabout_exit_count>0)
    instruction+=' وخذ المخرج '+m.roundabout_exit_count;
   if(street&&m.type>6)instruction+=' · '+street;
  }
  return {instruction,meters:m.length*1000,shapeIndex:m.begin_shape_index};
 });
 return {from,to,meters,seconds,points,steps,provider:'Valhalla'};
}

let lastRequest=0;
export async function getValhallaRoute(from:Coordinate,to:Coordinate,language:'ar'|'en',signal:AbortSignal,fetcher:typeof fetch=fetch){
 if(signal.aborted||!isCoordinate(from)||!isCoordinate(to))throw new ServiceError('response');
 if(Date.now()-lastRequest<1500)throw new ServiceError('busy');
 lastRequest=Date.now();
 const query={locations:[from,to].map(({latitude,longitude})=>({lat:latitude,lon:longitude})),costing:'auto',units:'kilometers',language:'en-US'};
 const abort=new AbortController();
 const cancel=()=>abort.abort();
 signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,10000);
 try{
  const response=await fetcher(demo+'?json='+encodeURIComponent(JSON.stringify(query)),{
   credentials:'omit',redirect:'error',cache:'no-store',signal:abort.signal,
   headers:{Accept:'application/json','X-Client-Id':'abdallrahimbirekdar-rgb.github.io/yalla-nrouh-driver-pilot'},
  });
  if(response.status===429)throw new ServiceError('busy');
  if(response.status===400||response.status===404)throw new ServiceError('no_route');
  if(!response.ok)throw new ServiceError('network');
  return parseValhallaRoute(await response.json(),from,to,language);
 }finally{
  clearTimeout(timer);signal.removeEventListener('abort',cancel);
 }
}
