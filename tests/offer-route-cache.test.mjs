import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferRouteCache} from '../src/offer-route-cache.ts';
const from={latitude:51.4,longitude:7.2},to={latitude:51.5,longitude:7.3};
const routes={trip:{from,to,meters:15000,seconds:1200,points:[from,to],steps:[],provider:'Google Maps'},pickup:null};
test('offer reuse is scoped to account, ride and language; expiry and endpoint edits miss',()=>{
 const cache=createOfferRouteCache(1000);const key=JSON.stringify(['driver1','ride1','ar']);
 cache.set(key,routes,100);
 assert.deepEqual(cache.get(key,from,to,101),routes);
 for(const other of [['driver2','ride1','ar'],['driver1','ride2','ar'],['driver1','ride1','en']])assert.equal(cache.get(JSON.stringify(other),from,to,101),null);
 assert.equal(cache.get(key,from,to,1100),null);
 cache.set(key,routes,1200);
 assert.equal(cache.get(key,from,{...to,latitude:51.6},1201),null);
});
test('offer cache stays bounded and replaces old plans',()=>{
 const cache=createOfferRouteCache(1000,2);
 for(const key of ['one','two','three'])cache.set(key,routes,100);
 assert.equal(cache.get('one',from,to,101),null);
 cache.set('two',{...routes,trip:{...routes.trip,meters:16000}},101);
 assert.equal(cache.get('two',from,to,102).trip.meters,16000);
});
