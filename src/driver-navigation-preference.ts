import {useSyncExternalStore} from 'react';
import {isNativeWebView} from './site-bridge';

export const navigationProviders={osmand:'OsmAnd',google:'Google Maps'} as const;
export type NavigationProvider=keyof typeof navigationProviders;

const key='yn-driver-navigation';
const changeEvent='yalla:driver-navigation-choice';
let sessionChoice:NavigationProvider|undefined;

function readProvider():NavigationProvider{
 if(sessionChoice)return sessionChoice;
 try{
  const saved=localStorage.getItem(key);
  if(saved==='google'||saved==='osmand')return saved;
 }catch{/* Use the platform default. */}
 return isNativeWebView()?'osmand':'google';
}

function subscribe(notify:()=>void){
 if(typeof window==='undefined')return ()=>{};
 const onStorage=(event:StorageEvent)=>{if(event.key===key||event.key===null)notify()};
 window.addEventListener(changeEvent,notify);
 window.addEventListener('storage',onStorage);
 return ()=>{
  window.removeEventListener(changeEvent,notify);
  window.removeEventListener('storage',onStorage);
 };
}

export function useDriverNavigationPreference(){
 return useSyncExternalStore(subscribe,readProvider,():NavigationProvider=>'google');
}

export function chooseDriverNavigation(provider:NavigationProvider){
 try{
  localStorage.setItem(key,provider);
  sessionChoice=undefined;
 }catch{sessionChoice=provider}
 if(typeof window!=='undefined')window.dispatchEvent(new Event(changeEvent));
}
