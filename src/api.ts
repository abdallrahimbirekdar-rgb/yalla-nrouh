import {isCoordinate,type Coordinate} from './geo.ts';
export interface Place {id:string;label:string;coordinate:Coordinate}
export class ServiceError extends Error {
  code:'not_configured'|'invalid_url'|'network'|'timeout'|'response'|'unauthorized'|'busy';
  constructor(code:ServiceError['code']){super(code);this.code=code;this.name='ServiceError'}
}
export function normalizeServiceUrl(value:string|undefined):string|null {
  if(!value?.trim())return null;
  try{const url=new URL(value.trim());if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();return url.toString().replace(/\/$/,'')}catch{throw new ServiceError('invalid_url')}
}
export function parsePlaces(value:unknown):Place[] {
  if(!value||typeof value!=='object'||!Array.isArray((value as {places:unknown}).places))throw new ServiceError('response');
  const places=(value as {places:unknown[]}).places;
  if(places.length>20)throw new ServiceError('response');
  const seen=new Set<string>();
  return places.map(p=>{if(!p||typeof p!=='object')throw new ServiceError('response');const place=p as Place;
    if(typeof place.id!=='string'||!place.id||place.id.length>200||seen.has(place.id)||typeof place.label!=='string'||!place.label.trim()||place.label.length>200||!isCoordinate(place.coordinate))throw new ServiceError('response');seen.add(place.id);
    return {id:place.id,label:place.label.trim(),coordinate:{latitude:place.coordinate.latitude,longitude:place.coordinate.longitude}};
  });
}
export function createPlacesClient(baseUrl:string|undefined,fetcher:typeof fetch=fetch,timeoutMs=12000){
  return {async search(query:string,language:'ar'|'en',region:number,signal?:AbortSignal):Promise<Place[]>{
    const base=normalizeServiceUrl(baseUrl);if(!base)throw new ServiceError('not_configured');
    if(query.trim().length<3||query.length>200||!Number.isInteger(region)||region<0||region>13)throw new ServiceError('response');
    const abort=new AbortController();const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)abort.abort();
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;abort.abort()},timeoutMs);
    try {
      const url=base+'/v1/places/search?q='+encodeURIComponent(query.trim())+'&language='+language+'&region='+region;
      const response=await fetcher(url,{signal:abort.signal,headers:{Accept:'application/json'},credentials:'omit',redirect:'error'});
      if(response.status===401||response.status===403)throw new ServiceError('unauthorized');
      if(!response.ok)throw new ServiceError('network');
      let body:unknown;try{body=await response.json()}catch{throw new ServiceError('response')}
      return parsePlaces(body);
    }catch(error){if(error instanceof ServiceError)throw error;if(timedOut)throw new ServiceError('timeout');throw new ServiceError('network')}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
  }};
}
