import type {Coordinate} from '../geo.ts';
import {governorates} from './syria-governorates.ts';

function insideRing({latitude,longitude}:Coordinate,ring:[number,number][]){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i], [previousX,previousY]=ring[j];
  if((y>latitude)!==(previousY>latitude)
    && longitude<(previousX-x)*(latitude-y)/(previousY-y)+x)inside=!inside;
 }
 return inside;
}

export function pickupRegion(point:Coordinate):number{
 const region=governorates.findIndex(polygons=>polygons.some(([outer,...holes])=>
  insideRing(point,outer)&&!holes.some(hole=>insideRing(point,hole))));
 // Keep the Damascus test fleet available for coordinates outside Syria.
 return region===-1?0:region;
}
