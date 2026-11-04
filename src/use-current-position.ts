import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Location from 'expo-location';
import {currentPosition,PositionError,type PositionFailure} from './current-position';
import type {Coordinate} from './geo';
const adapter={permission:Location.getForegroundPermissionsAsync,requestPermission:Location.requestForegroundPermissionsAsync,services:Location.hasServicesEnabledAsync,position:()=>Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced,...(Platform.OS==='web'?{maximumAge:0,timeout:15000}:{})})};
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
  // The introduction asks first. This automatic path only reads an existing grant.
  const start=()=>{if(!located.current&&!manual.current)void locate(false)};
  if(AppState.currentState==='active')start();
  const subscription=AppState.addEventListener('change',value=>{if(value==='active')start()});
  return()=>subscription.remove();
 },[enabled,locate]);
 return {camera,busy,failure,locate:()=>locate(true),chooseManually};
}
