import {isCoordinate,type Coordinate} from './geo.ts';
import {distanceMeters} from './meter.ts';
export const MAX_PICKUP_METERS=500;
export function pickupAllowed(pickup:Coordinate|undefined,current:Coordinate|null):boolean {
 return isCoordinate(pickup)&&isCoordinate(current)&&distanceMeters(pickup,current)<=MAX_PICKUP_METERS;
}
