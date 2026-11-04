import {useEffect,useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
// Use OS connectivity events. No HTTP heartbeat or repeated polling.
NetInfo.configure({useNativeReachability:true,reachabilityShouldRun:()=>false});
export type Connection='online'|'offline'|'unknown';
export function useConnection(){const [connection,setConnection]=useState<Connection>('unknown');useEffect(()=>NetInfo.addEventListener(s=>setConnection(s.isConnected===false||s.isInternetReachable===false?'offline':s.isInternetReachable===true?'online':'unknown')),[]);return connection;}
