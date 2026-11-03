export interface Coordinate {latitude:number;longitude:number}
export function isCoordinate(value:unknown):value is Coordinate {
  if(!value||typeof value!=='object')return false;
  const point=value as Coordinate;
  return Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180;
}
export function parseCoordinate(latitude:string,longitude:string):Coordinate|null {
  const normalize=(value:string)=>value.trim().replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776)).replace(/[٫,]/g,'.').replace(/−/g,'-');
  const lat=normalize(latitude),lon=normalize(longitude);const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if(!numeric.test(lat)||!numeric.test(lon))return null;
  const point={latitude:Number(lat),longitude:Number(lon)};
  return isCoordinate(point)?point:null;
}
export const formatCoordinate=(point:Coordinate)=>`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
export const sameCoordinate=(a:Coordinate,b:Coordinate)=>Math.abs(a.latitude-b.latitude)<0.000001&&Math.abs(a.longitude-b.longitude)<0.000001;
