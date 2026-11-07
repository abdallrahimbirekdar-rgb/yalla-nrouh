import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {type Coordinate,isCoordinate} from '../geo';
import type {CameraTarget} from '../use-current-position';
import {useApp} from '../context';
import {Button,Label,useText,useTheme} from '../ui';
import {loadGoogleMaps,onMapsAuthFailure,webMapsKey,type GoogleMap,type GoogleMaps,type GoogleMarker,type GoogleLine,type LatLng} from './google-web';
const position=(point:Coordinate):LatLng=>({lat:point.latitude,lng:point.longitude});
function endpointBadge(letter:string,background:string){
 const badge=document.createElement('div');badge.textContent=letter;
 Object.assign(badge.style,{background,color:'white',border:'2px solid white',borderRadius:'50%',width:'28px',height:'28px',display:'grid',placeItems:'center',fontWeight:'bold'});
 return badge;
}
export default function MapContent({point,destinationPoint,taxiPoint,passengerPoint,onChange,compact=false,route,readOnly=false,lean=false,loadTimeoutMs=25000,cameraTarget,initialCenter,minMapHeight=260}:{point:Coordinate|null;destinationPoint?:Coordinate;taxiPoint?:Coordinate;passengerPoint?:Coordinate;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean;lean?:boolean;loadTimeoutMs?:number;cameraTarget?:CameraTarget;initialCenter?:Coordinate;minMapHeight?:number}){
 const {state}=useApp();const t=useText();const {colors,dark}=useTheme();const host=useRef<HTMLDivElement>(null);
 const map=useRef<GoogleMap|null>(null),api=useRef<GoogleMaps|null>(null),marker=useRef<GoogleMarker|null>(null),line=useRef<GoogleLine|null>(null);
 const userMarker=useRef<GoogleMarker|null>(null),endMarker=useRef<GoogleMarker|null>(null),taxiMarker=useRef<GoogleMarker|null>(null);
 const hasCameraTarget=!!cameraTarget;
 const destinationLat=destinationPoint?.latitude,destinationLng=destinationPoint?.longitude;
 const pickupLat=point?.latitude,pickupLng=point?.longitude;
 const current=useRef(point);current.current=point;const choose=useRef(onChange);choose.current=onChange;
 const profile=useRef({lean,dark});profile.current={lean,dark};
 const entry=useRef({initialCenter,compact});
 const failed=useRef(false);
 const [error,setError]=useState(false),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0);
 const key=webMapsKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY);
 useEffect(()=>{
  const container=host.current;if(!container||!key)return;let disposed=false;failed.current=false;setError(false);setReady(false);
  // Never leave the picker showing a spinner indefinitely. If Google Maps
  // cannot initialize in time, show a clear retry and keep manual selection.
  const pending=setTimeout(()=>{if(!disposed){failed.current=true;setError(true)}},Math.min(loadTimeoutMs,20000));
  const removeAuthListener=onMapsAuthFailure(()=>{if(!disposed){failed.current=true;setError(true)}});
  const online=()=>{if(!disposed&&failed.current)setAttempt(value=>value+1)};
  window.addEventListener('online',online);
  void loadGoogleMaps(key,state.language).then(maps=>{
   if(disposed||!host.current)return;api.current=maps;
   const start=current.current??entry.current.initialCenter??{latitude:33.5138,longitude:36.2765};
   const instance=new maps.Map(host.current,{center:position(start),zoom:profile.current.lean?13:14,mapId:process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_MAP_ID||'DEMO_MAP_ID',renderingType:'RASTER',mapTypeId:'roadmap',disableDefaultUI:true,zoomControl:true,gestureHandling:readOnly||entry.current.compact?'cooperative':'greedy',clickableIcons:false,tilt:0,heading:0,colorScheme:profile.current.dark?'DARK':'LIGHT'});
   map.current=instance;
   const pin=new maps.marker.AdvancedMarkerElement({map:instance,gmpDraggable:!readOnly,title:state.language==='ar'?'أ: الانطلاق':'A: pickup'});marker.current=pin;
   const select=(event:{latLng?:{lat:()=>number;lng:()=>number}|null})=>{if(!event.latLng||readOnly)return;const next={latitude:event.latLng.lat(),longitude:event.latLng.lng()};if(isCoordinate(next))choose.current(next)};
   if(!readOnly){instance.addListener('click',select);pin.addListener('dragend',select)}
   line.current=new maps.Polyline({map:instance,strokeColor:'#2688e8',strokeWeight:5,clickable:false});
   clearTimeout(pending);failed.current=false;setError(false);setReady(true);
  }).catch(()=>{if(!disposed){clearTimeout(pending);failed.current=true;setError(true)}});
  return()=>{disposed=true;clearTimeout(pending);removeAuthListener();window.removeEventListener('online',online);if(marker.current){api.current?.event.clearInstanceListeners(marker.current);marker.current.map=null}if(endMarker.current)endMarker.current.map=null;endMarker.current=null;if(userMarker.current)userMarker.current.map=null;userMarker.current=null;if(taxiMarker.current)taxiMarker.current.map=null;taxiMarker.current=null;line.current?.setMap(null);if(map.current)api.current?.event.clearInstanceListeners(map.current);map.current=null;marker.current=null;line.current=null;container.replaceChildren()};
 },[key,state.language,readOnly,attempt,loadTimeoutMs]);
 useEffect(()=>{
  const instance=map.current,pin=marker.current;if(!ready||!instance||!pin)return;
  pin.position=point?position(point):undefined;
  if(point&&!hasCameraTarget&&!passengerPoint&&instance.getBounds()&&!instance.getBounds()?.contains(position(point)))instance.setCenter(position(point));
 },[point,passengerPoint,hasCameraTarget,ready]);
 useEffect(()=>{
  if(!ready||!map.current||!api.current||!line.current)return;
  const path=route?.map(position)??[];line.current.setPath(path);
  const hasDestination=destinationLat!==undefined&&destinationLng!==undefined;
  const destination=hasDestination
   ?{lat:destinationLat,lng:destinationLng}:path.length>1?path[path.length-1]:null;
  if(destination){
   if(marker.current)marker.current.content=endpointBadge(hasDestination||state.language!=='ar'?'A':'أ','#102a43');
   if(!endMarker.current)endMarker.current=new api.current.marker.AdvancedMarkerElement({
    map:map.current,content:endpointBadge(hasDestination||state.language!=='ar'?'B':'ب','#006da5'),title:state.language==='ar'?'B: الوجهة':'B: destination',
   });
   endMarker.current.position=destination;
  }else if(endMarker.current){endMarker.current.map=null;endMarker.current=null}
  if(hasCameraTarget)return;
  const endpoints=pickupLat!==undefined&&pickupLng!==undefined&&destination?[{lat:pickupLat,lng:pickupLng},destination]:[];
  const overview=[...path,...endpoints];
  if(overview.length>1){
   const bounds=new api.current.LatLngBounds();
   overview.forEach(p=>bounds.extend(p));
   if(taxiMarker.current?.position)bounds.extend(taxiMarker.current.position);
   map.current.fitBounds(bounds,38);
  }
 },[route,ready,state.language,destinationLat,destinationLng,pickupLat,pickupLng,hasCameraTarget]);
 useEffect(()=>{
  if(!ready||!map.current||!api.current||!cameraTarget)return;
  const center=position(cameraTarget.point);
  if(cameraTarget.overview&&route&&route.length>1){const bounds=new api.current.LatLngBounds();route.forEach(point=>bounds.extend(position(point)));map.current.fitBounds(bounds,30)}else{map.current.setCenter(center);map.current.setZoom(cameraTarget.zoom??19)}
  if(cameraTarget.isLocation===false)return;
  if(!userMarker.current){
   const dot=document.createElement('div');Object.assign(dot.style,{width:'18px',height:'18px',background:'#2688e8',border:'3px solid white',borderRadius:'50%',boxShadow:'0 0 0 8px #2688e822'});
   userMarker.current=new api.current.marker.AdvancedMarkerElement({map:map.current,position:center,content:dot,title:state.language==='ar'?'موقعي الحالي':'My current location'});
  }else userMarker.current.position=center;
 },[cameraTarget,ready,state.language,route]);
 useEffect(()=>{
  const instance=map.current,maps=api.current;
  if(!ready||!instance||!maps)return;
  const tracked=passengerPoint??taxiPoint;
  if(!tracked){if(taxiMarker.current)taxiMarker.current.map=null;taxiMarker.current=null;return}
  const taxi=position(tracked),first=!taxiMarker.current;
  if(!taxiMarker.current){
   const icon=document.createElement('div');icon.textContent=passengerPoint?'●':'🚕';
   Object.assign(icon.style,{display:'grid',placeItems:'center',width:'34px',height:'34px',background:passengerPoint?'#15803d':'#102a43',color:'white',border:'2px solid white',borderRadius:'50%',fontSize:'21px'});
   taxiMarker.current=new maps.marker.AdvancedMarkerElement({map:instance,position:taxi,content:icon,title:passengerPoint?(state.language==='ar'?'موقع الزبون':'Customer location'):(state.language==='ar'?'موقع التاكسي':'Taxi location')});
  }else taxiMarker.current.position=taxi;
  if(hasCameraTarget)return;
  if(passengerPoint){
   instance.setCenter(taxi);
   if(first)instance.setZoom(18);
   return;
  }
  const bounds=instance.getBounds();
  if(point&&(first||bounds&&!bounds.contains(taxi))){
   if(destinationLat===undefined&&Math.abs(point.latitude-tracked.latitude)<0.0003&&Math.abs(point.longitude-tracked.longitude)<0.0003){
    instance.setCenter(taxi);instance.setZoom(17);
   }else{
    const overview=new maps.LatLngBounds();overview.extend(position(point));overview.extend(taxi);
    if(destinationLat!==undefined&&destinationLng!==undefined)overview.extend({lat:destinationLat,lng:destinationLng});
    for(const pointOnRoute of route??[])overview.extend(position(pointOnRoute));
    instance.fitBounds(overview,42);
   }
  }
 },[point,taxiPoint,passengerPoint,hasCameraTarget,ready,state.language,destinationLat,destinationLng,route]);
 useEffect(()=>{map.current?.setOptions({tilt:0,heading:0,headingInteractionEnabled:!lean,tiltInteractionEnabled:false})},[lean,ready]);
 return <View style={compact?{flex:1,minHeight:minMapHeight}:{gap:10}}>
  {React.createElement('div',{ref:host,role:'region','aria-label':readOnly&&destinationPoint?t('خريطة الرحلة','Ride map'):t('خريطة Google لاختيار الموقع','Google map to choose a location'),style:{height:compact?'100%':340,minHeight:compact?minMapHeight:340,width:'100%',borderRadius:compact?0:16,overflow:'hidden',background:colors.surface}})}
  {(!key||error||!ready)&&<View style={{position:'absolute',left:readOnly&&compact?6:16,right:readOnly&&compact?6:16,top:readOnly&&compact?4:compact?70:30,padding:readOnly&&compact?6:18,borderRadius:14,gap:12,backgroundColor:colors.background}}>
   {!key||error?<Label>{readOnly?t('الخريطة غير متاحة الآن.','The map is unavailable right now.'):t('خريطة Google غير متاحة حاليًا. يمكنك إدخال العنوان يدويًا والمحاولة لاحقًا.','Google Maps is not available right now. You can enter an address by hand and try later.')}</Label>:<><ActivityIndicator color={colors.purple}/><Label>{t('جارٍ تحميل خريطة Google…','Loading Google Maps…')}</Label></>}
   {key&&error&&<Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>setAttempt(value=>value+1)}/>}
  </View>}
  {!compact&&!readOnly&&ready&&<Button secondary title={t('اختيار مركز الخريطة','Select map center')} onPress={()=>{const center=map.current?.getCenter();if(center){const next={latitude:center.lat(),longitude:center.lng()};if(isCoordinate(next))onChange(next)}}}/>}
 </View>;
}
