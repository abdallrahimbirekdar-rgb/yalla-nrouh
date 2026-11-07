import {useAuth} from './auth';
import {useRideState} from './use-ride-state';
import {useEffect} from 'react';
import {router,usePathname} from 'expo-router';
import {useApp} from './context';
import type {SiteWindow} from './site-bridge.web';
export default function SiteShellSync(){
 const auth=useAuth();const rides=useRideState();
 const {state,draft,saveError,loadError:recovering}=useApp();const path=usePathname();
 const onlyAutomaticPickup=!draft.pickupPoint||draft.pickupMode!=='manual'&&['موقعي الحالي','My current location','Mein aktueller Standort'].includes(draft.pickup);
 const safe=!recovering&&auth.ready&&path==='/'&&!state.activeTripId&&!saveError&&!draft.destination&&!draft.destinationPoint&&onlyAutomaticPickup&&rides.known&&!rides.active;
 useEffect(()=>{(window as SiteWindow).ReactNativeWebView?.postMessage(JSON.stringify({type:'status',safeToReload:safe,canGoBack:path!=='/',language:state.language==='de'?'en':state.language,theme:state.preferences.theme,signedOut:!recovering&&auth.ready&&!auth.session}))},[safe,path,state.language,state.preferences.theme,auth.ready,auth.session,recovering]);
 useEffect(()=>{const back=(event:Event)=>{if(path==='/')return;event.preventDefault();if(router.canGoBack())router.back();else router.replace('/')};window.addEventListener('yalla:native-back-default',back);return()=>window.removeEventListener('yalla:native-back-default',back)},[path]);
 return null;
}
