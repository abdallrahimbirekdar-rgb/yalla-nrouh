import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {siteCurrentPosition} from '../site-bridge';
import {recentWebPosition} from '../web-position';
import {type CameraTarget,useCurrentPosition} from '../use-current-position';
import {pickupAllowed,MAX_PICKUP_METERS} from '../pickup-policy';
import MapCanvas from '../map/MapCanvas';
import {searchGooglePlaces} from '../map/search-places';
import {useAuth} from '../auth';
import {useApp} from '../context';
import {formatCoordinate,type Coordinate} from '../geo';
import {type Place} from '../api';
import {cloudSavedPlaces,cloudSavePlaces,type SavedPlace} from '../cloud-api';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
export default function LocationPicker(){
 const {target,returnTo}=useLocalSearchParams<{target:string;returnTo?:string}>();
 const pickup=target==='pickup',fromCloud=returnTo==='cloud';
 const {draft,setDraft,state,ready}=useApp();const auth=useAuth();const t=useText();
 const gps=useCurrentPosition(ready&&pickup);const original=pickup?draft.pickupPoint:draft.destinationPoint;
 const initialCenter=useRef<Coordinate|undefined>(original??draft.pickupPoint??(Platform.OS==='web'?recentWebPosition(60000):null)??undefined);
 const [point,setPoint]=useState<Coordinate|null>(original??null),[label,setLabel]=useState(pickup?draft.pickup:draft.destination);
 const [query,setQuery]=useState(''),[results,setResults]=useState<Place[]>([]),[saved,setSaved]=useState<SavedPlace[]>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false);
 const [selectionCamera,setSelectionCamera]=useState<CameraTarget>();
 const alive=useRef(true),task=useRef(0);const token=auth.session?.access_token??null;const account=auth.session?.user.id;const accountRef=useRef(account);accountRef.current=account;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const loadSaved=useCallback(async()=>{
  if(!token)return;
  setLoaded(false);
  try{const list=await cloudSavedPlaces(token);if(alive.current&&accountRef.current===account){setSaved(list);setLoaded(true)}}
  catch{if(alive.current)setMessage(state.language==='ar'?'تعذر تحميل الأماكن المحفوظة. أعد المحاولة.':'Could not load saved places. Try again.')}
 },[token,account,state.language])
 useEffect(()=>{void loadSaved()},[loadSaved]); // Account places are fetched from the authenticated user only.
 function goBack(){if(fromCloud)router.replace('/cloud');else router.replace({pathname:'/',params:{booking:'1'}})}
 function choose(next:Coordinate,nextLabel?:string){setPoint(next);setLabel(nextLabel??(pickup?t('نقطة الالتقاء على الخريطة','Meeting point on the map'):t('نقطة الوصول على الخريطة','Destination on the map')));setMessage('')}
 async function selectCurrent(){
  const next=await gps.locate();
  if(next&&alive.current){choose(next,t('موقعي الحالي','My current location'));setSelectionCamera({point:next,revision:Date.now()})}
 }
 async function search(){
  if(busy||query.trim().length<3)return;const id=++task.current;setBusy(true);setMessage('');setResults([]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const places=await Promise.race([searchGooglePlaces(query,state.language,gps.camera?.point??draft.pickupPoint),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),15000)})]);
   if(alive.current&&id===task.current){setResults(places);if(!places.length)setMessage(t('لا توجد نتائج. جرّب اسمًا أوضح أو حدد نقطة على الخريطة.','No results. Try another name or choose on the map.'))}
  }catch(error){console.warn('[yalla:places]',error instanceof Error?error.message:'places_unavailable');if(alive.current&&id===task.current)setMessage(t('تعذر البحث في Google حاليًا. أعد المحاولة أو اختر نقطة على الخريطة.','Google search failed. Try again or choose a point on the map.'))}
  finally{if(timer)clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
 }
 async function confirm(){
  if(!point||busy)return;setBusy(true);setMessage('');
  try{
   // Recheck the actual phone position at confirmation, never a selected pin.
   if(pickup){const current=await siteCurrentPosition(false);if(!pickupAllowed(point,current)){setMessage(t('نقطة الانطلاق تبعد أكثر من ٥٠٠ متر عن موقعك الحالي. اختر نقطة أقرب.','Pickup is more than 500 metres away. Choose a closer point.'));return}}
   if(!alive.current)return;
   setDraft(previous=>({...previous,...(pickup?{pickup:label.trim()||formatCoordinate(point),pickupPoint:point}:{destination:label.trim()||formatCoordinate(point),destinationPoint:point})}));goBack();
  }catch{if(alive.current)setMessage(t('نحتاج موقعك الحالي للتحقق من مسافة الانطلاق. فعّل الموقع والإذن ثم أعد المحاولة.','We need your location to check pickup distance. Turn on location and allow access.'))}
  finally{if(alive.current)setBusy(false)}
 }
 async function savePlace(removeId?:string){
  if(!token||saving||!loaded||(!removeId&&!point))return;setSaving(true);setMessage('');
  try{
   const entry:SavedPlace|undefined=point?{id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),label:label.trim()||formatCoordinate(point),coordinate:point}:undefined;
   const next=removeId?saved.filter(p=>p.id!==removeId):[entry!,...saved].slice(0,20);
   const verified=await cloudSavePlaces(token,next);
   if(alive.current&&accountRef.current===account){setSaved(verified);setMessage(t('تم تحديث الأماكن المحفوظة في حسابك.','Saved places updated in your account.'))}
  }catch{if(alive.current)setMessage(t('لم يتم الحفظ. تحقق من الاتصال أو سجّل الدخول مجددًا ثم حاول.','Could not save. Check internet or sign in again, then retry.'))}
  finally{if(alive.current)setSaving(false)}
 }
 const current=gps.camera?.point??null;
 const allowed=!pickup||pickupAllowed(point??undefined,current);
 return <Page backTo={fromCloud?'/cloud':'/'} title={pickup?t('نقطة الانطلاق','Pickup point'):t('نقطة الوصول','Destination point')}>
  <Label muted>{pickup?t('استخدم موقعك الحالي، أو اختر نقطة على الخريطة ضمن ٥٠٠ متر منه.','Use your location, or choose a map point within 500 metres.'):t('اختر على الخريطة، أو ابحث باسم المكان، أو استخدم مكانًا محفوظًا في حسابك.','Choose on the map, search by name, or use a saved place.')}</Label>
  {pickup&&<Button icon="locate" title={t('استخدام موقعي الحالي','Use my current location')} onPress={()=>void selectCurrent()} disabled={gps.busy||busy}/>}
  {!pickup&&<Panel>
   <Field label={t('البحث في Google Maps','Search Google Maps')} value={query} onChangeText={value=>{task.current++;setBusy(false);setQuery(value);setResults([])}} maxLength={200} placeholder={t('اسم مكان أو شارع أو منطقة','Place, street or area')}/>
   <Button icon="search" title={t('بحث عن المكان','Search places')} onPress={()=>void search()} disabled={busy||query.trim().length<3}/>
   {results.length>0&&<Label muted>{t('نتائج Google Maps — اختر نتيجة ثم عدّل النقطة إن أردت','Google Maps results — choose one, then move the point if needed')}</Label>}
   {results.map(place=><Button key={place.id} secondary title={place.label} onPress={()=>{choose(place.coordinate,place.label);setSelectionCamera({point:place.coordinate,revision:Date.now(),isLocation:false});setResults([])}}/>)}
  </Panel>}
  <MapCanvas point={point} initialCenter={initialCenter.current} cameraTarget={selectionCamera??gps.camera} onChange={next=>{gps.chooseManually();choose(next)}}/>
  {(gps.busy||busy)&&<ActivityIndicator accessibilityLabel={t('جارٍ التحميل','Loading')}/>}
  {pickup&&gps.failure&&<View accessibilityRole="alert"><Label>{t('تعذر تحديد موقعك الحالي. تأكد من تشغيل الموقع والسماح بالموقع الدقيق ثم أعد المحاولة.','Could not get your location. Turn on location, allow precise access, then try again.')}</Label><Button secondary title={t('تحديد موقعي مجددًا','Find my location again')} onPress={()=>void selectCurrent()} disabled={gps.busy}/></View>}
  {point&&<Panel>
   <Label muted>{t('تم تحديد النقطة على الخريطة','Point selected on the map')}</Label>
   <Field label={t('اسم المكان أو وصف نقطة الالتقاء','Place name or meeting point')} value={label} onChangeText={setLabel} maxLength={200}/>
   {pickup&&!allowed&&<Label>{t(`يجب أن تكون نقطة الانطلاق ضمن ${MAX_PICKUP_METERS} متر من موقعك الحالي.`,`Pickup must be within ${MAX_PICKUP_METERS} metres of your location.`)}</Label>}
   <Button icon="checkmark-circle-outline" title={pickup?t('تأكيد نقطة الانطلاق','Confirm pickup'):t('تأكيد نقطة الوصول والعودة للحجز','Confirm destination and return to booking')} onPress={()=>void confirm()} disabled={busy||!allowed}/>
   {!pickup&&token&&<Button secondary icon="bookmark-outline" title={t('حفظ المكان في حسابي','Save place to my account')} onPress={()=>void savePlace()} disabled={saving||!loaded}/>}
  </Panel>}
  {!pickup&&<Panel>
   <Label large>{t('أماكني المحفوظة','My saved places')}</Label>
   {!token?<><Label muted>{t('سجّل الدخول لعرض أماكنك وحفظ المنزل والعمل وغيرها.','Sign in to view and save home, work and other places.')}</Label><Button secondary title={t('الدخول إلى حسابي','Sign in to my account')} onPress={()=>{if(point)setDraft(previous=>({...previous,destination:label.trim()||t('نقطة الوصول على الخريطة','Destination on the map'),destinationPoint:point}));router.push({pathname:'/account',params:{next:'destination'}})}}/></>:<>
    {!loaded?<Button secondary title={t('تحميل الأماكن المحفوظة','Load saved places')} onPress={()=>void loadSaved()}/>:saved.length===0&&<Label muted>{t('لم تحفظ أماكن بعد. اختر نقطة وسمّها ثم اضغط حفظ المكان.','No saved places yet. Choose a point, name it and tap Save place.')}</Label>}
    {saved.map(place=><View key={place.id} style={{gap:6}}><Button secondary icon="bookmark" title={place.label} onPress={()=>{choose(place.coordinate,place.label);setSelectionCamera({point:place.coordinate,revision:Date.now(),isLocation:false})}}/><Button secondary title={t('حذف المكان المحفوظ','Delete saved place')} onPress={()=>void savePlace(place.id)} disabled={saving}/></View>)}
   </>}
  </Panel>}
  {message!==''&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
  <Button secondary title={t('العودة دون حفظ','Back without saving')} onPress={goBack}/>
 </Page>;
}
