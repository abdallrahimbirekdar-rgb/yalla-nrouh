import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,Platform,View} from 'react-native';
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
import {formatCoordinate,sameCoordinate,type Coordinate} from '../geo';
import {type Place} from '../api';
import {cloudSavedPlaces,cloudSavePlaces,type SavedPlace} from '../cloud-api';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
import {addressSlots,addressSlotLabel,isAddressSlot} from '../saved-address-labels';
export default function LocationRoute(){
 const {target,focus,view,edit}=useLocalSearchParams<{target?:string;focus?:string;view?:string;edit?:string}>();
 const account=useAuth().session?.user.id;
 return <LocationPicker key={JSON.stringify([target,view,edit,account])} pickup={target==='pickup'} focus={focus==='1'} savedView={view==='saved'} edit={edit}/>;
}
function LocationPicker({pickup,focus,savedView,edit}:{pickup:boolean;focus:boolean;savedView:boolean;edit?:string}){
 const {draft,setDraft,state,ready}=useApp();const auth=useAuth();const t=useText();
 const editing=savedView&&!!edit, managing=savedView&&!edit;
 const gps=useCurrentPosition(ready&&pickup&&draft.pickupMode!=='manual');
 const original=savedView?undefined:pickup?draft.pickupPoint:draft.destinationPoint;
 const initialCenter=useRef<Coordinate|undefined>(original??(Platform.OS==='web'?recentWebPosition(60000):null)??draft.pickupPoint??draft.destinationPoint);
 const [point,setPoint]=useState<Coordinate|null>(original??null),[label,setLabel]=useState(savedView?'':pickup?draft.pickup:draft.destination);
 const [pickupMode,setPickupMode]=useState<'current'|'manual'>(draft.pickupMode==='manual'?'manual':'current');
 const currentChosen=useRef(false);
 const [confirming,setConfirming]=useState(false);
 const [suggestions,setSuggestions]=useState<PlaceSuggestion[]>([]),[suggesting,setSuggesting]=useState(false),[suggestionError,setSuggestionError]=useState('');
 const autocomplete=useRef(googlePlaceAutocomplete()).current,near=useRef(draft.pickupPoint);near.current=gps.camera?.point??draft.pickupPoint;
 const [query,setQuery]=useState(''),[results,setResults]=useState<Place[]>([]),[saved,setSaved]=useState<SavedPlace[]>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false);
 const [selectionCamera,setSelectionCamera]=useState<CameraTarget>();
 const alive=useRef(true),task=useRef(0);const token=auth.session?.access_token??null;const account=auth.session?.user.id;const accountRef=useRef(account);accountRef.current=account;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  const id=++task.current;setSuggestions([]);setSuggesting(false);setSuggestionError('');
  if(query.trim().length<3){autocomplete.reset();return}
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
 },[query,state.language,autocomplete]);
 const loadSaved=useCallback(async()=>{
  if(!token)return;
  setLoaded(false);
  try{
   const list=await cloudSavedPlaces(token);
   if(!alive.current||accountRef.current!==account)return;
   setSaved(list);setLoaded(true);
  }catch{
   if(alive.current&&accountRef.current===account)setMessage(state.language==='ar'?'تعذر تحميل العناوين المحفوظة. أعد المحاولة.':'Could not load saved addresses. Try again.');
  }
 },[token,account,state.language]);
 useEffect(()=>{void loadSaved()},[loadSaved]);
 useEffect(()=>{
  if(!pickup||pickupMode!=='current'||!gps.camera?.point)return;
  setPoint(gps.camera.point);setLabel(state.language==='ar'?'موقعي الحالي':'My current location');
 },[pickup,pickupMode,gps.camera,state.language]);
 const backTo=pickup?{pathname:'/location' as const,params:{target:'destination'}}:editing?{pathname:'/location' as const,params:{view:'saved'}}:'/' as const;
 function navigateToEditor(id:string){
  if(!confirming&&!saving)router.push({pathname:'/location',params:{view:'saved',edit:id}});
 }
 function choose(next:Coordinate,nextLabel?:string,moveCamera=false){
  if(confirming||saving)return;
  currentChosen.current=false;
  if(pickup){gps.chooseManually();setPickupMode('manual')}
  setPoint(next);setLabel(nextLabel??(pickup?t('نقطة الالتقاء على الخريطة','Meeting point on the map'):t('نقطة على الخريطة','Point on the map')));
  if(moveCamera){setSelectionCamera({point:next,revision:Date.now(),isLocation:false});Keyboard.dismiss()}
  setMessage('');
 }
 async function selectCurrent(){
  currentChosen.current=true;
  setPickupMode('current');setSelectionCamera(undefined);setMessage('');
  const next=await gps.locate();
  if(next&&alive.current&&currentChosen.current){
   setPoint(next);setLabel(t('موقعي الحالي','My current location'));
   setSelectionCamera({point:next,revision:Date.now()});
  }
 }
 async function selectSuggestion(suggestion:PlaceSuggestion){
  if(busy)return;const id=++task.current;setBusy(true);setSuggesting(false);setMessage('');let timer:ReturnType<typeof setTimeout>|undefined;
  try{const place=await Promise.race([suggestion.select(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),12000)})]);if(alive.current&&id===task.current){choose(place.coordinate,place.label,true);setSuggestions([]);setResults([]);setSuggestionError('')}}catch{if(alive.current&&id===task.current)setMessage(t('تعذر تحديد المكان. أعد المحاولة أو اختر على الخريطة.','Could not find this place. Try again or choose on the map.'))}finally{clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
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
  if(confirming||busy||(!point&&(!pickup||pickupMode==='manual')))return;
  if(pickup&&!draft.destinationPoint){
   router.replace({pathname:'/location',params:{target:'destination'}});
   return;
  }
  setConfirming(true);setMessage('');
  try{
   const selected=pickup&&pickupMode==='current'?await pickupPosition(siteCurrentPosition):point;
   if(!alive.current||!selected)return;
   if(pickup&&draft.destinationPoint&&sameCoordinate(selected,draft.destinationPoint)){
    setMessage(t('اختر نقطة انطلاق مختلفة عن الوجهة.','Choose a pickup point different from the destination.'));
    return;
   }
   Keyboard.dismiss();
   const name=label.trim()||formatCoordinate(selected);
   if(pickup){
    setDraft(previous=>({...previous,pickup:pickupMode==='current'?t('موقعي الحالي','My current location'):name,pickupPoint:selected,pickupMode}));
    router.replace('/review');
   }else{
    setDraft(previous=>({...previous,destination:name,destinationPoint:selected}));
    router.replace({pathname:'/location',params:{target:'pickup'}});
   }
  }catch(error){if(alive.current)setMessage(pickupPositionMessage(error,state.language==='ar'))}
  finally{if(alive.current)setConfirming(false)}
 }
 async function savePlace(removeId?:string){
  if(!token||saving||!loaded||(!removeId&&!point))return;
  if(!removeId&&!isAddressSlot(edit)&&saved.length>=20){
   setMessage(t('يمكن حفظ ٢٠ عنوانًا. احذف عنوانًا لإضافة عنوان جديد.','You can save 20 addresses. Remove one to add another.'));
   return;
  }
  setSaving(true);setMessage('');
  try{
   let next:SavedPlace[];
   if(removeId)next=saved.filter(place=>place.id!==removeId);
   else{
    const id=isAddressSlot(edit)?edit:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const entry={id,label:label.trim()||formatCoordinate(point!),coordinate:point!};
    next=[entry,...saved.filter(place=>place.id!==id)];
    if(next.length>20){
     setMessage(t('يمكن حفظ ٢٠ عنوانًا. احذف عنوانًا لإضافة عنوان جديد.','You can save 20 addresses. Remove one to add another.'));
     return;
    }
   }
   const verified=await cloudSavePlaces(token,next);
   if(alive.current&&accountRef.current===account){
    setSaved(verified);
    if(editing){Keyboard.dismiss();router.replace({pathname:'/location',params:{view:'saved'}})}
    else setMessage(t('تم تحديث العناوين المحفوظة في حسابك.','Saved addresses updated in your account.'));
   }
  }catch{if(alive.current)setMessage(t('لم يتم الحفظ. تحقق من الاتصال ثم حاول مرة ثانية.','Could not save. Check your connection and try again.'))}
  finally{if(alive.current)setSaving(false)}
 }
 const savedList=<>
  {!loaded?<Button secondary title={t('تحميل العناوين المحفوظة','Load saved addresses')} onPress={()=>void loadSaved()}/>:<>
   {addressSlots.map(slot=>{
    const place=saved.find(item=>item.id===slot);
    const name=addressSlotLabel(slot,t);
    return <View key={slot} style={{gap:6}}>
     <Button secondary icon={slot==='home'?'home-outline':'briefcase-outline'} title={managing||!place?(place?t('تعديل ','Edit ')+name:t('إضافة ','Add ')+name):name} onPress={()=>managing||!place?navigateToEditor(slot):choose(place.coordinate,place.label,true)}/>
     {managing&&place&&<Label muted>{place.label}</Label>}
    </View>;
   })}
   {saved.filter(place=>!isAddressSlot(place.id)).map(place=><View key={place.id} style={{gap:6}}>
    {managing?<><Label>{place.label}</Label><Button secondary icon="trash-outline" title={t('حذف العنوان','Remove address')} onPress={()=>void savePlace(place.id)} disabled={saving}/></>:<Button secondary icon="bookmark-outline" title={place.label} onPress={()=>choose(place.coordinate,place.label,true)}/>}
   </View>)}
   <Button secondary icon="add-outline" title={t('إضافة عنوان آخر','Add another address')} onPress={()=>navigateToEditor('new')}/>
  </>}
 </>;
 const notice=message?<View accessibilityRole="alert"><Label>{message}</Label></View>:null;
 const signIn=<Panel><Label>{t('سجّل الدخول لحفظ البيت والعمل وعناوينك الأخرى في حسابك.','Sign in to keep home, work and other addresses in your account.')}</Label>
  <Button title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push({pathname:'/account',params:{next:'saved'}})}/>
 </Panel>;
 if(managing||editing&&!token)return <Page title={t('العناوين المحفوظة','Saved addresses')} backTo={backTo}>
  {token?<Panel>{savedList}</Panel>:signIn}{notice}
 </Page>;
 const slot=isAddressSlot(edit)?edit:undefined;
 const oldPlace=editing&&slot?saved.find(place=>place.id===slot):undefined;
 const title=editing?(slot?t('عنوان ','Address: ')+addressSlotLabel(slot,t):t('إضافة عنوان','Add an address')):pickup?t('نقطة الانطلاق','Pickup point'):t('نقطة الوصول','Destination point');
 return <Page backTo={backTo} title={title}>
  {pickup&&<Panel>
   <Label muted>{t('الوجهة','Destination')}</Label><Label>{draft.destination}</Label>
   <Button secondary icon="locate" title={gps.busy?t('جارٍ تحديد موقعك…','Finding your location…'):t('استخدام موقعي الحالي','Use my current location')} onPress={()=>void selectCurrent()} disabled={confirming||busy||gps.busy}/>
   {gps.failure&&pickupMode==='current'&&<Label muted>{pickupPositionMessage(new PositionError(gps.failure),state.language==='ar')}</Label>}
  </Panel>}
  {oldPlace&&!point&&<Label muted>{t('العنوان المحفوظ حاليًا: ','Current saved address: ')}{oldPlace.label}</Label>}
  <Panel>
   <Label muted>{pickup?t('أو اختر نقطة التقاء أخرى بالبحث أو بالخريطة.','Or choose a different meeting point using search or the map.'):t('ابحث عن العنوان أو حدّد نقطة على الخريطة.','Search for an address or select a point on the map.')}</Label>
   <Field autoFocus={focus} label={t('البحث في Google Maps','Search Google Maps')} value={query} editable={!confirming&&!saving} onChangeText={value=>{task.current++;setBusy(false);setSuggesting(false);setQuery(value);setResults([]);setSuggestions([]);setMessage('')}} maxLength={200} placeholder={t('اسم مكان أو شارع أو منطقة','Place, street or area')}/>
   {suggesting&&<ActivityIndicator accessibilityLabel={t('جارٍ اقتراح الأماكن…','Finding place suggestions…')}/>}
   {suggestions.map(suggestion=><Button key={suggestion.id} secondary icon="location-outline" title={suggestion.label} disabled={confirming||busy} onPress={()=>void selectSuggestion(suggestion)}/>)}
   {!!suggestionError&&<Label muted>{suggestionError}</Label>}
   <Button secondary icon="search" title={t('بحث عن المكان','Search places')} onPress={()=>void search()} disabled={confirming||busy||query.trim().length<3}/>
   {results.map(place=><Button key={place.id} secondary title={place.label} disabled={confirming||busy} onPress={()=>{choose(place.coordinate,place.label,true);setResults([])}}/>)}
   {point&&(pickup&&pickupMode==='current'?<Label>{t('موقعي الحالي','My current location')}</Label>:<Field label={t('اسم العنوان','Address name')} value={label} onChangeText={setLabel} maxLength={200} editable={!confirming&&!busy&&!saving}/>)}
   <Button icon="checkmark-circle-outline"
    title={editing?t('حفظ العنوان','Save address'):pickup?t('تأكيد الانطلاق وعرض الأجرة','Confirm pickup and view fare'):t('تأكيد الوجهة واختيار الانطلاق','Confirm destination and choose pickup')}
    onPress={()=>void (editing?savePlace():confirm())}
    disabled={confirming||busy||saving||(!point&&(!pickup||gps.busy))||(editing&&!loaded)}/>
   {confirming&&<ActivityIndicator accessibilityLabel={t('جارٍ تأكيد نقطة الانطلاق…','Confirming pickup…')}/>}
   {notice}
  </Panel>
  <MapCanvas point={point??oldPlace?.coordinate??null} initialCenter={initialCenter.current} cameraTarget={selectionCamera??gps.camera} onChange={next=>{if(!confirming&&!busy&&!saving)choose(next)}}/>
  {!editing&&<Panel>
   <Label large>{t('العناوين المحفوظة','Saved addresses')}</Label>
   {token?<>{savedList}{point&&(!pickup||pickupMode==='manual')&&<Button secondary icon="bookmark-outline" title={t('حفظ النقطة المحددة كعنوان','Save selected point as an address')} onPress={()=>void savePlace()} disabled={!loaded||saving||confirming}/>}</>:signIn}
  </Panel>}
  <Button secondary title={t('العودة','Back')} onPress={()=>router.replace(backTo)}/>
 </Page>;
}
