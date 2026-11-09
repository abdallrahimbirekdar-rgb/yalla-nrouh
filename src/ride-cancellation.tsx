import React,{useEffect,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,View} from 'react-native';
import {useApp} from './context';
import {Button,Field,Icon,Label,useText,useTheme} from './ui';

import {cancellationReasonOptions} from './ride-cancellation-options';
import type {CancellationActor,CancellationReason} from './ride-cancellation-options';
export type {CancellationActor,CancellationReason} from './ride-cancellation-options';

export default function RideCancellation({actor,arrived,busy,error,onClose,onConfirm}:{
 actor:CancellationActor;arrived:boolean;busy:boolean;error:string;onClose:()=>void;onConfirm:(reason:CancellationReason,detail:string|null)=>void;
}){
 const t=useText();
 const {state}=useApp();
 const {colors}=useTheme();
 const [reason,setReason]=useState<CancellationReason|null>(null);
 const [detail,setDetail]=useState('');
 const options=cancellationReasonOptions(actor,arrived);
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
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:6}}>
     {options.map(([id,ar,en,de])=><Pressable key={id} accessibilityRole="radio" accessibilityState={{checked:reason===id,disabled:busy}}
      disabled={busy} onPress={()=>setReason(id)} style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',
       gap:8,minHeight:44,paddingHorizontal:9,borderWidth:1,borderRadius:10,borderColor:reason===id?colors.purple:colors.line,
       backgroundColor:reason===id?colors.selected:colors.background}}>
      <Icon name={reason===id?'radio-button-on':'radio-button-off'} size={19} color={colors.purple}/>
      <View style={{flex:1}}><Label>{t(ar,en,de)}</Label></View>
     </Pressable>)}
     {reason==='other'&&<Field label={t('اكتب سبب الإلغاء','Enter your reason','Gib deinen Grund ein')}
      value={detail} onChangeText={setDetail} maxLength={240} multiline editable={!busy}/>}
    </ScrollView>
    {!!error&&<View accessibilityRole="alert"><Label>{error}</Label></View>}
    <Button tone="danger" title={t('تأكيد إلغاء الرحلة','Confirm cancellation','Stornierung bestätigen')}
     disabled={busy||!selected||reason==='other'&&!detail.trim()} onPress={()=>{if(selected)onConfirm(selected[0],reason==='other'?detail.trim():null)}}/>
    <Button secondary title={t('متابعة الرحلة','Keep the ride','Fahrt behalten')} disabled={busy} onPress={onClose}/>
   </View>
  </View>
 </Modal>;
}
