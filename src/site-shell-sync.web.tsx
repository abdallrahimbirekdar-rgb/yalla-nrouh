import {useEffect} from 'react';
import {usePathname} from 'expo-router';
import {useApp} from './context';
import type {SiteWindow} from './site-bridge.web';
export default function SiteShellSync(){
 const {state,draft,saveError}=useApp();const path=usePathname();
 const safe=path==='/'&&!state.activeTripId&&!saveError&&!draft.pickup&&!draft.destination&&!draft.pickupPoint&&!draft.destinationPoint;
 useEffect(()=>{(window as SiteWindow).ReactNativeWebView?.postMessage(JSON.stringify({type:'status',safeToReload:safe,canGoBack:path!=='/',language:state.language,theme:state.preferences.theme}))},[safe,path,state.language,state.preferences.theme]);
 return null;
}
