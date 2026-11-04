import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Location from 'expo-location';
import {currentPosition,PositionError,type PositionFailure} from './current-position';
import {getWebPosition,webLocationGranted} from './web-position';
import {isCoordinate,type Coordinate} from './geo';

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
 const generation=useRef(0),alive=useRef(true),running=useRef(false),located=useRef(false),manual=useRef(false);
 const locate=useCallback(async(ask=false)=>{
  if(running.current)return;const id=++generation.current;running.current=true;setBusy(true);setFailure(null);
  try{const point=await currentPosition(adapter,ask);if(alive.current&&id===generation.current){located.current=true;setCamera({point,revision:id})}}
  catch(error){if(alive.current&&id===generation.current)setFailure(error instanceof PositionError?error.code:'position')}
  finally{running.current=false;if(alive.current)setBusy(false)}
 },[]);
 const chooseManually=useCallback(()=>{manual.current=true;generation.current++},[]);
 useEffect(()=>{alive.current=true;generation.current++;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  if(!enabled)return;
  // Only auto-locate after an existing site/native grant; a new grant needs a tap.
  const start=()=>{if(!located.current&&!manual.current)void locate(false)};
  if(AppState.currentState==='active'||Platform.OS==='web')start();
  const subscription=AppState.addEventListener('change',value=>{if(value==='active')start()});
  if(Platform.OS!=='web')return()=>subscription.remove();
  const onNativeGrant=(event:Event)=>{if((event as CustomEvent).detail?.granted===true)start()};
  const onWebFix=(event:Event)=>{
   const point=(event as CustomEvent).detail;
   if(!isCoordinate(point)||manual.current)return;
   const id=++generation.current;located.current=true;setFailure(null);setCamera({point,revision:id});
  };
  window.addEventListener('yalla:native-location-permission',onNativeGrant);
  window.addEventListener('yalla:location-ready',onWebFix);
  return()=>{subscription.remove();window.removeEventListener('yalla:native-location-permission',onNativeGrant);window.removeEventListener('yalla:location-ready',onWebFix)};
 },[enabled,locate]);
 return {camera,busy,failure,locate:()=>locate(true),chooseManually};
}
