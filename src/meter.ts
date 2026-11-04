import {isCoordinate,type Coordinate} from './geo.ts';
export interface Tariff {base:number;perKm:number;perMinute:number;minimum:number;updatedAt:string}
export interface Fix extends Coordinate {time:number;accuracy:number}
export interface Meter {startedAt:number;endedAt?:number;meters:number;points:Fix[];lastFix?:Fix;incomplete:boolean;tariff:Tariff|null}
export const GPS_INTERVAL_MS=10000;
export const GPS_DISTANCE_M=20;
export const MAX_ROUTE_POINTS=2000;
export function validTariff(value:unknown):value is Tariff {
 const t=value as Tariff;
 return Boolean(t&&[t.base,t.perKm,t.perMinute,t.minimum].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12)&&Number.isFinite(Date.parse(t.updatedAt)));
}
export function distanceMeters(a:Coordinate,b:Coordinate):number {
 const rad=(n:number)=>n*Math.PI/180;
 const dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
 const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function validFix(value:unknown):value is Fix {
 const p=value as Fix;
 return isCoordinate(p)&&Number.isFinite(p.time)&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=50;
}
export function newMeter(now:number,tariff:Tariff|null):Meter {
 return {startedAt:now,meters:0,points:[],incomplete:false,tariff:tariff?{...tariff}:null};
}
export function recordFix(meter:Meter,fix:Fix,now=Date.now()):Meter {
 if(meter.endedAt!==undefined||!validFix(fix)||fix.time<meter.startedAt||fix.time>now+5000||now-fix.time>30000)return meter;
 const last=meter.lastFix;
 if(last&&fix.time-last.time<GPS_INTERVAL_MS)return meter;
 if(!last)return {...meter,incomplete:meter.incomplete||fix.time-meter.startedAt>45000,lastFix:{...fix},points:[...meter.points,{...fix}].slice(-MAX_ROUTE_POINTS)};
 const distance=distanceMeters(last,fix),seconds=(fix.time-last.time)/1000;
 // Never bridge a GPS gap or an impossible jump into a payable distance.
 if(seconds>45||distance/seconds>60)return {...meter,lastFix:{...fix},incomplete:true,points:[...meter.points,{...fix}].slice(-MAX_ROUTE_POINTS)};
 if(distance<Math.max(GPS_DISTANCE_M,last.accuracy,fix.accuracy))return {...meter,lastFix:{...last,time:fix.time,accuracy:fix.accuracy}};
 return {...meter,meters:meter.meters+distance,lastFix:{...fix},points:[...meter.points,{...fix}].slice(-MAX_ROUTE_POINTS)};
}
export function pauseMeter(meter:Meter):Meter {
 const {lastFix:_,...rest}=meter;
 return {...rest,incomplete:true};
}
export function priceForRoute(meters:number,minutes:number,tariff:Tariff|null):number|null {
 if(!tariff||!validTariff(tariff)||!Number.isFinite(meters)||meters<0||!Number.isFinite(minutes)||minutes<0)return null;
 return Math.round(Math.max(tariff.minimum,tariff.base+meters/1000*tariff.perKm+minutes*tariff.perMinute));
}
export function fareEstimate(meter:Meter,now=Date.now()):number|null {
 if(!meter.tariff)return null;
 const minutes=Math.max(0,((meter.endedAt??now)-meter.startedAt)/60000);
 return priceForRoute(meter.meters,minutes,meter.tariff);
}
export function validMeter(value:unknown):value is Meter {
 const m=value as Meter;
 return Boolean(m&&Number.isFinite(m.startedAt)&&m.startedAt>0&&(m.endedAt===undefined||Number.isFinite(m.endedAt)&&m.endedAt>=m.startedAt)&&Number.isFinite(m.meters)&&m.meters>=0&&typeof m.incomplete==='boolean'&&(m.tariff===null||validTariff(m.tariff))&&Array.isArray(m.points)&&m.points.length<=MAX_ROUTE_POINTS&&m.points.every(validFix)&&(m.lastFix===undefined||validFix(m.lastFix)));
}
export function parseAmount(input:string):number|null {
 const text=input.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.');
 if(!/^\d+(?:\.\d+)?$/.test(text))return null;
 const n=Number(text);return Number.isFinite(n)&&n<=1e12?n:null;
}
