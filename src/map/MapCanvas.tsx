import React,{useState} from 'react';
import {View} from 'react-native';
import {type Coordinate,formatCoordinate} from '../geo';
import {useApp} from '../context';
import {Button,Icon,Label,useText,useTheme} from '../ui';
import MapContent from './MapContent';
export default function MapCanvas(props:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean}){
 const {state,ready}=useApp();const {colors}=useTheme();const t=useText();const [requested,setRequested]=useState(false);
 const enabled=ready&&(requested||!state.preferences.dataSaver);
 if(!enabled)return <View style={{flex:props.compact?1:undefined,minHeight:props.compact?260:200,justifyContent:'center',alignItems:'center',padding:24,gap:14,backgroundColor:colors.surface}}><Icon name="map-outline" size={40} color={colors.purple}/><Label>{t('توفير البيانات','Data saver')}</Label>{props.point&&<Label muted>{formatCoordinate(props.point)}</Label>}<Button secondary icon="map-outline" title={t('تحميل الخريطة','Load map')} disabled={!ready} onPress={()=>setRequested(true)}/><Label muted>{t('يمكنك إدخال العنوان دون تحميل الخريطة.','You can enter an address without loading the map.')}</Label></View>;
 return <MapContent {...props}/>;
}
