import * as Location from 'expo-location';
import {isCoordinate,type Coordinate} from './geo';
import {PositionError} from './current-position';

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
