import React,{useEffect,useRef,useState} from 'react';
import {Platform,View} from 'react-native';
import Constants from 'expo-constants';
import MapView,{Marker,Polyline,PROVIDER_GOOGLE} from 'react-native-maps';
import {type Coordinate} from '../geo';
import {Label,useText,useTheme} from '../ui';
import KeylessMap from './KeylessMap';
export default function MapContent({point,onChange,compact=false,route,readOnly=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean}){
 const t=useText();const {dark}=useTheme();const ref=useRef<MapView>(null);const [ready,setReady]=useState(false);const configured=Platform.OS==='android'&&Boolean(Constants.expoConfig?.extra?.googleMapsConfigured);
 useEffect(()=>{if(ready&&route&&route.length>1)ref.current?.fitToCoordinates(route,{edgePadding:{top:30,left:30,right:30,bottom:30},animated:false});},[route,ready]);
 if(!configured)return <View style={{flex:compact?1:undefined,gap:8}}><Label muted>{t('الخريطة المدمجة مؤقتة لحين تفعيل Google داخل التطبيق. ملاحة الطريق تفتح في Google Maps.','This is a temporary map until Google is set up in the app. Route navigation opens in Google Maps.')}</Label>{route?<Label>{t('افتح الطريق عبر زر Google Maps.','Open the route with the Google Maps button.')}</Label>:<KeylessMap point={point} onChange={onChange} compact={compact} readOnly={readOnly}/>}</View>;
 return <View style={{height:compact?'100%':340,borderRadius:compact?0:16,overflow:'hidden'}}><MapView ref={ref} provider={PROVIDER_GOOGLE} style={{flex:1}} userInterfaceStyle={dark?'dark':'light'} initialRegion={{latitude:point?.latitude??33.5138,longitude:point?.longitude??36.2765,latitudeDelta:0.035,longitudeDelta:0.035}} onMapReady={()=>setReady(true)} onPress={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate);}}>{point&&<Marker coordinate={point} draggable={!readOnly} onDragEnd={event=>{if(!readOnly)onChange(event.nativeEvent.coordinate);}}/>}{route&&<Polyline coordinates={route} strokeColor="#2688e8" strokeWidth={5}/>}</MapView></View>;
}
