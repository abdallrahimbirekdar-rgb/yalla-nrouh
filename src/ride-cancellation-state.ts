import type {CloudRide} from './cloud-api.ts';

/**
 * A confirmed cancellation must not reappear as an active ride when an earlier
 * network snapshot (or the accept-recovery request) completes out of order.
 * Only IDs acknowledged as cancelled by the server are added to confirmedIds.
 */
export function applyConfirmedCancellations(rows:CloudRide[],confirmedIds:ReadonlySet<string>):CloudRide[]{
 if(confirmedIds.size===0)return rows;
 return rows.map(ride=>confirmedIds.has(ride.id)&&ride.status!=='cancelled'
  ?{...ride,status:'cancelled'}
  :ride);
}
export function isUnresolvedRide(ride:Pick<CloudRide,'id'|'status'>,confirmedIds:ReadonlySet<string>):boolean{
 return !confirmedIds.has(ride.id)&&ride.status!=='completed'&&ride.status!=='cancelled';
}
