import {mapNetwork,type MapNetwork} from './map/network-policy';
import {useEffect,useState} from 'react';
import type {Connection} from './connectivity';
// navigator.onLine reports a link, not proven internet access. Never probe/poll.
export function useConnection(){
 const read=():Connection=>typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'unknown';
 const [connection,setConnection]=useState<Connection>(read);
 useEffect(()=>{const update=()=>setConnection(read());globalThis.addEventListener('online',update);globalThis.addEventListener('offline',update);return()=>{globalThis.removeEventListener('online',update);globalThis.removeEventListener('offline',update);};},[]);
 return connection;
}

// Network Information is optional (for example Safari does not expose it).
type BrowserNetwork=EventTarget&{saveData?:boolean;effectiveType?:string;downlink?:number;rtt?:number};
export function useMapNetwork(){
 const read=():MapNetwork=>{
  if(typeof navigator==='undefined')return 'normal';
  const info=(navigator as Navigator&{connection?:BrowserNetwork}).connection;
  return mapNetwork({offline:navigator.onLine===false,saveData:info?.saveData,effectiveType:info?.effectiveType,downlink:info?.downlink,rtt:info?.rtt});
 };
 const [network,setNetwork]=useState<MapNetwork>(read);
 useEffect(()=>{
  const info=(navigator as Navigator&{connection?:BrowserNetwork}).connection;
  const update=()=>setNetwork(read());
  globalThis.addEventListener('online',update);globalThis.addEventListener('offline',update);info?.addEventListener('change',update);update();
  return()=>{globalThis.removeEventListener('online',update);globalThis.removeEventListener('offline',update);info?.removeEventListener('change',update)};
 },[]);
 return network;
}
