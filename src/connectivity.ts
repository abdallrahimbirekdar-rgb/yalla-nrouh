import {useEffect,useState} from 'react';
import {mapNetwork,type MapNetwork} from './map/network-policy';
import NetInfo from '@react-native-community/netinfo';
// Use OS connectivity events. No HTTP heartbeat or repeated polling.
NetInfo.configure({useNativeReachability:true,reachabilityShouldRun:()=>false});
export type Connection='online'|'offline'|'unknown';
export function useConnection(){const [connection,setConnection]=useState<Connection>('unknown');useEffect(()=>NetInfo.addEventListener(s=>setConnection(s.isConnected===false||s.isInternetReachable===false?'offline':s.isInternetReachable===true?'online':'unknown')),[]);return connection;}

export function useMapNetwork(){
 const [network,setNetwork]=useState<MapNetwork>('normal');
 useEffect(()=>NetInfo.addEventListener(s=>setNetwork(mapNetwork({offline:s.isConnected===false||s.isInternetReachable===false,expensive:s.details?.isConnectionExpensive,generation:s.type==='cellular'?s.details.cellularGeneration:null}))),[]);
 return network;
}
