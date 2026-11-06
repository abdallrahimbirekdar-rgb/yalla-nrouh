import {isCoordinate,type Coordinate} from '../geo.ts';
import type {Place} from '../api.ts';
type Detail={location?:{lat:()=>number;lng:()=>number};fetchFields:(request:{fields:string[]})=>Promise<unknown>};
type PredictionText={toString:()=>string};
type Prediction={placeId:string;text:PredictionText;mainText?:PredictionText|null;secondaryText?:PredictionText|null;toPlace:()=>Detail};
export interface AutocompleteLibrary {
 AutocompleteSessionToken:new()=>object;
 AutocompleteSuggestion:{fetchAutocompleteSuggestions:(request:Record<string,unknown>)=>Promise<{suggestions:{placePrediction?:Prediction|null}[]}>};
}
export interface PlaceSuggestion {id:string;label:string;primary:string;secondary?:string;select:()=>Promise<Place>}
export function createPlaceAutocomplete(load:(language:string)=>Promise<AutocompleteLibrary>){
 let session:object|null=null;
 return {
  reset(){session=null},
  async search(input:string,language:string,near?:Coordinate):Promise<PlaceSuggestion[]>{
   if(input.trim().length<3)return [];
   const library=await load(language);const token=session??(session=new library.AutocompleteSessionToken());
   const {suggestions}=await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({input:input.trim(),language,sessionToken:token,...(near&&isCoordinate(near)?{locationBias:{center:{lat:near.latitude,lng:near.longitude},radius:10000}}:{})});
   return suggestions.slice(0,5).flatMap(({placePrediction:p})=>{
    if(!p?.placeId||!p.text)return [];
    const label=p.text.toString().slice(0,200);
    return [{id:p.placeId,label,primary:p.mainText?.toString()||label,secondary:p.secondaryText?.toString(),async select(){
     if(session===token)session=null;
     const detail=p.toPlace();await detail.fetchFields({fields:['location']});
     const coordinate={latitude:detail.location?.lat()??NaN,longitude:detail.location?.lng()??NaN};
     if(!isCoordinate(coordinate))throw Error('place_location_unavailable');
     return {id:p.placeId,label,coordinate};
    }}];
   });
  }
 };
}
