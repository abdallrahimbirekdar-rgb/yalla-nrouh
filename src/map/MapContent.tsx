import React,{useEffect,useRef,useState} from 'react';
import {Platform,View} from 'react-native';
import Constants from 'expo-constants';
import MapView,{Marker,Polyline,PROVIDER_GOOGLE} from 'react-native-maps';
import {type Coordinate} from '../geo';
import type {CameraTarget} from '../use-current-position';
import {Button,Label,useText,useTheme} from '../ui';

export default function MapContent({point,onChange,compact=false,route,readOnly=false,lean=false,loadTimeoutMs=25000,cameraTarget,initialCenter}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean;lean?:boolean;loadTimeoutMs?:number;cameraTarget?:CameraTarget;initialCenter?:Coordinate}){
 const t=useText();const {colors,dark}=useTheme();const ref=useRef<MapView>(null);
 const [ready,setReady]=useState(false),[tilesLoaded,setTilesLoaded]=useState(false);
 const [slow,setSlow]=useState(false),[attempt,setAttempt]=useState(0);
 const configured=Platform.OS==='android'&&Boolean(Constants.expoConfig?.extra?.googleMapsConfigured);
 useEffect(()=>{
   if(!configured||tilesLoaded)return;
   const timer=setTimeout(()=>setSlow(true),loadTimeoutMs);
   return()=>clearTimeout(timer);
 },[configured,tilesLoaded,attempt,loadTimeoutMs]);
 useEffect(()=>{
   if(ready&&route&&route.length>1)ref.current?.fitToCoordinates(route,{edgePadding:{top:30,left:30,right:30,bottom:30},animated:false});
 },[route,ready]);
 useEffect(()=>{if(ready&&cameraTarget)ref.current?.setCamera({center:cameraTarget.point,zoom:19})},[ready,cameraTarget]);
 if(!configured)return <View style={{flex:compact?1:undefined,minHeight:260,padding:24,justifyContent:'center',backgroundColor:colors.surface}}><Label>{t('خريطة Google غير متاحة حاليًا. يمكنك إدخال العنوان يدويًا.','Google Maps is not available right now. You can enter an address by hand.')}</Label></View>;
 return <View style={{height:compact?'100%':340,borderRadius:compact?0:16,overflow:'hidden',backgroundColor:colors.surface}}>
  <MapView
    key={attempt}
    ref={ref}
    provider={PROVIDER_GOOGLE}
    style={{flex:1}}
    mapType="standard"
    showsTraffic={false}
    showsBuildings={!lean}
    showsIndoors={!lean}
    toolbarEnabled={false}
    pitchEnabled={!lean}
    rotateEnabled={!lean}
    liteMode={readOnly&&lean}
    userInterfaceStyle={dark?'dark':'light'}
    initialRegion={{latitude:cameraTarget?.point.latitude??point?.latitude??initialCenter?.latitude??33.5138,longitude:cameraTarget?.point.longitude??point?.longitude??initialCenter?.longitude??36.2765,latitudeDelta:cameraTarget?0.0015:lean?0.06:0.035,longitudeDelta:cameraTarget?0.0015:lean?0.06:0.035}}
    onMapReady={()=>setReady(true)}
    onMapLoaded={()=>{setTilesLoaded(true);setSlow(false)}}
    onPress={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate)}}
  >
    {cameraTarget&&<Marker coordinate={cameraTarget.point} pinColor="#2688e8" title={t('موقعي الحالي','My current location')} zIndex={1}/> }
    {point&&<Marker zIndex={2} coordinate={point} draggable={!readOnly} onDragEnd={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate)}}/>}
    {route&&route.length>1&&<Polyline coordinates={route} strokeColor="#2688e8" strokeWidth={5}/>}
  </MapView>
  {slow&&!tilesLoaded&&<View style={{position:'absolute',left:12,right:12,bottom:12,padding:12,borderRadius:12,gap:8,backgroundColor:colors.background}}>
   <Label>{t('خريطة Google لم تكتمل بعد. ربما الاتصال ضعيف أو إعداد المفتاح يحتاج مراجعة.','Google Maps has not finished loading. The connection may be slow or the API key may need checking.')}</Label>
   <Button secondary title={t('إعادة تحميل خريطة Google','Reload Google Maps')} onPress={()=>{setReady(false);setTilesLoaded(false);setSlow(false);setAttempt(value=>value+1)}}/>
  </View>}
 </View>;
}
