import {validTariff,type Tariff} from './meter.ts';
import {isCoordinate,type Coordinate} from './geo.ts';
import {normalizeServiceUrl,ServiceError} from './api.ts';
export interface RouteStep {instruction:string;meters:number}
export interface RoutePlan {from:Coordinate;to:Coordinate;meters:number;seconds:number;points:Coordinate[];steps:RouteStep[];provider:'Google Maps';tariff?:Tariff}
export function parseRoute(value:unknown,from:Coordinate,to:Coordinate):RoutePlan {
 const body=value as {routes?:{distanceMeters:number;duration:string;polyline:{geoJsonLinestring:{type:string;coordinates:unknown[]}};legs:{steps:{distanceMeters?:number;navigationInstruction?:{instructions?:string}}[]}[]}[]};
 const route=body?.routes?.[0];
 if(!route||!Number.isFinite(route.distanceMeters)||route.distanceMeters<0||route.distanceMeters>3e6||typeof route.duration!=='string'||!/^\d+(?:\.\d+)?s$/.test(route.duration))throw new ServiceError('response');
 const seconds=Number(route.duration.slice(0,-1));const line=route.polyline?.geoJsonLinestring;
 if(!Number.isFinite(seconds)||seconds>604800||line?.type!=='LineString'||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.length>8000||!Array.isArray(route.legs)||route.legs.length!==1||!Array.isArray(route.legs[0].steps)||route.legs[0].steps.length>1500)throw new ServiceError('response');
 const points=line.coordinates.map(pair=>{if(!Array.isArray(pair)||pair.length!==2||!isCoordinate({latitude:pair[1],longitude:pair[0]}))throw new ServiceError('response');return {latitude:pair[1] as number,longitude:pair[0] as number};});
 const steps=route.legs[0].steps.map(s=>{const meters=s.distanceMeters??0,instruction=s.navigationInstruction?.instructions??'';if(!Number.isFinite(meters)||meters<0||typeof instruction!=='string'||instruction.length>1000)throw new ServiceError('response');return {meters,instruction};});
 const tariff=(value as {tariff?:unknown})?.tariff;if(tariff!==undefined&&!validTariff(tariff))throw new ServiceError('response');
 return {...(tariff?{tariff}:{}),from:{...from},to:{...to},meters:route.distanceMeters,seconds,points,steps,provider:'Google Maps'};
}
let lastRequest=0;
// A protected server proxy is required. Never put a Routes server key in the app.
export function parseDriverOffer(value:unknown,driver:Coordinate,pickup:Coordinate,destination:Coordinate):{pickup:RoutePlan|null;trip:RoutePlan}{
 const data=value as {routes?:{legs?:unknown[]}[];tariff?:unknown};
 const legs=data?.routes?.[0]?.legs;
 if(!Array.isArray(legs)||legs.length!==2)throw new ServiceError('response');
 const leg=(index:number,from:Coordinate,to:Coordinate)=>{
  const part=legs[index] as Record<string,unknown>|null;
  if(!part||typeof part!=='object')throw new ServiceError('response');
  return parseRoute({routes:[{...part,legs:[part]}],tariff:data.tariff},from,to);
 };
 const trip=leg(1,pickup,destination);
 const approach=legs[0] as {distanceMeters?:unknown;duration?:unknown}|null;
 // Google can omit the zero distance and geometry when the driver is already at pickup.
 if(approach?.duration==='0s'&&(approach.distanceMeters===undefined||approach.distanceMeters===0)){
  return {pickup:{from:{...driver},to:{...pickup},meters:0,seconds:0,points:[{...pickup}],steps:[],provider:'Google Maps'},trip};
 }
 try{return {pickup:leg(0,driver,pickup),trip}}
 catch(error){
  if(!(error instanceof ServiceError)||error.code!=='response')throw error;
  return {pickup:null,trip};
 }
}
export function createRoutingClient(proxyUrl:string|undefined,fetcher:typeof fetch=fetch,timeout=15000){
 async function request(from:Coordinate,to:Coordinate,signal?:AbortSignal,language='ar',token?:string,pickup?:Coordinate):Promise<unknown>{
 const base=normalizeServiceUrl(proxyUrl);if(!base)throw new ServiceError('not_configured');if(!isCoordinate(from)||!isCoordinate(to)||pickup!==undefined&&!isCoordinate(pickup))throw new ServiceError('response');if(Date.now()-lastRequest<1500)throw new ServiceError('busy');lastRequest=Date.now();
 const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeout);
 try{const response=await fetcher(base+'/v1/google/routes',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({origin:from,destination:to,languageCode:language,...(pickup?{pickup}:{})}),credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok){if(response.status===401)throw new ServiceError('unauthorized');if(response.status===429)throw new ServiceError('busy');if(response.status===503)throw new ServiceError('not_configured');if(response.status===502)throw new ServiceError('not_enabled');if(response.status===422)throw new ServiceError('no_route');throw new ServiceError('network');}return response.json();}catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError('network');}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 return {
  async route(from:Coordinate,to:Coordinate,signal?:AbortSignal,language='ar',token?:string):Promise<RoutePlan>{return parseRoute(await request(from,to,signal,language,token),from,to)},
  async driverOffer(driver:Coordinate,pickup:Coordinate,destination:Coordinate,signal?:AbortSignal,language='ar',token?:string){return parseDriverOffer(await request(driver,destination,signal,language,token,pickup),driver,pickup,destination)},
 };
}
