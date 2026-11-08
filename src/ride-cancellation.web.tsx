import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import {createPortal} from 'react-dom';
import {useApp} from './context';
import {Button,Icon,Label,useText,useTheme} from './ui';
import {cancellationReasonOptions,type CancellationActor,type CancellationReason} from './ride-cancellation-options';

/**
 * Website/Android-WebView cancellation dialog.
 *
 * Render at document.body rather than using RN Web Modal inside the ride page's
 * ScrollView. The fixed overlay and native DOM scroller keep the reason choices
 * and the action buttons responsive on small WebView screens.
 */
export default function RideCancellation({actor,arrived,busy,error,onClose,onConfirm}:{
 actor:CancellationActor;arrived:boolean;busy:boolean;error:string;onClose:()=>void;onConfirm:(reason:CancellationReason)=>void;
}){
 const t=useText(),{state}=useApp(),{colors}=useTheme();
 const [ready,setReady]=useState(false);
 const [reason,setReason]=useState<CancellationReason|null>(null);
 const panel=useRef<HTMLDivElement>(null);
 const options=cancellationReasonOptions(actor,arrived);
 const selected=options.find(([id])=>id===reason);
 useEffect(()=>{setReady(true)},[]);
 useEffect(()=>{if(ready)panel.current?.focus()},[ready]);
 useEffect(()=>{
  const back=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();if(!busy)onClose()};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();if(!busy)onClose()}};
  window.addEventListener('yalla:native-back',back);
  document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('yalla:native-back',back);document.removeEventListener('keydown',escape)};
 },[busy,onClose]);
 if(!ready||typeof document==='undefined')return null;
 return createPortal(
  <div role="presentation"
   onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}
   style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',
    padding:16,backgroundColor:'rgba(0,0,0,0.56)',boxSizing:'border-box'}}>
   <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true"
    aria-label={t('سبب إلغاء الرحلة','Why are you cancelling?','Warum stornierst du die Fahrt?')}
    style={{width:'100%',maxWidth:440,maxHeight:'calc(100dvh - 32px)',overflowY:'auto',
     overscrollBehavior:'contain',WebkitOverflowScrolling:'touch',boxSizing:'border-box',
     borderRadius:20,padding:16,backgroundColor:colors.surface,boxShadow:'0 12px 36px rgba(0,0,0,.22)'}}>
    <View style={{gap:12}}>
     <Label large>{t('سبب إلغاء الرحلة','Why are you cancelling?','Warum stornierst du die Fahrt?')}</Label>
     <Label muted>{t('اختر السبب ثم أكّد الإلغاء.','Choose a reason, then confirm the cancellation.','Wähle einen Grund und bestätige die Stornierung.')}</Label>
     <View style={{gap:7}}>
      {options.map(([id,ar,en,de])=><Pressable key={id} accessibilityRole="radio"
       accessibilityState={{checked:reason===id,disabled:busy}} disabled={busy}
       onPress={()=>setReason(id)}
       style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',
        gap:8,minHeight:48,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderRadius:10,
        borderColor:reason===id?colors.purple:colors.line,
        backgroundColor:reason===id?colors.selected:colors.background}}>
       <Icon name={reason===id?'radio-button-on':'radio-button-off'} size={20} color={colors.purple}/>
       <View style={{flex:1}}><Label>{t(ar,en,de)}</Label></View>
      </Pressable>)}
     </View>
     {busy&&<View accessibilityLiveRegion="polite" style={{flexDirection:'row',alignItems:'center',gap:10}}>
      <ActivityIndicator color={colors.purple}/>
      <View style={{flex:1}}><Label>{t('جارٍ إرسال الإلغاء والتحقق منه…','Sending and confirming cancellation…','Stornierung wird bestätigt…')}</Label></View>
     </View>}
     {!!error&&<View accessibilityRole="alert"><Label>{error}</Label></View>}
     <Button tone="danger" title={busy?t('جارٍ إلغاء الرحلة…','Cancelling ride…','Fahrt wird storniert…'):t('تأكيد إلغاء الرحلة','Confirm cancellation','Stornierung bestätigen')}
      disabled={busy||!selected} onPress={()=>{if(selected&&!busy)onConfirm(selected[0])}}/>
     <Button secondary title={t('متابعة الرحلة','Keep the ride','Fahrt behalten')} disabled={busy} onPress={onClose}/>
    </View>
   </div>
  </div>,
  document.body
 );
}
