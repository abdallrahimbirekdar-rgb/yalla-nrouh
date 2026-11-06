import * as Location from 'expo-location';
import {isCoordinate,type Coordinate} from './geo';
import {PositionError} from './current-position';
import type {Fix} from './meter';

// The website build resolves site-bridge.web.ts; native screens never use a WebView bridge.
export function isNativeWebView():boolean{return false}
export async function siteCurrentFix(_askPermission:boolean):Promise<Fix>{throw new PositionError('position')}

// Native-screen equivalent of the website's location helper.
// Website builds resolve site-bridge.web.ts instead.
export async function siteCurrentPosition(askPermission:boolean):Promise<Coordinate>{
 const permission=askPermission?await Location.requestForegroundPermissionsAsync():await Location.getForegroundPermissionsAsync();
 if(!permission.granted)throw new PositionError('permission');
 if(!await Location.hasServicesEnabledAsync())throw new PositionError('services');
 try{
  const result=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
  const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
  if(!isCoordinate(point))throw new PositionError('position');
  return point;
 }catch{throw new PositionError('position')}
}

// Only the website sends typed native bridge actions.
export async function nativeAction(_type:'alerts-enable'|'notify'|'location-settings',_text?:{title:string;body:string}):Promise<boolean>{return false}

export async function openNativeGoogleNavigation(_to:Coordinate,_label:string,_arabic:boolean):Promise<boolean>{return false}
