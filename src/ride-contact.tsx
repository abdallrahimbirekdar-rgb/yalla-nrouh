import {useCallback,useRef,useState} from 'react';
import {Linking,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {cloudCurrentToken,cloudRideContactPhone,type CloudRide} from './cloud-api';
import {useApp} from './context';
import {Button,Label,useText} from './ui';

export function ComplaintButton({rideId,onOpen}:{rideId:string;onOpen?:()=>void}){
 const t=useText();
 return <Button secondary icon="flag-outline" title={t('الإبلاغ عن مشكلة','Report a problem','Problem melden')}
  onPress={()=>{onOpen?.();router.push({pathname:'/complaints',params:{ride:rideId}})}}/>;
}

export function canCallRide(ride:CloudRide){
 return !!ride.driver_id&&(ride.status==='accepted'||ride.status==='arrived'||ride.status==='riding');
}

export function RideCallButton({rideId,driver}:{rideId:string;driver:boolean}){
 const t=useText();
 const {connection}=useApp();
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const focused=useRef(false);
 const pending=useRef(false);
 useFocusEffect(useCallback(()=>{
  focused.current=true;
  return()=>{focused.current=false};
 },[]));

 async function call(){
  if(pending.current||connection==='offline')return;
  pending.current=true;
  setBusy(true);setMessage('');
  try{
   const phone=await cloudRideContactPhone(await cloudCurrentToken(),rideId);
   if(!focused.current)return;
   if(typeof phone!=='string'||!/^\+9639[0-9]{8}$/.test(phone)){
    setMessage(t('رقم الطرف الآخر غير متاح لهذه الرحلة.','The other party’s number is unavailable for this ride.','Die Telefonnummer der anderen Person ist für diese Fahrt nicht verfügbar.'));
    return;
   }
   await Linking.openURL('tel:'+phone);
  }catch{
   if(focused.current)setMessage(t('تعذّر فتح الاتصال. تحقّق من الإنترنت وأعد المحاولة.','Could not open the call. Check your connection and try again.','Anruf konnte nicht geöffnet werden. Prüfe die Verbindung und versuche es erneut.'));
  }finally{
   pending.current=false;
   setBusy(false);
  }
 }

 return <View style={{gap:4}}>
  <Button secondary icon="call-outline" title={busy?t('جارٍ فتح الاتصال…','Opening phone…','Telefon wird geöffnet …'):driver
   ?t('اتصل بالزبون','Call the passenger','Fahrgast anrufen')
   :t('اتصل بالسائق','Call the driver','Fahrer anrufen')} disabled={busy||connection==='offline'} onPress={()=>void call()}/>
  {!!message&&<View accessibilityRole="alert"><Label muted>{message}</Label></View>}
 </View>;
}
