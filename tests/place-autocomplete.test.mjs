import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaceAutocomplete} from '../src/map/place-autocomplete.ts';
test('typing shares a session, uses a local bias, and only loads coordinates after selection',async()=>{
 const requests=[],fields=[];let tokens=0,details=0;
 const client=createPlaceAutocomplete(async()=>({
  AutocompleteSessionToken:class {id=++tokens},
  AutocompleteSuggestion:{fetchAutocompleteSuggestions:async request=>{requests.push(request);return {suggestions:[{}, {placePrediction:{placeId:'p1',text:{toString:()=> 'شارع تجريبي'},toPlace:()=>{details++;return {location:{lat:()=>51.48,lng:()=>7.21},fetchFields:async request=>fields.push(request.fields)}}}}]}}}
 }));
 assert.deepEqual(await client.search('ab','ar'),[]);assert.equal(tokens,0);
 const first=await client.search('  Post  ','ar',{latitude:51.48,longitude:7.21});
 await client.search('Poststr','ar');
 assert.equal(requests[0].input,'Post');assert.equal(requests[0].language,'ar');
 assert.deepEqual(requests[0].locationBias,{center:{lat:51.48,lng:7.21},radius:10000});
 assert.equal(requests[0].sessionToken,requests[1].sessionToken);assert.equal(details,0);
 assert.deepEqual(await first[0].select(),{id:'p1',label:'شارع تجريبي',coordinate:{latitude:51.48,longitude:7.21}});
 assert.deepEqual(fields,[['location']]);assert.equal(details,1);
 await client.search('next','ar');assert.notEqual(requests[1].sessionToken,requests[2].sessionToken);
 client.reset();await client.search('reset','ar');assert.notEqual(requests[2].sessionToken,requests[3].sessionToken);
});
test('a suggestion with missing coordinates cannot set the destination',async()=>{
 const client=createPlaceAutocomplete(async()=>({AutocompleteSessionToken:class {},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async()=>({suggestions:[{placePrediction:{placeId:'bad',text:{toString:()=> 'No point'},toPlace:()=>({fetchFields:async()=>{}})}}]})}}));
 const items=await client.search('place','en');await assert.rejects(items[0].select(),/place_location_unavailable/);
});
