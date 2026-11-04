import React from 'react';
import {Platform,View} from 'react-native';
import MapView,{Marker} from 'react-native-maps';
import Constants from 'expo-constants';
import {type Coordinate} from '../geo';
import {Label,useText} from '../ui';
export default function MapCanvas({point,onChange,compact=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean}){
  const t=useText();
  if(Platform.OS==='android'&&!Constants.expoConfig?.extra?.androidMapsConfigured)return <View style={{padding:16}}><Label muted>{t('خريطة أندرويد تحتاج مفتاح خرائط عند بناء التطبيق. يمكنك استخدام الموقع الحالي أو الإحداثيات أدناه.','Android maps need a maps key when building the app. You can use your location or enter coordinates below.')}</Label></View>;
  return <View style={{height:compact?'100%':300,borderRadius:compact?0:18,overflow:'hidden'}}><MapView style={{flex:1}} region={{latitude:point?.latitude??33.5138,longitude:point?.longitude??36.2765,latitudeDelta:0.035,longitudeDelta:0.035}} onPress={event=>onChange(event.nativeEvent.coordinate)} accessibilityLabel={t('خريطة اختيار الموقع','Choose a location on the map')}>
    {point&&<Marker coordinate={point} draggable onDragEnd={event=>onChange(event.nativeEvent.coordinate)} title={t('الموقع المحدد','Selected location')}/>}
  </MapView></View>;
}
