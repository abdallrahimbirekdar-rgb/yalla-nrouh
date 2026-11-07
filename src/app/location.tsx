import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,Platform,Pressable,View} from 'react-native';
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
import {useRideState} from '../use-ride-state';
import {formatCoordinate,sameCoordinate,type Coordinate} from '../geo';
import {type Place} from '../api';
import {cloudSavedPlaces,cloudSavePlaces,type SavedPlace} from '../cloud-api';
import {Button,Field,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
import {addressSlots,addressSlotLabel,isAddressSlot} from '../saved-address-labels';
export default function LocationRoute(){
 const {target,focus,view,edit,fromReview}=useLocalSearchParams<{target?:string;focus?:string;view?:string;edit?:string;fromReview?:string}>();
 const account=useAuth().session?.user.id;
 return <LocationPicker key={JSON.stringify([target,view,edit,fromReview,account])} pickup={target==='pickup'} focus={focus==='1'} savedView={view==='saved'} edit={edit} fromReview={fromReview==='1'}/>;
}
function LocationPicker({pickup,focus,savedView,edit,fromReview}:{pickup:boolean;focus:boolean;savedView:boolean;edit?:string;fromReview:boolean}){
 const {draft,setDraft,state,ready}=useApp();const auth=useAuth();const t=useText();const {colors}=useTheme();
 const rideState=useRideState();
 const editing=savedView&&!!edit, managing=savedView&&!edit;
 const gps=useCurrentPosition(ready&&pickup&&draft.pickupMode!=='manual');
 const original=savedView?undefined:pickup?draft.pickupPoint:draft.destinationPoint;
 const initialCenter=useRef<Coordinate|undefined>(original??(Platform.OS==='web'?recentWebPosition(60000):null)??draft.pickupPoint??draft.destinationPoint);
 const [point,setPoint]=useState<Coordinate|null>(original??null),[label,setLabel]=useState(savedView?'':pickup?draft.pickup:draft.destination);
 const [pickupMode,setPickupMode]=useState<'current'|'manual'>(draft.pickupMode==='manual'?'manual':'current');
 const positionRequest=useRef<AbortController|null>(null);
 const [locating,setLocating]=useState(false);
 const [confirming,setConfirming]=useState(false);
 const [suggestions,setSuggestions]=useState<PlaceSuggestion[]>([]),[suggesting,setSuggesting]=useState(false),[suggestionError,setSuggestionError]=useState('');
 const [autocomplete]=useState(googlePlaceAutocomplete),near=useRef(initialCenter.current);
 near.current=gps.camera?.point??draft.pickupPoint??initialCenter.current;
 const [query,setQuery]=useState(''),[results,setResults]=useState<Place[]>([]),[saved,setSaved]=useState<SavedPlace[]>([]);
 const [searchFocused,setSearchFocused]=useState(false);
 const [keyboardHeight,setKeyboardHeight]=useState<number>();
 const searchActive=searchFocused||!!query.trim();
 useEffect(()=>{
  if(Platform.OS!=='web'||!searchActive||!window.visualViewport){setKeyboardHeight(undefined);return}
  const viewport=window.visualViewport;
  const resize=()=>setKeyboardHeight(viewport.height<window.innerHeight-80?viewport.height:undefined);
  resize();
  viewport.addEventListener('resize',resize);
  return()=>viewport.removeEventListener('resize',resize);
 },[searchActive]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false);
 const [savedOpen,setSavedOpen]=useState(false);
 const [mapOpen,setMapOpen]=useState(false);
 const [selectionCamera,setSelectionCamera]=useState<CameraTarget>();
 const alive=useRef(true),task=useRef(0);const token=auth.session?.access_token??null;const account=auth.session?.user.id;const accountRef=useRef(account);accountRef.current=account;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;positionRequest.current?.abort();autocomplete.reset()}},[autocomplete]);
 useEffect(()=>{
  const id=++task.current;setSuggestions([]);setSuggestionError('');
  if(query.trim().length<3){autocomplete.reset();return}
  setSuggesting(true);
  let active=true;let deadline:ReturnType<typeof setTimeout>|undefined;
  const timer=setTimeout(()=>{
   if(id!==task.current)return;
   void Promise.race([
    autocomplete.search(query,state.language,near.current),
    new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(Error('timeout')),10000)})
   ]).then(items=>{
    if(active&&id===task.current){setSuggestions(items);if(!items.length)setSuggestionError(t('لا توجد اقتراحات. جرّب إضافة اسم الحي أو المدينة.','No suggestions. Try adding a district or city.'))}
   }).catch(()=>{
    if(active&&id===task.current)setSuggestionError(t('تعذر تحميل الاقتراحات. جرّب زر البحث أو اختر على الخريطة.','Suggestions could not load. Try Search or choose on the map.'))
   }).finally(()=>{clearTimeout(deadline);if(active&&id===task.current)setSuggesting(false)})
  },250);
  return()=>{active=false;clearTimeout(timer);clearTimeout(deadline)}
 },[query,state.language,autocomplete,t]);
 const loadSaved=useCallback(async()=>{
  if(!token)return;
  setLoaded(false);
  try{
   const list=await cloudSavedPlaces(token);
   if(!alive.current||accountRef.current!==account)return;
   setSaved(list);setLoaded(true);
  }catch{
   if(alive.current&&accountRef.current===account)setMessage(t('تعذر تحميل العناوين المحفوظة. أعد المحاولة.','Could not load saved addresses. Try again.'));
  }
 },[token,account,t]);
 useEffect(()=>{void loadSaved()},[loadSaved]);
 useEffect(()=>{
  if(!pickup||pickupMode!=='current'||!gps.camera?.point||selectionCamera)return;
  setPoint(gps.camera.point);setLabel(t('موقعي الحالي','My current location'));
 },[pickup,pickupMode,gps.camera,selectionCamera,state.language,t]);
 const backTo=fromReview?'/review' as const:pickup?{pathname:'/location' as const,params:{target:'destination'}}:editing?{pathname:'/location' as const,params:{view:'saved'}}:'/' as const;
 function navigateToEditor(id:string){
  if(!confirming&&!saving)router.push({pathname:'/location',params:{view:'saved',edit:id}});
 }
 function changeQuery(value:string){
  task.current++;
  if(value.trim().length<3)autocomplete.reset();
  setQuery(value);setBusy(false);setSuggesting(false);setResults([]);setSuggestions([]);setSuggestionError('');setMessage('');
 }
 function choose(next:Coordinate,nextLabel?:string,moveCamera=false){
  if(confirming||saving)return;
  positionRequest.current?.abort();
  positionRequest.current=null;
  setLocating(false);
  if(pickup){gps.chooseManually();setPickupMode('manual')}
  setPoint(next);setLabel(nextLabel??(pickup?t('نقطة الالتقاء على الخريطة','Meeting point on the map'):t('نقطة على الخريطة','Point on the map')));
  changeQuery('');
  if(moveCamera){setSelectionCamera({point:next,revision:Date.now(),isLocation:false});Keyboard.dismiss()}
  setMessage('');
 }
 async function selectCurrent(){
  if(positionRequest.current||confirming)return;
  changeQuery('');Keyboard.dismiss();
  gps.chooseManually();
  const controller=new AbortController();
  positionRequest.current=controller;
  setLocating(true);
  try{
   const next=await pickupPosition(siteCurrentPosition,{controller,reuseNative:true});
   if(alive.current&&positionRequest.current===controller){
    setPickupMode('current');
    setPoint(next);setLabel(t('موقعي الحالي','My current location'));
    setSelectionCamera({point:next,revision:Date.now()});
   }
  }catch(error){
   if(alive.current&&positionRequest.current===controller)setMessage(pickupPositionMessage(error,state.language));
  }finally{
   if(positionRequest.current===controller){positionRequest.current=null;if(alive.current)setLocating(false)}
  }
 }
 async function selectSuggestion(suggestion:PlaceSuggestion){
  if(busy)return;const id=++task.current;setBusy(true);setSuggesting(false);setMessage('');let timer:ReturnType<typeof setTimeout>|undefined;
  try{const place=await Promise.race([suggestion.select(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),12000)})]);if(alive.current&&id===task.current)choose(place.coordinate,place.label,true)}catch{if(alive.current&&id===task.current)setMessage(t('تعذر تحديد المكان. أعد المحاولة أو اختر على الخريطة.','Could not find this place. Try again or choose on the map.'))}finally{clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
 }
 async function search(){
  if(busy||query.trim().length<3)return;const id=++task.current;autocomplete.reset();setSuggestions([]);setSuggesting(false);setSuggestionError('');setBusy(true);setMessage('');setResults([]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const places=await Promise.race([searchGooglePlaces(query,state.language,near.current),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),15000)})]);
   if(alive.current&&id===task.current){setResults(places);if(!places.length)setMessage(t('لا توجد نتائج. جرّب اسمًا أوضح أو حدد نقطة على الخريطة.','No results. Try another name or choose on the map.'))}
  }catch(error){console.warn('[yalla:places]',error instanceof Error?error.message:'places_unavailable');if(alive.current&&id===task.current)setMessage(t('تعذر البحث في Google حاليًا. أعد المحاولة أو اختر نقطة على الخريطة.','Search is unavailable. Try again or pick a point on the map.'))}
  finally{if(timer)clearTimeout(timer);if(alive.current&&id===task.current)setBusy(false)}
 }
 async function confirm(){
  if(confirming||busy||locating||query.trim()||!point)return;
  if(pickup&&!draft.destinationPoint){
   router.replace({pathname:'/location',params:{target:'destination'}});
   return;
  }
  setConfirming(true);setMessage('');
  try{
   const selected=pickup&&pickupMode==='current'?await pickupPosition(siteCurrentPosition,{reuseNative:true}):point;
   if(!alive.current||!selected)return;
   if(pickup&&draft.destinationPoint&&sameCoordinate(selected,draft.destinationPoint)){
    setMessage(t('اختر نقطة انطلاق مختلفة عن الوجهة.','Choose a pickup point different from the destination.'));
    return;
   }
   if(!pickup&&fromReview&&draft.pickupPoint&&sameCoordinate(selected,draft.pickupPoint)){
    setMessage(t('اختر وجهة مختلفة عن نقطة الانطلاق.','Choose a destination different from the pickup.'));
    return;
   }
   Keyboard.dismiss();
   const name=label.trim()||formatCoordinate(selected);
   if(pickup){
    setDraft(previous=>({...previous,pickup:pickupMode==='current'?t('موقعي الحالي','My current location'):name,pickupPoint:selected,pickupMode}));
    router.replace('/review');
   }else{
    setDraft(previous=>({...previous,destination:name,destinationPoint:selected}));
    if(fromReview&&draft.pickupPoint)router.replace('/review');
    else router.replace({pathname:'/location',params:{target:'pickup',...(fromReview?{fromReview:'1'}:{})}});
   }
  }catch(error){
   if(!alive.current)return;
   if(pickup&&pickupMode==='current')setPoint(null);
   setMessage(pickupPositionMessage(error,state.language));
  }
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
 function selectSaved(place:SavedPlace){
  if(!managing){choose(place.coordinate,place.label,true);setSavedOpen(false);return}
  if(rideState.active){router.replace('/cloud');return}
  setDraft(previous=>({...previous,destination:place.label,destinationPoint:place.coordinate}));
  router.replace({pathname:'/location',params:{target:'pickup'}});
 }
 const savedList=<>
  {!loaded?<Button secondary title={t('تحميل العناوين المحفوظة','Load saved addresses')} onPress={()=>void loadSaved()}/>:<>
   {addressSlots.map(slot=>{
    const place=saved.find(item=>item.id===slot);
    const name=addressSlotLabel(slot,t);
    return <View key={slot} style={{gap:6}}>
     <Button secondary icon={slot==='home'?'home-outline':'briefcase-outline'} title={place?name:t('إضافة ','Add ')+name} onPress={()=>place?selectSaved(place):navigateToEditor(slot)}/>
     {managing&&place&&<><Label muted>{place.label}</Label><Button secondary icon="pencil-outline" title={t('تعديل ','Edit ')+name} onPress={()=>navigateToEditor(slot)}/></>}
    </View>;
   })}
   {saved.filter(place=>!isAddressSlot(place.id)).map(place=><View key={place.id} style={{gap:6}}>
    <Button secondary icon="bookmark-outline" title={place.label} onPress={()=>selectSaved(place)}/>
    {managing&&<Button secondary icon="trash-outline" title={t('حذف العنوان','Remove address')} onPress={()=>void savePlace(place.id)} disabled={saving}/>}
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
 const typing=!!query.trim();
 const clearSearch=t('مسح البحث','Clear search');
 return <Page compact simpleHeader viewportHeight={keyboardHeight} backTo={backTo} title={title}>
  <View nativeID={searchActive?'ride-address-search-active':undefined}>
  <Panel outlined>
   <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'flex-end',gap:8}}>
    <View style={{flex:1}}>
     <Field autoFocus={focus} label={pickup?t('من وين بدك تنطلق؟','Where should we pick you up?'):editing?t('ابحث عن العنوان','Find an address'):t('لوين بدك تروح؟','Where to?')} value={query}
      editable={!confirming&&!saving} onFocus={()=>setSearchFocused(true)} onBlur={()=>setSearchFocused(false)} onChangeText={changeQuery} autoCorrect={false} autoComplete="off"
      maxLength={200} placeholder={t('اسم المكان أو الشارع أو الحي','Place, street or district')}
      returnKeyType="search" onSubmitEditing={()=>void search()}/>
    </View>
    {!!query&&<Pressable accessibilityRole="button" accessibilityLabel={clearSearch} onPress={()=>changeQuery('')}
     style={{minWidth:44,minHeight:52,alignItems:'center',justifyContent:'center'}}>
     <Icon name="close-circle-outline" size={22} color={colors.muted}/>
    </Pressable>}
   </View>
   {suggesting&&<View accessibilityLiveRegion="polite"><Label muted>{t('جارٍ جلب الاقتراحات…','Finding suggestions…')}</Label></View>}
   {(suggestions.length>0||results.length>0)&&<View style={{borderWidth:1,borderColor:colors.line,borderRadius:12,backgroundColor:colors.background,overflow:'hidden'}}>
    {suggestions.map(place=><AddressResult key={place.id} title={place.primary} subtitle={place.secondary} fullLabel={place.label} disabled={confirming||busy} onPress={()=>void selectSuggestion(place)}/>)}
    {results.map(place=><AddressResult key={place.id} title={place.label} disabled={confirming||busy} onPress={()=>choose(place.coordinate,place.label,true)}/>)}
    <View style={{paddingHorizontal:12,paddingVertical:4}}><Label muted>Google Maps</Label></View>
   </View>}
   {!!suggestionError&&<Label muted>{suggestionError}</Label>}
   {!!suggestionError&&<Button secondary icon="map-outline" title={t('اختيار على الخريطة','Choose on map')} onPress={()=>{changeQuery('');Keyboard.dismiss();setMapOpen(true)}}/>}
   {typing&&!suggesting&&!results.length&&query.trim().length>=3&&<Button secondary icon="search" title={t('عرض نتائج أكثر','Show more results')} onPress={()=>void search()} disabled={confirming||busy}/>}
   {busy&&<ActivityIndicator accessibilityLabel={t('جارٍ تحديد العنوان…','Finding the address…')}/>}
   {typing&&notice}
  </Panel></View>
  {!typing&&<>
  {pickup&&(pickupMode==='manual'||!point||locating)&&<Button secondary icon="locate" title={locating?t('جارٍ تحديد موقعك…','Finding your location…'):t('استخدام موقعي الحالي','Use my current location')} onPress={()=>void selectCurrent()} disabled={confirming||busy||locating}/>}
  {pickup&&!message&&!locating&&!point&&gps.failure&&<Label muted>{pickupPositionMessage(new PositionError(gps.failure),state.language)}</Label>}
  {oldPlace&&!point&&!typing&&<Label muted>{t('العنوان المحفوظ حاليًا: ','Current saved address: ')}{oldPlace.label}</Label>}
  {point?<Panel>
   {editing?<Field label={t('اسم العنوان','Address name')} value={label} onChangeText={setLabel} maxLength={200} editable={!confirming&&!busy&&!saving}/>:<>
    <Label muted>{pickup?t('نقطة الانطلاق المختارة','Selected pickup'):t('الوجهة المختارة','Selected destination')}</Label>
    <Label>{pickup&&pickupMode==='current'?t('موقعي الحالي','My current location'):label}</Label>
   </>}
   <Button icon="checkmark-circle-outline"
    title={editing?t('حفظ العنوان','Save address'):pickup?t('تأكيد الانطلاق وعرض الأجرة','Confirm pickup and view fare'):fromReview&&draft.pickupPoint?t('تأكيد الوجهة وعرض الأجرة','Confirm destination and view fare'):t('تأكيد الوجهة واختيار الانطلاق','Confirm destination and choose pickup')}
    onPress={()=>void (editing?savePlace():confirm())}
    disabled={confirming||busy||saving||locating||!point||(editing&&!loaded)}/>
   {confirming&&<ActivityIndicator accessibilityLabel={t('جارٍ تأكيد نقطة الانطلاق…','Confirming pickup…')}/>}
   {notice}
  </Panel>:notice}
  <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',gap:8}}>
   <View style={{flex:1}}><Button secondary icon="map-outline" title={mapOpen?t('إخفاء الخريطة','Hide map'):t('اختيار على الخريطة','Choose on map')}
    onPress={()=>{Keyboard.dismiss();setMapOpen(value=>!value)}}/></View>
   {!editing&&<View style={{flex:1}}><Button secondary icon="bookmark-outline" title={savedOpen?t('إخفاء العناوين','Hide saved addresses'):t('العناوين المحفوظة','Saved addresses')} onPress={()=>{Keyboard.dismiss();setSavedOpen(value=>!value)}}/></View>}
  </View>
  {mapOpen&&<MapCanvas point={point??oldPlace?.coordinate??null} initialCenter={initialCenter.current} cameraTarget={selectionCamera??gps.camera} onChange={next=>{if(!confirming&&!busy&&!saving)choose(next)}}/>}
  {!editing&&<View style={{gap:8}}>
   {savedOpen&&(token?<Panel>{savedList}{point&&(!pickup||pickupMode==='manual')&&<Button secondary icon="bookmark-outline" title={t('حفظ النقطة المحددة كعنوان','Save selected point as an address')} onPress={()=>void savePlace()} disabled={!loaded||saving||confirming}/>}</Panel>:signIn)}
  </View>}
  {pickup&&!!draft.destination&&<Label muted>{t('الوجهة: ','Destination: ')}{draft.destination}</Label>}
  </>}
 </Page>;
}

function AddressResult({title,subtitle,fullLabel,disabled,onPress}:{title:string;subtitle?:string;fullLabel?:string;disabled:boolean;onPress:()=>void}){
 const {state}=useApp();
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={fullLabel??title} disabled={disabled} onPress={onPress}
  style={({pressed})=>({flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:10,minHeight:52,paddingHorizontal:12,paddingVertical:6,borderBottomWidth:1,borderColor:colors.line,backgroundColor:pressed?colors.selected:colors.background,opacity:disabled?0.55:1})}>
  <Icon name="location-outline" size={19} color={colors.purple}/>
  <View style={{flex:1}}><Label>{title}</Label>{!!subtitle&&<Label muted>{subtitle}</Label>}</View>
 </Pressable>;
}
