import {isCoordinate,type Coordinate} from './geo.ts';
import {normalizeServiceUrl,ServiceError} from './api.ts';
export interface RouteStep {instruction:string;meters:number}
export interface RoutePlan {from:Coordinate;to:Coordinate;meters:number;seconds:number;points:Coordinate[];steps:RouteStep[];provider:'Google Maps'}
export function parseRoute(value:unknown,from:Coordinate,to:Coordinate):RoutePlan {
 const body=value as {routes?:{distanceMeters:number;duration:string;polyline:{geoJsonLinestring:{type:string;coordinates:unknown[]}};legs:{steps:{distanceMeters?:number;navigationInstruction?:{instructions?:string}}[]}[]}[]};
 const route=body?.routes?.[0];
 if(!route||!Number.isFinite(route.distanceMeters)||route.distanceMeters<0||route.distanceMeters>3e6||typeof route.duration!=='string'||!/^\d+(?:\.\d+)?s$/.test(route.duration))throw new ServiceError('response');
 const seconds=Number(route.duration.slice(0,-1));const line=route.polyline?.geoJsonLinestring;
 if(!Number.isFinite(seconds)||seconds>604800||line?.type!=='LineString'||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.length>8000||!Array.isArray(route.legs)||route.legs.length!==1||!Array.isArray(route.legs[0].steps)||route.legs[0].steps.length>1500)throw new ServiceError('response');
 const points=line.coordinates.map(pair=>{if(!Array.isArray(pair)||pair.length!==2||!isCoordinate({latitude:pair[1],longitude:pair[0]}))throw new ServiceError('response');return {latitude:pair[1] as number,longitude:pair[0] as number};});
 const steps=route.legs[0].steps.map(s=>{const meters=s.distanceMeters??0,instruction=s.navigationInstruction?.instructions??'';if(!Number.isFinite(meters)||meters<0||typeof instruction!=='string'||instruction.length>1000)throw new ServiceError('response');return {meters,instruction};});
 return {from:{...from},to:{...to},meters:route.distanceMeters,seconds,points,steps,provider:'Google Maps'};
}
let lastRequest=0;
// A protected server proxy is required. Never put a Routes server key in the app.
export function createRoutingClient(proxyUrl:string|undefined,fetcher:typeof fetch=fetch,timeout=15000){return {async route(from:Coordinate,to:Coordinate,signal?:AbortSignal,language='ar'):Promise<RoutePlan>{
 const base=normalizeServiceUrl(proxyUrl);if(!base)throw new ServiceError('not_configured');if(!isCoordinate(from)||!isCoordinate(to))throw new ServiceError('response');if(Date.now()-lastRequest<1500)throw new ServiceError('busy');lastRequest=Date.now();
 const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeout);
 try{const response=await fetcher(base+'/v1/google/routes',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({origin:from,destination:to,languageCode:language}),credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok)throw new ServiceError('network');return parseRoute(await response.json(),from,to);}catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError('network');}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }};}
