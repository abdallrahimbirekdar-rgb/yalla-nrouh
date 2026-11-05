import {isCoordinate,type Coordinate} from './geo.ts';
import {distanceMeters} from './meter.ts';
// A small GPS change can keep an estimate. Larger moves need a new road quote.
// The submitted pickup always comes from the fresh phone fix in either case.
export function pickupQuoteMatches(quoted:Coordinate|undefined,current:Coordinate):boolean {
 return isCoordinate(quoted)&&isCoordinate(current)&&distanceMeters(quoted,current)<=30;
}
