import type {CloudRide} from './cloud-api.ts';

/**
 * A confirmed cancellation must not reappear as an active ride when an earlier
 * network snapshot (or the accept-recovery request) completes out of order.
 * Only IDs acknowledged as cancelled by the server are added to confirmedIds.
 */
export function applyConfirmedCancellations<T extends Pick<CloudRide,'id'|'status'>>(
 rows:T[],confirmedIds:ReadonlySet<string>,
):T[]{
 if(confirmedIds.size===0)return rows;
 return rows.map(ride=>confirmedIds.has(ride.id)&&ride.status!=='cancelled'
  ?{...ride,status:'cancelled' as const}
  :ride);
}

export function isUnresolvedRide<T extends Pick<CloudRide,'id'|'status'>>(
 ride:T,confirmedIds:ReadonlySet<string>,
):boolean{
 return !confirmedIds.has(ride.id)&&ride.status!=='completed'&&ride.status!=='cancelled';
}
