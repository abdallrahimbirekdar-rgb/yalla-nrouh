import {useEffect,useState} from 'react';
import type {Connection} from './connectivity';
// navigator.onLine reports a link, not proven internet access. Never probe/poll.
export function useConnection(){
 const read=():Connection=>typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'unknown';
 const [connection,setConnection]=useState<Connection>(read);
 useEffect(()=>{const update=()=>setConnection(read());globalThis.addEventListener('online',update);globalThis.addEventListener('offline',update);return()=>{globalThis.removeEventListener('online',update);globalThis.removeEventListener('offline',update);};},[]);
 return connection;
}
