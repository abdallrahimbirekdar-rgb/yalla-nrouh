import React,{useEffect,useState} from 'react';
import {View,ActivityIndicator} from 'react-native';
import {type Coordinate,formatCoordinate} from '../geo';
import {useApp} from '../context';
import {useMapNetwork} from '../connectivity';
import {Icon,Label,useText,useTheme} from '../ui';
import {mapPolicy} from './network-policy';
import MapContent from './MapContent';
import type {CameraTarget} from '../use-current-position';
export default function MapCanvas(props:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean;cameraTarget?:CameraTarget;initialCenter?:Coordinate;minMapHeight?:number}){
 const {state,ready}=useApp();const {colors}=useTheme();const t=useText();const network=useMapNetwork();const policy=mapPolicy(network,state.preferences.dataSaver);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>{
  if(!ready||mounted||network==='offline')return;
  const timer=setTimeout(()=>setMounted(true),policy.startDelayMs);
  return()=>clearTimeout(timer);
 },[ready,mounted,network,policy.startDelayMs]);
 // Keep an existing map and selected point through connection changes.
 if(!mounted)return <View style={{flex:props.compact?1:undefined,minHeight:props.compact?(props.minMapHeight??260):200,justifyContent:'center',alignItems:'center',padding:24,gap:14,backgroundColor:colors.surface}}>
  <Icon name={network==='offline'?'cloud-offline-outline':'map-outline'} size={36} color={colors.purple}/>
  <Label>{network==='offline'?t('ستظهر الخريطة تلقائيًا عند عودة الإنترنت','The map will open when internet returns'):t('جارٍ تحميل الخريطة تلقائيًا…','Loading your map…')}</Label>
  {network!=='offline'&&<ActivityIndicator color={colors.purple}/>}
  {props.point&&<Label muted>{formatCoordinate(props.point)}</Label>}
  <Label muted>{t('يمكنك متابعة إدخال العنوان يدويًا.','You can still enter an address by hand.')}</Label>
 </View>;
 return <MapContent {...props} lean={policy.lean} loadTimeoutMs={policy.loadTimeoutMs}/>;
}
