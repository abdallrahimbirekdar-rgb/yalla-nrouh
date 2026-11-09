import {useAuth} from './auth';
import {useRideState} from './use-ride-state';
import {useEffect,useRef} from 'react';
import {router,usePathname} from 'expo-router';
import {useApp} from './context';
import {readRidePushTarget,type RidePushTarget} from './ride-push-target';
import {syncRidePush} from './ride-push';
import type {SiteWindow} from './site-bridge.web';
export default function SiteShellSync(){
 const auth=useAuth();const rides=useRideState();
 const {state,draft,saveError,foreground,loadError:recovering}=useApp();const path=usePathname();
 const onlyAutomaticPickup=!draft.pickupPoint||draft.pickupMode!=='manual'&&['موقعي الحالي','My current location','Mein aktueller Standort'].includes(draft.pickup);
 const safe=!recovering&&auth.ready&&path==='/'&&!state.activeTripId&&!saveError&&!draft.destination&&!draft.destinationPoint&&onlyAutomaticPickup&&rides.known&&!rides.active;
 const owner=auth.session?.user.id;
 const pendingTarget=useRef<RidePushTarget|null>(null);
 useEffect(()=>{
  const open=(target:RidePushTarget)=>{
   router.push({pathname:'/cloud',params:target.type==='driver-offer'?{mode:'driver',offer:target.rideId}:{ride:target.rideId}});
  };
  const tap=(event:Event)=>{
   const target=readRidePushTarget((event as CustomEvent).detail);
   if(!target)return;
   if(owner&&auth.rolesReady)open(target);
   else if(!auth.ready||owner)pendingTarget.current=target;
  };
  if(auth.ready&&!owner)pendingTarget.current=null;
  if(owner&&auth.rolesReady&&pendingTarget.current){open(pendingTarget.current);pendingTarget.current=null}
  window.addEventListener('yalla:ride-push-tap',tap);
  return()=>window.removeEventListener('yalla:ride-push-tap',tap);
 },[owner,auth.ready,auth.rolesReady]);
 useEffect(()=>{
  if(!owner||!auth.rolesReady||recovering||!foreground)return;
  const sync=()=>void syncRidePush(owner,state.preferences.notifications);
  window.addEventListener('yalla:ride-push-capability',sync);
  window.addEventListener('online',sync);
  sync();
  return()=>{
   window.removeEventListener('yalla:ride-push-capability',sync);
   window.removeEventListener('online',sync);
  };
 },[owner,auth.rolesReady,recovering,foreground,state.preferences.notifications]);
 useEffect(()=>{
  const host=window as SiteWindow;
  const send=()=>host.ReactNativeWebView?.postMessage(JSON.stringify({type:'status',safeToReload:safe,canGoBack:path!=='/',
   language:state.language==='de'?'en':state.language,theme:state.preferences.theme,signedOut:!recovering&&auth.ready&&!auth.session}));
  host.addEventListener('yalla:native-status-request',send);
  send();
  return()=>host.removeEventListener('yalla:native-status-request',send);
 },[safe,path,state.language,state.preferences.theme,auth.ready,auth.session,recovering]);
 useEffect(()=>{const back=(event:Event)=>{if(path==='/')return;event.preventDefault();if(router.canGoBack())router.back();else router.replace('/')};window.addEventListener('yalla:native-back-default',back);return()=>window.removeEventListener('yalla:native-back-default',back)},[path]);
 return null;
}
