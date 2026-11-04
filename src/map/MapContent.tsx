import React,{useEffect,useRef,useState} from 'react';
import {Platform,View} from 'react-native';
import Constants from 'expo-constants';
import MapView,{Marker,Polyline,PROVIDER_GOOGLE} from 'react-native-maps';
import {type Coordinate} from '../geo';
import {Button,Label,useText,useTheme} from '../ui';
import KeylessMap from './KeylessMap';

export default function MapContent({point,onChange,compact=false,route,readOnly=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean}){
 const t=useText();const {colors,dark}=useTheme();const ref=useRef<MapView>(null);
 const [ready,setReady]=useState(false),[tilesLoaded,setTilesLoaded]=useState(false);
 const [slow,setSlow]=useState(false),[fallback,setFallback]=useState(false);
 const configured=Platform.OS==='android'&&Boolean(Constants.expoConfig?.extra?.googleMapsConfigured);
 useEffect(()=>{
   if(!configured||tilesLoaded||fallback)return;
   const timer=setTimeout(()=>setSlow(true),25000);
   return()=>clearTimeout(timer);
 },[configured,tilesLoaded,fallback]);
 useEffect(()=>{
   if(ready&&route&&route.length>1)ref.current?.fitToCoordinates(route,{edgePadding:{top:30,left:30,right:30,bottom:30},animated:false});
 },[route,ready]);
 if(!configured||fallback)return <View style={{flex:compact?1:undefined,gap:8}}>
  {!compact&&<Label muted>{configured?t('خريطة بديلة عند تعذر تحميل Google Maps.','Alternative map because Google Maps did not load.'):t('خريطة مؤقتة حتى تفعيل Google Maps داخل التطبيق.','Temporary map until Google Maps is enabled in the app.')}</Label>}
  <KeylessMap point={point} onChange={onChange} compact={compact} readOnly={readOnly} route={route}/>
  {fallback&&<Button secondary title={t('العودة إلى خريطة Google','Return to Google Maps')} onPress={()=>{setFallback(false);setReady(false);setTilesLoaded(false);setSlow(false)}}/>}
 </View>;
 return <View style={{height:compact?'100%':340,borderRadius:compact?0:16,overflow:'hidden',backgroundColor:colors.surface}}>
  <MapView
    ref={ref}
    provider={PROVIDER_GOOGLE}
    style={{flex:1}}
    userInterfaceStyle={dark?'dark':'light'}
    initialRegion={{latitude:point?.latitude??33.5138,longitude:point?.longitude??36.2765,latitudeDelta:0.035,longitudeDelta:0.035}}
    onMapReady={()=>setReady(true)}
    onMapLoaded={()=>{setTilesLoaded(true);setSlow(false)}}
    onPress={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate)}}
  >
    {point&&<Marker coordinate={point} draggable={!readOnly} onDragEnd={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate)}}/>}
    {route&&route.length>1&&<Polyline coordinates={route} strokeColor="#2688e8" strokeWidth={5}/>}
  </MapView>
  {slow&&!tilesLoaded&&<View style={{position:'absolute',left:12,right:12,bottom:12,padding:12,borderRadius:12,gap:8,backgroundColor:colors.background}}>
   <Label>{t('خريطة Google لم تكتمل بعد. ربما الاتصال ضعيف أو إعداد المفتاح يحتاج مراجعة.','Google Maps has not finished loading. The connection may be slow or the API key may need checking.')}</Label>
   <Button secondary title={t('استخدام خريطة بديلة','Use alternative map')} onPress={()=>setFallback(true)}/>
  </View>}
 </View>;
}
