import {loadGoogleMaps,webMapsKey} from './google-web';
import {isCoordinate,type Coordinate} from '../geo';
import type {Place} from '../api';
type GooglePlace={id:string;displayName?:string;formattedAddress?:string;location?:{lat:()=>number;lng:()=>number}};
export async function searchGooglePlaces(query:string,language:string,near?:Coordinate):Promise<Place[]> {
 const maps=await loadGoogleMaps(webMapsKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY),language);
 if(!maps.importLibrary)throw Error('places_unavailable');
 const library=await maps.importLibrary('places') as {Place:{searchByText:(request:Record<string,unknown>)=>Promise<{places:GooglePlace[]}>}};
 const {places}=await library.Place.searchByText({textQuery:query.trim(),fields:['id','displayName','formattedAddress','location'],language,maxResultCount:10,...(near?{locationBias:{center:{lat:near.latitude,lng:near.longitude},radius:10000}}:{})});
 return places.flatMap(p=>{const coordinate={latitude:p.location?.lat()??NaN,longitude:p.location?.lng()??NaN};return isCoordinate(coordinate)?[{id:p.id,label:[p.displayName,p.formattedAddress].filter(Boolean).join(' · ').slice(0,200),coordinate}]:[]});
}
