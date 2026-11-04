import React,{useEffect,useState} from 'react';
import {Linking,Platform,View} from 'react-native';
import * as Location from 'expo-location';
import {announceWebPosition,webLocationGranted} from './web-position';
import {isNativeWebView,siteCurrentPosition} from './site-bridge';
import {Button,Label,Panel,useText} from './ui';
export default function PermissionsPanel(){
 const t=useText();const [status,setStatus]=useState<'unknown'|'granted'|'denied'>('unknown'),[busy,setBusy]=useState(false),[services,setServices]=useState<boolean|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{
  let alive=true;
  if(Platform.OS==='web'){
   if(isNativeWebView()){
    // In the installed app Android owns permission. Do not misreport the
    // browser origin's separate permission as the Android permission state.
    const host=window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean};
    if(host.__YALLA_NATIVE_LOCATION_GRANTED__===true)setStatus('granted');
    const update=(event:Event)=>{
     if(alive)setStatus((event as CustomEvent).detail?.granted===true?'granted':'unknown');
    };
    host.addEventListener('yalla:native-location-permission',update);
    return()=>{alive=false;host.removeEventListener('yalla:native-location-permission',update)};
   }
   void webLocationGranted().then(granted=>{if(alive)setStatus(granted?'granted':'unknown')}).catch(()=>{});
  }else{
   void Promise.all([Location.getForegroundPermissionsAsync(),Location.hasServicesEnabledAsync()]).then(([permission,on])=>{if(alive){setStatus(permission.granted?'granted':permission.status==='denied'?'denied':'unknown');setServices(on)}}).catch(()=>{});
  }
  return()=>{alive=false};
 },[]);
 async function request(){
  setBusy(true);setMessage('');
  try{
   if(Platform.OS==='web'){
    const point=await siteCurrentPosition(true);
    setStatus('granted');setServices(true);if(!isNativeWebView())announceWebPosition(point);
    setMessage(t('تم تحديد موقعك. عند العودة إلى الخريطة ستظهر علامة موقعك الحالي.','Location found. Your position will appear on the map.'));
   }else{
    const permission=await Location.requestForegroundPermissionsAsync();
    setStatus(permission.granted?'granted':'denied');setServices(await Location.hasServicesEnabledAsync());
    if(!permission.granted)setMessage(t('لم يُمنح إذن الموقع. يمكنك متابعة الإدخال اليدوي أو تعديل الإذن من إعدادات الجهاز.','Location permission was not given. Use manual entry or change permission in phone settings.'));
   }
  }catch{setStatus('denied');setMessage(t('لم نتمكن من تحديد موقعك. فعّل خدمة الموقع وإذن «الموقع الدقيق» لتطبيق يلا نروح من إعدادات الهاتف، ثم أعد المحاولة.','Could not find your location. Turn on GPS and allow precise location for Yalla Nrouh in phone settings, then try again.'))}
  finally{setBusy(false)}
 }
 return <Panel>
  <Label>{t('إذن الموقع','Location permission')}</Label>
  <Label muted>{t('يُستخدم موقعك أثناء فتح التطبيق لتحديد الانطلاق وإظهار الطريق. اضغط الزر للتحقق منه.','Your location is used while the app is open for pickup and directions. Tap to check it.')}</Label>
  <Label>{status==='granted'?t('إذن الموقع ممنوح','Location permission is on'):t('يحتاج الموقع إلى موافقتك','Location needs your permission')}</Label>
  {services===false&&<Label>{t('خدمة GPS متوقفة؛ فعّل الموقع من إعدادات الهاتف.','GPS is off. Turn on location in phone settings.')}</Label>}
  <Button secondary disabled={busy} title={t('تحديد موقعي الآن','Find my location now')} onPress={()=>{void request()}}/>
  {Platform.OS==='web'&&<View style={{gap:6}}><Label muted>{t('إذا لم يعمل الزر: افتح إعدادات الهاتف ← التطبيقات ← يلا نروح ← الأذونات ← الموقع، ثم اختر «السماح أثناء استخدام التطبيق» و«الموقع الدقيق». شغّل الموقع (GPS) أيضًا.','If location does not work: Phone Settings → Apps → Yalla Nrouh → Permissions → Location. Allow while using the app and precise location. Also turn on GPS.')}</Label></View>}
  {status==='denied'&&Platform.OS!=='web'&&<Button secondary title={t('فتح إعدادات الأذونات','Open permission settings')} onPress={()=>{void Linking.openSettings().catch(()=>setMessage(t('افتح إعدادات التطبيق يدويًا.','Open app settings on your phone.')))}}/>}
  {message!==''&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
 </Panel>;
}
