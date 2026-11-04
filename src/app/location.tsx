import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,View} from 'react-native';
import {announceWebPosition,recentWebPosition} from '../web-position';
import {isNativeWebView,siteCurrentPosition} from '../site-bridge';
import {router,useLocalSearchParams} from 'expo-router';
import * as Location from 'expo-location';
import MapCanvas from '../map/MapCanvas';
import {useApp} from '../context';
import {formatCoordinate,parseCoordinate,type Coordinate} from '../geo';
import {createPlacesClient,ServiceError,type Place} from '../api';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
const placesClient=createPlacesClient(process.env.EXPO_PUBLIC_API_URL);
export default function LocationPicker(){
  const {target,returnTo}=useLocalSearchParams<{target:string;returnTo?:string}>();const pickup=target==='pickup';const fromCloud=returnTo==='cloud';
  function goBack(){if(fromCloud)router.replace('/cloud');else router.replace({pathname:'/',params:{booking:'1'}})}const {draft,setDraft,state}=useApp();const t=useText();
  const original=pickup?draft.pickupPoint:draft.destinationPoint;
  // Selecting a pickup or destination should open the map immediately,
  // rather than requiring a second tap on a hidden map button.
  const [mapVisible,setMapVisible]=useState(true);
  const [cameraTarget,setCameraTarget]=useState(()=>{
   const fix=Platform.OS==='web'?recentWebPosition(60000):null;
   return fix?{point:fix,revision:1}:undefined;
  });
  const [point,setPoint]=useState<Coordinate|null>(original??null),[label,setLabel]=useState(pickup?draft.pickup:draft.destination),[query,setQuery]=useState(''),[results,setResults]=useState<Place[]>([]);
  const [latitude,setLatitude]=useState(original?String(original.latitude):''),[longitude,setLongitude]=useState(original?String(original.longitude):''),[message,setMessage]=useState(''),[busy,setBusy]=useState<'gps'|'search'|null>(null),[manual,setManual]=useState(false);
  const request=useRef<AbortController|null>(null);const alive=useRef(true);const task=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort()}},[]);
  function choose(next:Coordinate,nextLabel?:string){setPoint(next);setLatitude(String(next.latitude));setLongitude(String(next.longitude));setLabel(nextLabel??formatCoordinate(next));setMessage('');setCameraTarget(previous=>({point:next,revision:(previous?.revision??0)+1}));}
  async function currentLocation(){
    if(busy)return;const id=++task.current;setBusy('gps');setMessage('');
    const active=()=>alive.current&&task.current===id;let gpsTimer:ReturnType<typeof setTimeout>|undefined;
    try{if(Platform.OS==='web'){const point=await siteCurrentPosition(true);if(active()){choose(point);if(!isNativeWebView())announceWebPosition(point)}return}
    const permission=await Location.requestForegroundPermissionsAsync();if(!active())return;if(permission.status!=='granted'){setMessage(t('إذن الموقع مرفوض. يمكنك اختيار النقطة أو إدخال الإحداثيات يدويًا.','Location access was denied. Select a point or enter coordinates.'));return}
      if(!await Location.hasServicesEnabledAsync()){if(active())setMessage(t('خدمة الموقع متوقفة. فعّلها أو أدخل الإحداثيات.','Location services are off. Turn them on or enter coordinates.'));return}
      const position=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),new Promise<never>((_,reject)=>{gpsTimer=setTimeout(()=>reject(Error('timeout')),15000)})]);if(active())choose({latitude:position.coords.latitude,longitude:position.coords.longitude});
    }catch{if(active())setMessage(t('تعذر تحديد موقعك. جرّب في مكان مفتوح أو أدخل الإحداثيات.','Could not find your location. Try outside or enter coordinates.'))}finally{if(gpsTimer)clearTimeout(gpsTimer);if(active())setBusy(null)}
  }
  async function search(){
    if(busy)return;request.current?.abort();request.current=new AbortController();setBusy('search');setMessage('');setResults([]);const id=++task.current;
    try{const places=await placesClient.search(query,state.language,draft.region,request.current.signal);if(alive.current&&task.current===id){setResults(places);if(!places.length)setMessage(t('لم نعثر على نتائج. عدّل البحث أو حدد النقطة يدويًا.','No results. Change the search or select a point.'))}}
    catch(error){if(!alive.current||task.current!==id)return;setMessage(error instanceof ServiceError&&error.code==='not_configured'?t('البحث بالعنوان يحتاج ربط خدمة الأماكن. يمكنك استخدام الخريطة أو الموقع الحالي أو الإحداثيات.','Address search needs a connected places service. Use the map, your location or coordinates.'):t('تعذر البحث الآن. أعد المحاولة أو حدد الموقع يدويًا.','Search failed. Try again or enter the location.'))}finally{if(alive.current&&task.current===id)setBusy(null)}
  }
  function confirm(){if(!point)return;setDraft(previous=>({...previous,...(pickup?{pickup:label.trim()||formatCoordinate(point),pickupPoint:point}:{destination:label.trim()||formatCoordinate(point),destinationPoint:point})}));goBack()}
  return <Page backTo={fromCloud?'/cloud':'/'} title={pickup?t('حدد نقطة الانطلاق','Choose pickup location'):t('حدد الوجهة','Choose destination')}>
    <Field label={pickup?t('عنوان الانطلاق','Pickup address'):t('عنوان الوصول','Destination address')} value={label} onChangeText={value=>{setLabel(value);setQuery(value);setResults([]);setPoint(null);setLatitude('');setLongitude('')}} maxLength={200} placeholder={t('المدينة، الشارع أو اسم المكان','City, street or place')}/>
    <Button secondary icon="map-outline" title={t(mapVisible?'إخفاء الخريطة':'إظهار الخريطة',mapVisible?'Hide map':'Show map')} onPress={()=>setMapVisible(!mapVisible)}/>
    {mapVisible&&<MapCanvas point={point} cameraTarget={cameraTarget} onChange={choose}/>}
    {point&&<Panel><Label>{t('الموقع المختار','Selected location')}</Label><Label muted>{formatCoordinate(point)}</Label><Field label={t('وصف المكان','Location label')} value={label} onChangeText={setLabel} maxLength={200}/><Button icon="checkmark-circle-outline" title={t('تأكيد الموقع','Confirm location')} onPress={confirm} disabled={Boolean(busy)}/></Panel>}
    <Button secondary title={t('بحث عن المكان','Search places')} onPress={search} disabled={Boolean(busy)||query.trim().length<3}/>
    {results.map(place=><Button key={place.id} secondary title={place.label} onPress={()=>{choose(place.coordinate,place.label);setResults([])}}/>)}
    <Button title={t('استخدام موقعي الحالي','Use my current location')} onPress={currentLocation} disabled={Boolean(busy)}/>
    {busy&&<ActivityIndicator accessibilityLabel={t('جارٍ التحميل','Loading')}/>}
    <Button secondary title={t(manual?'إخفاء الإحداثيات':'إدخال الإحداثيات يدويًا',manual?'Hide coordinates':'Enter coordinates manually')} onPress={()=>setManual(!manual)}/>
    {manual&&<Panel><Label>{t('إدخال الإحداثيات يدويًا','Enter coordinates')}</Label><Field label={t('خط العرض','Latitude')} value={latitude} editable={!busy} onChangeText={value=>{setLatitude(value);setPoint(null)}} keyboardType="numbers-and-punctuation" maxLength={24}/><Field label={t('خط الطول','Longitude')} value={longitude} editable={!busy} onChangeText={value=>{setLongitude(value);setPoint(null)}} keyboardType="numbers-and-punctuation" maxLength={24}/><Button secondary title={t('تطبيق الإحداثيات','Apply coordinates')} disabled={Boolean(busy)} onPress={()=>{const next=parseCoordinate(latitude,longitude);if(next)choose(next);else setMessage(t('أدخل إحداثيات صالحة. خط العرض بين ‎-90 و90، والطول بين ‎-180 و180.','Enter valid coordinates. Latitude: -90 to 90. Longitude: -180 to 180.'))}}/></Panel>}
    {message!==''&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
    <Label muted>{t('يُطلب إذن الموقع عند الضغط فقط. البحث بالعنوان يرسل عبارة البحث إلى الخدمة المرتبطة.','Location access is requested only when you tap. Address search sends the search text to the connected service.')}</Label>
    {!point&&<Button title={t('استخدام هذا العنوان','Use this address')} disabled={!label.trim()||Boolean(busy)} onPress={()=>{setDraft(previous=>({...previous,...(pickup?{pickup:label.trim(),pickupPoint:undefined}:{destination:label.trim(),destinationPoint:undefined})}));goBack()}}/>}<Button secondary title={t('العودة دون حفظ','Back without saving')} onPress={()=>goBack()}/>
  </Page>
}
