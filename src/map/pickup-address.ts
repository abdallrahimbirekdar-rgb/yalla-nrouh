import type {Coordinate} from '../geo';
import {loadGoogleMaps,webMapsKey,type LatLng} from './google-web';

type GeocodeResult={formatted_address:string;types:string[]};
type GeocodingLibrary={Geocoder:new()=>{geocode:(request:{location:LatLng;fulfillOnZeroResults:true})=>Promise<{results:GeocodeResult[]}>}};

export async function createPickupAddressLookup(language:string){
 const maps=await loadGoogleMaps(webMapsKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY),language);
 if(!maps.importLibrary)throw Error('geocoding_unavailable');
 const {Geocoder}=await maps.importLibrary('geocoding') as GeocodingLibrary;
 const geocoder=new Geocoder();
 return async ({latitude,longitude}:Coordinate)=>{
  const {results}=await geocoder.geocode({location:{lat:latitude,lng:longitude},fulfillOnZeroResults:true});
  return results.find(result=>result.formatted_address.trim()&&!result.types.includes('plus_code'))?.formatted_address.trim()??null;
 };
}
