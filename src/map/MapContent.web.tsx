import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {type Coordinate,isCoordinate} from '../geo';
import type {CameraTarget} from '../use-current-position';
import {useApp} from '../context';
import {Button,Label,useText,useTheme} from '../ui';
import {loadGoogleMaps,onMapsAuthFailure,webMapsKey,type GoogleMap,type GoogleMaps,type GoogleMarker,type GoogleLine,type LatLng} from './google-web';
const position=(point:Coordinate):LatLng=>({lat:point.latitude,lng:point.longitude});
export default function MapContent({point,onChange,compact=false,route,readOnly=false,lean=false,cameraTarget}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean;lean?:boolean;loadTimeoutMs?:number;cameraTarget?:CameraTarget}){
 const {state}=useApp();const t=useText();const {colors,dark}=useTheme();const host=useRef<HTMLDivElement>(null);
 const map=useRef<GoogleMap|null>(null),api=useRef<GoogleMaps|null>(null),marker=useRef<GoogleMarker|null>(null),line=useRef<GoogleLine|null>(null);
 const userMarker=useRef<GoogleMarker|null>(null);
 const current=useRef(point);current.current=point;const choose=useRef(onChange);choose.current=onChange;
 const profile=useRef({lean,dark});profile.current={lean,dark};
 const failed=useRef(false);
 const [error,setError]=useState(false),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0);
 const key=webMapsKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY);
 useEffect(()=>{
  const container=host.current;if(!container||!key)return;let disposed=false;failed.current=false;setError(false);setReady(false);
  const removeAuthListener=onMapsAuthFailure(()=>{if(!disposed){failed.current=true;setError(true)}});
  const online=()=>{if(!disposed&&failed.current)setAttempt(value=>value+1)};
  window.addEventListener('online',online);
  void loadGoogleMaps(key,state.language).then(maps=>{
   if(disposed||!host.current)return;api.current=maps;
   const start=current.current??{latitude:33.5138,longitude:36.2765};
   const instance=new maps.Map(host.current,{center:position(start),zoom:profile.current.lean?13:14,mapId:process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_MAP_ID||'DEMO_MAP_ID',renderingType:'RASTER',mapTypeId:'roadmap',disableDefaultUI:true,zoomControl:true,gestureHandling:'cooperative',clickableIcons:false,tilt:0,heading:0,colorScheme:profile.current.dark?'DARK':'LIGHT'});
   map.current=instance;
   const pin=new maps.marker.AdvancedMarkerElement({map:instance,gmpDraggable:!readOnly,title:state.language==='ar'?'الموقع المحدد':'Selected location'});marker.current=pin;
   const select=(event:{latLng?:{lat:()=>number;lng:()=>number}|null})=>{if(!event.latLng||readOnly)return;const next={latitude:event.latLng.lat(),longitude:event.latLng.lng()};if(isCoordinate(next))choose.current(next)};
   if(!readOnly){instance.addListener('click',select);pin.addListener('dragend',select)}
   line.current=new maps.Polyline({map:instance,strokeColor:'#2688e8',strokeWeight:5,clickable:false});
   setReady(true);
  }).catch(()=>{if(!disposed){failed.current=true;setError(true)}});
  return()=>{disposed=true;removeAuthListener();window.removeEventListener('online',online);if(marker.current){api.current?.event.clearInstanceListeners(marker.current);marker.current.map=null}if(userMarker.current)userMarker.current.map=null;userMarker.current=null;line.current?.setMap(null);if(map.current)api.current?.event.clearInstanceListeners(map.current);map.current=null;marker.current=null;line.current=null;container.replaceChildren()};
 },[key,state.language,readOnly,attempt]);
 useEffect(()=>{
  const instance=map.current,pin=marker.current;if(!ready||!instance||!pin)return;
  pin.position=point?position(point):undefined;
  if(point&&instance.getBounds()&&!instance.getBounds()?.contains(position(point)))instance.setCenter(position(point));
 },[point,ready]);
 useEffect(()=>{
  if(!ready||!map.current||!api.current||!line.current)return;
  const path=route?.map(position)??[];line.current.setPath(path);
  if(path.length>1){const bounds=new api.current.LatLngBounds();path.forEach(p=>bounds.extend(p));map.current.fitBounds(bounds,30)}
 },[route,ready]);
 useEffect(()=>{
  if(!ready||!map.current||!api.current||!cameraTarget)return;
  const center=position(cameraTarget.point);map.current.setCenter(center);map.current.setZoom(16);
  if(!userMarker.current){
   const dot=document.createElement('div');Object.assign(dot.style,{width:'18px',height:'18px',background:'#2688e8',border:'3px solid white',borderRadius:'50%',boxShadow:'0 0 0 8px #2688e822'});
   userMarker.current=new api.current.marker.AdvancedMarkerElement({map:map.current,position:center,content:dot,title:state.language==='ar'?'موقعي الحالي':'My current location'});
  }else userMarker.current.position=center;
 },[cameraTarget,ready,state.language]);
 useEffect(()=>{map.current?.setOptions({tilt:0,heading:0,headingInteractionEnabled:!lean,tiltInteractionEnabled:false})},[lean,ready]);
 return <View style={compact?{flex:1,minHeight:260}:{gap:10}}>
  {React.createElement('div',{ref:host,role:'region','aria-label':t('خريطة Google لاختيار الموقع','Google map to choose a location'),style:{height:compact?'100%':340,minHeight:compact?260:340,width:'100%',borderRadius:compact?0:16,overflow:'hidden',background:colors.surface}})}
  {(!key||error||!ready)&&<View style={{position:'absolute',left:16,right:16,top:compact?70:30,padding:18,borderRadius:14,gap:12,backgroundColor:colors.background}}>
   {!key||error?<Label>{t('خريطة Google غير متاحة حاليًا. يمكنك إدخال العنوان يدويًا والمحاولة لاحقًا.','Google Maps is not available right now. You can enter an address by hand and try later.')}</Label>:<><ActivityIndicator color={colors.purple}/><Label>{t('جارٍ تحميل خريطة Google…','Loading Google Maps…')}</Label></>}
   {key&&error&&<Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>setAttempt(value=>value+1)}/>}
  </View>}
  {!compact&&!readOnly&&ready&&<Button secondary title={t('اختيار مركز الخريطة','Select map center')} onPress={()=>{const center=map.current?.getCenter();if(center){const next={latitude:center.lat(),longitude:center.lng()};if(isCoordinate(next))onChange(next)}}}/>}
 </View>;
}
