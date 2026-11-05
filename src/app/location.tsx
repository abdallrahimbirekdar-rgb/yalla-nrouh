import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {siteCurrentPosition} from '../site-bridge';
import {pickupPosition,pickupPositionMessage} from '../pickup-position';
import {PositionError} from '../current-position';
import {recentWebPosition} from '../web-position';
import {type CameraTarget,useCurrentPosition} from '../use-current-position';
import MapCanvas from '../map/MapCanvas';
import {googlePlaceAutocomplete,searchGooglePlaces} from '../map/search-places';
import type {PlaceSuggestion} from '../map/place-autocomplete';
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
 const gps=useCurrentPosition(ready&&pickup);const original=pickup?undefined:draft.destinationPoint;
 const initialCenter=useRef<Coordinate|undefined>(original??(!pickup?draft.pickupPoint:undefined)??(Platform.OS==='web'?recentWebPosition(60000):null)??undefined);
 const [point,setPoint]=useState<Coordinate|null>(original??null),[label,setLabel]=useState(pickup?draft.pickup:draft.destination);
 const [suggestions,setSuggestions]=useState<PlaceSuggestion[]>([]),[suggesting,setSuggesting]=useState(false),[suggestionError,setSuggestionError]=useState('');
 const autocomplete=useRef(googlePlaceAutocomplete()).current,near=useRef(draft.pickupPoint);near.current=gps.camera?.point??draft.pickupPoint;
 const [query,setQuery]=useState(''),[results,setResults]=useState<Place[]>([]),[saved,setSaved]=useState<SavedPlace[]>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false);
 const [selectionCamera,setSelectionCamera]=useState<CameraTarget>();
 const alive=useRef(true),task=useRef(0);const token=auth.session?.access_token??null;const account=auth.session?.user.id;const accountRef=useRef(account);accountRef.current=account;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  const id=++task.current;setSuggestions([]);setSuggesting(false);setSuggestionError('');
  if(pickup||query.trim().length<3){autocomplete.reset();return}
  let active=true;let deadline:ReturnType<typeof setTimeout>|undefined;
  const timer=setTimeout(()=>{
   if(id!==task.current)return;setSuggesting(true);
   void Promise.race([
    autocomplete.search(query,state.language,near.current),
    new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(Error('timeout')),10000)})
   ]).then(items=>{
    if(active&&id===task.current){setSuggestions(items);if(!items.length)setSuggestionError(state.language==='ar'?'لا توجد اقتراحات. أكمل العنوان أو اضغط بحث.':'No suggestions. Add more text or tap Search.')}
   }).catch(()=>{
    if(active&&id===task.current)setSuggestionError(state.language==='ar'?'تعذر تحميل الاقتراحات. جرّب زر البحث أو اختر على الخريطة.':'Suggestions could not load. Try Search or choose on the map.')
   }).finally(()=>{clearTimeout(deadline);if(active&&id===task.current)setSuggesting(false)})
  },500);
  return()=>{active=false;clearTimeout(timer);clearTimeout(deadline)}
 },[query,state.language,pickup,autocomplete]);
 const loadSaved=useCallback(async()=>{
  if(!token||pickup)return;
  setLoaded(false);
  try{const list=await cloudSavedPlaces(token);if(alive.current&&accountRef.current===account){setSaved(list);setLoaded(true)}}
  catch{if(alive.current)setMessage(state.language==='ar'?'تعذر تحميل الأماكن المحفوظة. أعد المحاولة.':'Could not load saved places. Try again.')}
 },[token,account,state.language,pickup])
 useEffect(()=>{void loadSaved()},[loadSaved]); // Account places are fetched from the authenticated user only.
 useEffect(()=>{if(pickup&&gps.camera?.point){setPoint(gps.camera.point);setLabel(state.language==='ar'?'موقعي الحالي':'My current location')}},[pickup,gps.camera,state.language]);
 function goBack(){if(fromCloud)router.replace('/cloud');else router.replace({pathname:'/',params:{booking:'1'}})}
 function choose(next:Coordinate,nextLabel?:string){setPoint(next);setLabel(nextLabel??(pickup?t('نقطة الالتقاء على الخريطة','Meeting point on the map'):t('نقطة الوصول على الخريطة','Destination on the map')));setMessage('')}
 async function selectCurrent(){
  const next=await gps.locate();
  if(next&&alive.current){choose(next,t('موقعي الحالي','My current location'));setSelectionCamera({point:next,revision:Date.now()})}
 }
 async function selectSuggestion(suggestion:PlaceSuggestion){
  if(busy)return;const id=++task.current;setBusy(true);setSuggesting(false);setMessage('');let timer:ReturnType<typeof setTimeout>|undefined;
  try{const place=await Promise.race([suggestion.select(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),12000)})]);if(alive.current&&id===task.current){choose(place.coordinate,place.label);setSelectionCamera({point:place.coordinate,revision:Date.now(),isLocation:false});setSuggestions([]);setResults([]);setSuggestionError('')}}catch{if(alive.current&&id===task.current)setMessage(t('تعذر تحديد المكان. أعد المحاولة أو اختر على الخريطة.','Could not find this place. Try again or choose on the map.'))}finally{clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
 }
 async function search(){
  if(busy||query.trim().length<3)return;const id=++task.current;autocomplete.reset();setSuggestions([]);setSuggesting(false);setSuggestionError('');setBusy(true);setMessage('');setResults([]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const places=await Promise.race([searchGooglePlaces(query,state.language,gps.camera?.point??draft.pickupPoint),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),15000)})]);
   if(alive.current&&id===task.current){setResults(places);if(!places.length)setMessage(t('لا توجد نتائج. جرّب اسمًا أوضح أو حدد نقطة على الخريطة.','No results. Try another name or choose on the map.'))}
  }catch(error){console.warn('[yalla:places]',error instanceof Error?error.message:'places_unavailable');if(alive.current&&id===task.current)setMessage(t('تعذر البحث في Google حاليًا. أعد المحاولة أو اختر نقطة على الخريطة.','Google search failed. Try again or choose a point on the map.'))}
  finally{if(timer)clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
 }
 async function confirm(){
  if(!pickup&&!point||busy)return;setBusy(true);setMessage('');
  try{
   const selected=pickup?await pickupPosition(siteCurrentPosition):point;
   if(!alive.current||!selected)return;
   setDraft(previous=>({...previous,...(pickup?{pickup:t('موقعي الحالي','My current location'),pickupPoint:selected}:{destination:label.trim()||formatCoordinate(selected),destinationPoint:selected})}));goBack();
  }catch(error){if(alive.current)setMessage(pickupPositionMessage(error,state.language==='ar'))}
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
 return <Page backTo={fromCloud?'/cloud':'/'} title={pickup?t('نقطة الانطلاق','Pickup point'):t('نقطة الوصول','Destination point')}>
  <Label muted>{pickup?t('نقطة الانطلاق هي موقع الهاتف الحالي فقط، ولا يمكن تحريكها على الخريطة.','Pickup uses your current phone location only. You cannot move it on the map.'):t('اختر على الخريطة، أو ابحث باسم المكان، أو استخدم مكانًا محفوظًا في حسابك.','Choose on the map, search by name, or use a saved place.')}</Label>
  {pickup&&<Button icon="locate" title={t('استخدام موقعي الحالي','Use my current location')} onPress={()=>void selectCurrent()} disabled={gps.busy||busy}/>}
  {!pickup&&<Panel>
   <Field label={t('البحث في Google Maps','Search Google Maps')} value={query} onChangeText={value=>{task.current++;setBusy(false);setSuggesting(false);setQuery(value);setResults([]);setSuggestions([]);setMessage('')}} maxLength={200} placeholder={t('اسم مكان أو شارع أو منطقة','Place, street or area')}/>
   {suggesting&&<View style={{gap:6}}><ActivityIndicator/><Label muted>{t('جارٍ اقتراح الأماكن…','Finding place suggestions…')}</Label></View>}
   {suggestions.length>0&&<View style={{gap:6}}><Label muted>{t('اقتراحات Google Maps','Google Maps suggestions')}</Label>{suggestions.map(suggestion=><Button key={suggestion.id} secondary icon="location-outline" title={suggestion.label} disabled={busy} onPress={()=>void selectSuggestion(suggestion)}/>)}</View>}
   {!!suggestionError&&<Label muted>{suggestionError}</Label>}
   <Button icon="search" title={t('بحث عن المكان','Search places')} onPress={()=>void search()} disabled={busy||query.trim().length<3}/>
   {results.length>0&&<Label muted>{t('نتائج Google Maps — اختر نتيجة ثم عدّل النقطة إن أردت','Google Maps results — choose one, then move the point if needed')}</Label>}
   {results.map(place=><Button key={place.id} secondary title={place.label} onPress={()=>{choose(place.coordinate,place.label);setSelectionCamera({point:place.coordinate,revision:Date.now(),isLocation:false});setResults([])}}/>)}
   {point&&<Label muted>{t('الوجهة المختارة: ','Selected destination: ')}{label||formatCoordinate(point)}</Label>}
   <Button icon="checkmark-circle-outline" title={t('تأكيد نقطة الوصول والعودة للحجز','Confirm destination and return to booking')} onPress={()=>void confirm()} disabled={busy||!point}/>
  </Panel>}
  <MapCanvas readOnly={pickup} point={point} initialCenter={initialCenter.current} cameraTarget={selectionCamera??gps.camera} onChange={next=>{if(!pickup){gps.chooseManually();choose(next)}}}/>
  {(gps.busy||busy)&&<ActivityIndicator accessibilityLabel={t('جارٍ التحميل','Loading')}/>}
  {pickup&&gps.failure&&<View accessibilityRole="alert"><Label>{pickupPositionMessage(new PositionError(gps.failure),state.language==='ar')}</Label><Button secondary title={t('تحديد موقعي مجددًا','Find my location again')} onPress={()=>void selectCurrent()} disabled={gps.busy}/></View>}
  {point&&<Panel>
   <Label muted>{t('تم تحديد النقطة على الخريطة','Point selected on the map')}</Label>
   {pickup?<Label>{t('موقعي الحالي','My current location')}</Label>:<Field label={t('اسم المكان','Place name')} value={label} onChangeText={setLabel} maxLength={200}/>}
   {pickup&&<Button icon="checkmark-circle-outline" title={t('تأكيد نقطة الانطلاق','Confirm pickup')} onPress={()=>void confirm()} disabled={busy}/>}
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
