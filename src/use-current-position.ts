import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Location from 'expo-location';
import {currentPosition,PositionError,type PositionFailure} from './current-position';
import {getWebPosition,recentWebPosition,webLocationGranted} from './web-position';
import {isCoordinate,type Coordinate} from './geo';
import {siteCurrentPosition} from './site-bridge';
import {positionDeadline} from './position-deadline';

// The web platform implementation accepts cancellation; native uses the adapter.
const webPositionRequest:(ask:boolean,signal?:AbortSignal)=>Promise<Coordinate>=siteCurrentPosition;
let browserPermissionFix:Coordinate|null=null;
const adapter={
 permission:()=>Platform.OS==='web'?webLocationGranted().then(granted=>({granted})):Location.getForegroundPermissionsAsync(),
 requestPermission:async()=>{
  if(Platform.OS!=='web')return Location.requestForegroundPermissionsAsync();
  browserPermissionFix=await getWebPosition();
  return {granted:true};
 },
 services:()=>Platform.OS==='web'?Promise.resolve(true):Location.hasServicesEnabledAsync(),
 position:async()=>{
  if(Platform.OS!=='web')return Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
  const fix=browserPermissionFix??await getWebPosition();
  browserPermissionFix=null;
  return {coords:fix};
 },
};
export type CameraTarget={point:Coordinate;revision:number;isLocation?:boolean;zoom?:number;overview?:boolean};
export function useCurrentPosition(enabled:boolean){
 const [camera,setCamera]=useState<CameraTarget>();const [busy,setBusy]=useState(false),[failure,setFailure]=useState<PositionFailure|null>(null);
 const request=useRef<AbortController|null>(null),cameraRevision=useRef(0);
 const generation=useRef(0),alive=useRef(true),running=useRef<number|null>(null),located=useRef(false),manual=useRef(false);
 const locate=useCallback(async(ask=false)=>{
  // Never discard a deliberate tap because an automatic GPS request is still
  // pending. A newer request supersedes the older one without sharing results.
  if(!ask&&running.current!==null)return;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const id=++generation.current;running.current=id;setBusy(true);setFailure(null);
  try{
   const received=await positionDeadline(signal=>Platform.OS==='web'?webPositionRequest(ask,signal):currentPosition(adapter,ask),controller,ask?45000:22000);
   const point=Platform.OS==='web'?recentWebPosition()??received:received;
   if(alive.current&&id===generation.current){located.current=true;setCamera({point,revision:++cameraRevision.current})}
   if(alive.current&&!controller.signal.aborted)return point;
  }catch(error){
   if(alive.current&&id===generation.current)setFailure(error instanceof PositionError?error.code:'position');
  }finally{
   if(running.current===id){running.current=null;if(alive.current)setBusy(false)}
   if(request.current===controller)request.current=null;
  }
 },[]);
 const cancel=useCallback(()=>{generation.current++;request.current?.abort();running.current=null},[]);
 const chooseManually=useCallback(()=>{manual.current=true;cancel();setBusy(false)},[cancel]);
 const locateOnTap=useCallback(()=>{manual.current=false;return locate(true)},[locate]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancel()}},[cancel]);
 useEffect(()=>{
  if(!enabled)return;
  let active=true,lastResumeAt=0;
  // Auto-centre at cold start and when the user returns to the app. Never
  // prompt again in the background; only read an already granted permission.
  const start=(onResume=false)=>{
   if(!active||manual.current||!onResume&&located.current)return;
   if(onResume&&Date.now()-lastResumeAt<2500)return;
   // A resume event during an existing GPS request must NOT queue a second
   // request. Previously it could restart the spinner immediately afterwards.
   if(running.current!==null)return;
   if(onResume)lastResumeAt=Date.now();
   void locate(false);
  };
  const recent=Platform.OS==='web'?recentWebPosition():null;
  if(recent&&!manual.current){
   located.current=true;setFailure(null);
   setCamera({point:recent,revision:++cameraRevision.current});
   void locate(false);
  }else start(false);
  const subscription=AppState.addEventListener('change',value=>{if(value==='active')start(true)});
  if(Platform.OS!=='web')return()=>{active=false;cancel();setBusy(false);subscription.remove()};
  // Diagnostics repeat the current permission after every GPS attempt. Only
  // a real permission transition may restart a failed automatic request.
  let permissionGranted=(window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean}).__YALLA_NATIVE_LOCATION_GRANTED__===true;
  const onNativeGrant=(event:Event)=>{const granted=(event as CustomEvent).detail?.granted===true;const newlyGranted=granted&&!permissionGranted;permissionGranted=granted;if(newlyGranted)start(false)};
  const onWebFix=(event:Event)=>{
   const point=(event as CustomEvent).detail;
   if(!isCoordinate(point)||manual.current)return;
   // A native fix can arrive as an event before the request promise resolves.
   // Finish the pending UI state here so the button never remains spinning.
   located.current=true;
   setBusy(false);setFailure(null);setCamera({point,revision:++cameraRevision.current});
  };
  const onNativeVisibility=(event:Event)=>{
   if((event as CustomEvent).detail?.active===true)start(true);
  };
  const onVisibility=()=>{if(document.visibilityState==='visible')start(true)};
  window.addEventListener('yalla:native-location-permission',onNativeGrant);
  window.addEventListener('yalla:location-ready',onWebFix);
  window.addEventListener('yalla:native-visibility',onNativeVisibility);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   active=false;cancel();setBusy(false);subscription.remove();
   window.removeEventListener('yalla:native-location-permission',onNativeGrant);
   window.removeEventListener('yalla:location-ready',onWebFix);
   window.removeEventListener('yalla:native-visibility',onNativeVisibility);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[enabled,locate,cancel]);
 return {camera,busy,failure,locate:locateOnTap,chooseManually};
}
