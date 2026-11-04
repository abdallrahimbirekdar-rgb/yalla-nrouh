import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Location from 'expo-location';
import {currentPosition,PositionError,type PositionFailure} from './current-position';
import {getWebPosition,recentWebPosition,webLocationGranted} from './web-position';
import {isCoordinate,type Coordinate} from './geo';
import {siteCurrentPosition} from './site-bridge';

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
export type CameraTarget={point:Coordinate;revision:number};
export function useCurrentPosition(enabled:boolean){
 const [camera,setCamera]=useState<CameraTarget>();const [busy,setBusy]=useState(false),[failure,setFailure]=useState<PositionFailure|null>(null);
 const generation=useRef(0),alive=useRef(true),running=useRef<number|null>(null),located=useRef(false),manual=useRef(false);
 const locate=useCallback(async(ask=false)=>{
  // Never discard a deliberate tap because an automatic GPS request is still
  // pending. A newer request supersedes the older one without sharing results.
  if(!ask&&running.current!==null)return;
  const id=++generation.current;running.current=id;setBusy(true);setFailure(null);
  try{
   const point=Platform.OS==='web'?await siteCurrentPosition(ask):await currentPosition(adapter,ask);
   if(alive.current&&id===generation.current){located.current=true;setCamera({point,revision:id})}
  }catch(error){
   if(alive.current&&id===generation.current)setFailure(error instanceof PositionError?error.code:'position');
  }finally{
   if(running.current===id)running.current=null;
   if(alive.current&&id===generation.current)setBusy(false);
  }
 },[]);
 const chooseManually=useCallback(()=>{manual.current=true;generation.current++;running.current=null;setBusy(false)},[]);
 const locateOnTap=useCallback(()=>{manual.current=false;return locate(true)},[locate]);
 useEffect(()=>{alive.current=true;generation.current++;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  if(!enabled)return;
  let active=true,delayed:ReturnType<typeof setTimeout>|undefined,lastResumeAt=0;
  // Auto-centre at cold start and when the user returns to the app. Never
  // prompt again in the background; only read an already granted permission.
  const start=(onResume=false)=>{
   if(!active||manual.current||!onResume&&located.current)return;
   if(onResume&&Date.now()-lastResumeAt<1800)return;
   if(running.current!==null){
    if(delayed)clearTimeout(delayed);
    delayed=setTimeout(()=>{delayed=undefined;start(onResume)},350);
    return;
   }
   if(onResume)lastResumeAt=Date.now();
   void locate(false);
  };
  const recent=Platform.OS==='web'?recentWebPosition():null;
  if(recent&&!manual.current){
   const id=++generation.current;located.current=true;setFailure(null);
   setCamera({point:recent,revision:id});
  }else start(false);
  const subscription=AppState.addEventListener('change',value=>{if(value==='active')start(true)});
  if(Platform.OS!=='web')return()=>{active=false;subscription.remove();if(delayed)clearTimeout(delayed)};
  const onNativeGrant=(event:Event)=>{if((event as CustomEvent).detail?.granted===true)start(true)};
  const onWebFix=(event:Event)=>{
   const point=(event as CustomEvent).detail;
   if(!isCoordinate(point)||manual.current)return;
   // A native fix can arrive as an event before the request promise resolves.
   // Finish the pending UI state here so the button never remains spinning.
   const id=++generation.current;running.current=null;located.current=true;
   setBusy(false);setFailure(null);setCamera({point,revision:id});
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
   active=false;subscription.remove();if(delayed)clearTimeout(delayed);
   window.removeEventListener('yalla:native-location-permission',onNativeGrant);
   window.removeEventListener('yalla:location-ready',onWebFix);
   window.removeEventListener('yalla:native-visibility',onNativeVisibility);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[enabled,locate]);
 return {camera,busy,failure,locate:locateOnTap,chooseManually};
}
