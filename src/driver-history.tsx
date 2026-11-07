import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cloudCurrentToken,cloudDriverHistory,driverHistoryPageSize,type DriverHistoryEntry,type DriverHistoryKind} from './cloud-api';
import {useApp} from './context';
import {categories,regions} from './domain';
import {formatCoordinate,isCoordinate} from './geo';
import {createPickupAddressLookup} from './map/pickup-address';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';

const sections=[
 {kind:'completed',ar:'المنجزة',en:'Completed',icon:'checkmark-circle-outline'},
 {kind:'cancelled',ar:'الملغاة',en:'Cancelled',icon:'close-circle-outline'},
 {kind:'released',ar:'غير المكتملة',en:'Unfinished',icon:'time-outline'},
] as const;

export function DriverHistoryBar({selected,onOpen}:{selected?:DriverHistoryKind;onOpen:(kind:DriverHistoryKind)=>void}){
 const {state}=useApp();const {colors}=useTheme();const t=useText();
 return <View accessibilityRole={selected?'tablist':undefined} style={{
  width:'100%',maxWidth:640,alignSelf:'center',flexDirection:state.language==='ar'?'row-reverse':'row',
  gap:3,padding:4,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,
 }}>
  {sections.map(section=>{
   const active=selected===section.kind;
   const title=t(section.ar,section.en);
   return <Pressable key={section.kind} accessibilityRole={selected?'tab':'button'}
    accessibilityState={selected?{selected:active}:undefined} accessibilityLabel={title}
    onPress={()=>onOpen(section.kind)} style={({pressed})=>({
     flex:1,minWidth:0,minHeight:46,flexDirection:state.language==='ar'?'row-reverse':'row',
     alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:4,paddingVertical:5,
     borderRadius:11,backgroundColor:active?colors.ink:pressed?colors.selected:undefined,
    })}>
    <Icon name={section.icon} size={16} color={active?colors.background:colors.muted}/>
    <Text style={{flexShrink:1,textAlign:'center',fontSize:13,lineHeight:18,fontWeight:active?'700':'600',
     color:active?colors.background:colors.ink,writingDirection:state.language==='ar'?'rtl':'ltr'}}>{title}</Text>
   </Pressable>;
  })}
 </View>;
}

export function DriverHistory({kind,owner,onSelect,onClose}:{kind:DriverHistoryKind;owner:string;onSelect:(kind:DriverHistoryKind)=>void;onClose:()=>void}){
 const {state}=useApp();const {colors}=useTheme();const t=useText();
 const rtl=state.language==='ar';
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const back=(event:Event)=>{event.preventDefault();onClose()};
  window.addEventListener('yalla:native-back',back);
  return()=>window.removeEventListener('yalla:native-back',back);
 },[onClose]);
 return <Modal visible animationType="none" onRequestClose={onClose}>
  <SafeAreaView style={{flex:1,backgroundColor:colors.soft,direction:'ltr'}}>
   <View style={{backgroundColor:colors.background,borderBottomWidth:1,borderColor:colors.line}}>
    <View style={{width:'100%',maxWidth:640,alignSelf:'center',padding:14,gap:12}}>
     <View style={{flexDirection:rtl?'row-reverse':'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <Label large>{t('سجل رحلات السائق','Driver trip history')}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={t('العودة لشاشة السائق','Back to driver screen')}
       onPress={onClose} style={({pressed})=>({width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',
        backgroundColor:pressed?colors.selected:colors.surface})}>
       <Icon name="close-outline" size={24}/>
      </Pressable>
     </View>
     <DriverHistoryBar selected={kind} onOpen={onSelect}/>
    </View>
   </View>
   <DriverHistoryList key={owner+kind} kind={kind} owner={owner}/>
  </SafeAreaView>
 </Modal>;
}

function pickupAddressInfo(item:DriverHistoryEntry){
 const label=item.pickup?.trim();
 if(label&&!['موقعي الحالي','my current location','نقطة الالتقاء على الخريطة','meeting point on the map'].includes(label.toLowerCase()))return {label};
 const point={latitude:item.pickup_lat,longitude:item.pickup_lng};
 return isCoordinate(point)?{point}:null;
}

function DriverHistoryList({kind,owner}:{kind:DriverHistoryKind;owner:string}){
 const {state}=useApp();const {colors}=useTheme();const t=useText();
 const [entries,setEntries]=useState<DriverHistoryEntry[]>([]),[offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0);
 const [loading,setLoading]=useState(true),[problem,setProblem]=useState(false),[more,setMore]=useState(false);
 const [resolved,setResolved]=useState<Record<string,string|null>>({});
 const known=useRef<Record<string,string|null>>({});
 const language=state.language;
 const section=sections.find(item=>item.kind===kind)!;
 const rtl=state.language==='ar';
 useEffect(()=>{
  let active=true;
  setLoading(true);setProblem(false);
  void cloudCurrentToken().then(token=>active?cloudDriverHistory(token,owner,kind,offset):[]).then(rows=>{
   if(!active)return;
   setEntries(previous=>offset===0?rows:[...previous,...rows.filter(row=>!previous.some(existing=>existing.id===row.id))]);
   setMore(rows.length===driverHistoryPageSize);
  }).catch(()=>{if(active)setProblem(true)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[owner,kind,offset,attempt]);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  let active=true;
  const findAddresses=async()=>{
   const points=entries.flatMap(item=>{const point=pickupAddressInfo(item)?.point;return point?[point]:[]});
   if(!points.some(point=>!(language+formatCoordinate(point) in known.current)))return;
   const lookup=await createPickupAddressLookup(language);
   for(const point of points){
    if(!active)return;
    const key=language+formatCoordinate(point);
    if(key in known.current)continue;
    const address=await lookup(point);
    if(!active)return;
    known.current[key]=address;
    setResolved(previous=>({...previous,[key]:address}));
   }
  };
  void findAddresses().catch(()=>{/* The saved pickup coordinates remain visible. */});
  return()=>{active=false};
 },[entries,language]);
 return <ScrollView style={{flex:1}} contentContainerStyle={{width:'100%',maxWidth:640,alignSelf:'center',padding:14,gap:10}}>
  {kind==='released'&&<Label muted>{t('طلبات قبلتها وأُعيدت للبحث عن سائق آخر قبل إتمام الرحلة.','Requests you accepted that returned to the search for another driver before completion.')}</Label>}
  {entries.map(item=>{
   const timestamp=item.released_at??item.updated_at;
   const date=timestamp?new Date(timestamp):null;
   const pickup=pickupAddressInfo(item);
   const coords=pickup?.point?formatCoordinate(pickup.point):null;
   const resolvedAddress=coords?resolved[language+coords]:null;
   const pickupAddress=pickup?.label??resolvedAddress??(coords?t('الإحداثيات','Coordinates')+' · '+coords:item.pickup?t('العنوان غير متاح','Address unavailable'):null);
   return <Panel key={item.id} outlined>
    <View style={{flexDirection:rtl?'row-reverse':'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
     <View style={{flexDirection:rtl?'row-reverse':'row',alignItems:'center',gap:5,paddingHorizontal:8,borderRadius:12,backgroundColor:colors.surface}}>
      <Icon name={section.icon} size={14} color={colors.muted}/>
      <Label muted>{t(section.ar,section.en)}</Label>
     </View>
     {date&&Number.isFinite(date.getTime())&&<Label muted>{date.toLocaleString(state.language)}</Label>}
    </View>
    {pickupAddress&&<HistoryStop label={t('الانطلاق','Pickup')} address={pickupAddress} icon="ellipse-outline" attribution={resolvedAddress?'Google Maps':undefined}/>}
    {item.destination&&<HistoryStop label={t('الوجهة','Destination')} address={item.destination} icon="location-outline"/>}
    {kind==='released'&&<Label>{regions[item.region]?.[rtl?0:1]} · {categories.find(c=>c.id===item.category)?.[state.language]??item.category}</Label>}
    <View style={{borderTopWidth:1,borderColor:colors.line,paddingTop:5}}>
     <Label muted>{t('رقم الطلب','Request ID')} · {String(item.ride_id??item.id).slice(0,8)}</Label>
    </View>
   </Panel>;
  })}
  {loading&&<ActivityIndicator color={colors.purple}/>}
  {!loading&&problem&&<Panel outlined><Label>{t('تعذر تحميل السجل.','Could not load the history.')}</Label><Button secondary title={t('إعادة المحاولة','Retry')} onPress={()=>setAttempt(value=>value+1)}/></Panel>}
  {!loading&&!problem&&!entries.length&&<Panel outlined><Icon name={section.icon} size={26} color={colors.muted}/><Label>{t('ما في طلبات في هذا القسم.','No requests in this section.')}</Label></Panel>}
  {!loading&&!problem&&more&&<Button secondary title={t('عرض المزيد','Show more')} onPress={()=>setOffset(value=>value+driverHistoryPageSize)}/>}
 </ScrollView>;
}

function HistoryStop({label,address,icon,attribution}:{label:string;address:string;icon:'ellipse-outline'|'location-outline';attribution?:string}){
 const {state}=useApp();const {colors}=useTheme();
 return <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:9}}>
  <View style={{width:30,height:30,borderRadius:10,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
   <Icon name={icon} size={16} color={colors.muted}/>
  </View>
  <View style={{flex:1,minWidth:0}}><Label muted>{label}</Label><Label>{address}</Label>{attribution&&<Label muted>{attribution}</Label>}</View>
 </View>;
}
