import React,{useEffect,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,View} from 'react-native';
import {useApp} from './context';
import {Button,Icon,Label,useText,useTheme} from './ui';

const reasons={
 passenger:[
  ['changed_plans','غيّرت خططي','My plans changed','Meine Pläne haben sich geändert'],
  ['wait_too_long','الانتظار طويل','The wait is too long','Die Wartezeit ist zu lang'],
  ['wrong_pickup','نقطة الانطلاق غير صحيحة','Wrong pickup point','Falscher Abholort'],
  ['driver_not_found','لم أجد السائق','I couldn’t find the driver','Ich habe den Fahrer nicht gefunden'],
  ['other_transport','وجدت وسيلة نقل أخرى','I found another way to get there','Ich habe eine andere Fahrtmöglichkeit gefunden'],
  ['other','سبب آخر','Another reason','Anderer Grund'],
 ],
 driver:[
  ['passenger_not_found','لم أجد الزبون','I couldn’t find the passenger','Ich habe den Fahrgast nicht gefunden'],
  ['pickup_unreachable','تعذّر الوصول إلى نقطة الركوب','I couldn’t reach the pickup point','Ich konnte den Abholort nicht erreichen'],
  ['vehicle_problem','مشكلة في السيارة','Vehicle problem','Fahrzeugproblem'],
  ['emergency','ظرف طارئ','Emergency','Notfall'],
  ['other','سبب آخر','Another reason','Anderer Grund'],
 ],
} as const;
export type CancellationActor=keyof typeof reasons;
export type CancellationReason=typeof reasons[CancellationActor][number][0];

export default function RideCancellation({actor,arrived,busy,error,onClose,onConfirm}:{
 actor:CancellationActor;arrived:boolean;busy:boolean;error:string;onClose:()=>void;onConfirm:(reason:CancellationReason)=>void;
}){
 const t=useText();
 const {state}=useApp();
 const {colors}=useTheme();
 const [reason,setReason]=useState<CancellationReason|null>(null);
 const options=reasons[actor].filter(([id])=>id!=='passenger_not_found'||arrived);
 const selected=options.find(([id])=>id===reason);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const back=(event:Event)=>{event.preventDefault();if(!busy)onClose()};
  window.addEventListener('yalla:native-back',back);
  return()=>window.removeEventListener('yalla:native-back',back);
 },[busy,onClose]);
 return <Modal visible transparent animationType="none" onRequestClose={()=>{if(!busy)onClose()}}>
  <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:16,backgroundColor:'#00000077'}}>
   <View style={{width:'100%',maxWidth:440,maxHeight:'90%',gap:12,padding:16,borderRadius:20,backgroundColor:colors.surface}}>
    <Label large>{t('سبب إلغاء الرحلة','Why are you cancelling?','Warum stornierst du die Fahrt?')}</Label>
    <Label muted>{t('اختر السبب ثم أكّد الإلغاء.','Choose a reason, then confirm the cancellation.','Wähle einen Grund und bestätige die Stornierung.')}</Label>
    <ScrollView contentContainerStyle={{gap:6}}>
     {options.map(([id,ar,en,de])=><Pressable key={id} accessibilityRole="radio" accessibilityState={{checked:reason===id,disabled:busy}}
      disabled={busy} onPress={()=>setReason(id)} style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',
       gap:8,minHeight:44,paddingHorizontal:9,borderWidth:1,borderRadius:10,borderColor:reason===id?colors.purple:colors.line,
       backgroundColor:reason===id?colors.selected:colors.background}}>
      <Icon name={reason===id?'radio-button-on':'radio-button-off'} size={19} color={colors.purple}/>
      <View style={{flex:1}}><Label>{t(ar,en,de)}</Label></View>
     </Pressable>)}
    </ScrollView>
    {!!error&&<View accessibilityRole="alert"><Label>{error}</Label></View>}
    <Button tone="danger" title={t('تأكيد إلغاء الرحلة','Confirm cancellation','Stornierung bestätigen')}
     disabled={busy||!selected} onPress={()=>{if(selected)onConfirm(selected[0])}}/>
    <Button secondary title={t('متابعة الرحلة','Keep the ride','Fahrt behalten')} disabled={busy} onPress={onClose}/>
   </View>
  </View>
 </Modal>;
}
