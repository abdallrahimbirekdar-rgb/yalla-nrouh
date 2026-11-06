import type {Coordinate} from '../geo';
export interface DriverPilotMapProps {
 point:Coordinate|null;
 destination:Coordinate;
 route:Coordinate[]|undefined;
 follow:boolean;
 fresh:boolean;
}
export default function DriverPilotMap(_props:DriverPilotMapProps){return null}
