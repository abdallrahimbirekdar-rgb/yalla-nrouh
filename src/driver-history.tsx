import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cloudCurrentToken,cloudDriverHistory,driverHistoryPageSize,type DriverHistoryEntry,type DriverHistoryKind} from './cloud-api';
import {useApp} from './context';
import {categories,regions} from './domain';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';

const sections=[
 {kind:'completed',ar:'المنجزة',en:'Completed',icon:'checkmark-circle-outline',light:['#eaf7f0','#26734d'],dark:['#1a3428','#85dfb1']},
 {kind:'cancelled',ar:'الملغاة',en:'Cancelled',icon:'close-circle-outline',light:['#fff0f0','#a6343b'],dark:['#44292d','#ffb0b4']},
 {kind:'released',ar:'غير المكتملة',en:'Unfinished',icon:'time-outline',light:['#fff4e0','#875509'],dark:['#423320','#ffd28b']},
] as const;

export function DriverHistoryBar({onOpen}:{onOpen:(kind:DriverHistoryKind)=>void}){
 const {state}=useApp();const {colors,dark}=useTheme();const t=useText();
 return <View style={{backgroundColor:colors.background,borderTopWidth:1,borderColor:colors.line,paddingHorizontal:12,paddingVertical:8}}>
  <View style={{width:'100%',maxWidth:640,alignSelf:'center',flexDirection:state.language==='ar'?'row-reverse':'row',gap:7}}>
   {sections.map(section=>{
    const [fill,accent]=dark?section.dark:section.light;
    return <Pressable key={section.kind} accessibilityRole="button" accessibilityLabel={t(section.ar,section.en)}
     onPress={()=>onOpen(section.kind)} style={({pressed})=>({
      flex:1,minWidth:0,minHeight:64,alignItems:'center',justifyContent:'center',gap:2,paddingHorizontal:3,paddingVertical:5,
      borderRadius:12,borderWidth:1.5,borderColor:accent,backgroundColor:fill,opacity:pressed?0.7:1,
     })}>
     <Icon name={section.icon} size={21} color={accent}/>
     <Label>{t(section.ar,section.en)}</Label>
    </Pressable>;
   })}
  </View>
 </View>;
}

export function DriverHistory({kind,owner,onClose}:{kind:DriverHistoryKind;owner:string;onClose:()=>void}){
 const {state}=useApp();const {colors}=useTheme();const t=useText();
 const [entries,setEntries]=useState<DriverHistoryEntry[]>([]),[offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0);
 const [loading,setLoading]=useState(true),[problem,setProblem]=useState(false),[more,setMore]=useState(false);
 const section=sections.find(item=>item.kind===kind)!;
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
  const back=(event:Event)=>{event.preventDefault();onClose()};
  window.addEventListener('yalla:native-back',back);
  return()=>window.removeEventListener('yalla:native-back',back);
 },[onClose]);
 return <Modal visible animationType="none" onRequestClose={onClose}>
  <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
   <ScrollView contentContainerStyle={{width:'100%',maxWidth:640,alignSelf:'center',padding:18,gap:12}}>
    <Button secondary icon="close-outline" title={t('العودة لشاشة السائق','Back to driver screen')} onPress={onClose}/>
    <Label large>{t(kind==='released'?'الطلبات المقبولة التي لم تكتمل':'الطلبات '+section.ar,section.en+' requests')}</Label>
    {kind==='released'&&<Label muted>{t('الطلبات اللي قبلتها ورجعت للبحث عن سائق آخر قبل إتمام الرحلة.','Requests you accepted and then released for another driver before finishing.')}</Label>}
    {entries.map(item=><Panel key={item.id}>
     {item.pickup&&<Label>{item.pickup}</Label>}
     {item.destination&&<Label>{item.destination}</Label>}
     {kind==='released'&&<Label>{regions[item.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===item.category)?.[state.language]??item.category}</Label>}
     <Label muted>{t('رقم الطلب','Request ID')} · {String(item.ride_id??item.id).slice(0,8)}</Label>
     <Label muted>{new Date(item.released_at??item.updated_at??'').toLocaleString(state.language)}</Label>
    </Panel>)}
    {loading&&<ActivityIndicator color={colors.purple}/>}
    {!loading&&problem&&<><Label>{t('تعذر تحميل السجل.','Could not load the history.')}</Label><Button secondary title={t('إعادة المحاولة','Retry')} onPress={()=>setAttempt(value=>value+1)}/></>}
    {!loading&&!problem&&!entries.length&&<Label muted>{t('ما في طلبات في هذا القسم.','No requests in this section.')}</Label>}
    {!loading&&!problem&&more&&<Button secondary title={t('عرض المزيد','Show more')} onPress={()=>setOffset(value=>value+driverHistoryPageSize)}/>}
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}
