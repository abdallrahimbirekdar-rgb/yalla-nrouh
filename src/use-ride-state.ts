import {useSyncExternalStore} from 'react';
import {readRideState,subscribeRideState} from './cloud-ride-state';
export const useRideState=()=>useSyncExternalStore(subscribeRideState,readRideState,readRideState);
