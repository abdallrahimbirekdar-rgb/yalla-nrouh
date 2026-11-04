import React,{useEffect,useState} from 'react';
import {Linking,Platform,View} from 'react-native';
import * as Location from 'expo-location';
import {announceWebPosition,webLocationGranted} from './web-position';
import {PositionError} from './current-position';
import {isNativeWebView,siteCurrentPosition,nativeAction} from './site-bridge';
import {Button,Label,Panel,useText} from './ui';
type GpsStatus={version?:string;stage?:string;permission?:boolean;precise?:boolean;services?:boolean;gps?:boolean;network?:boolean};
export default function PermissionsPanel(){
 const [diagnostic,setDiagnostic]=useState<GpsStatus|null>(null);
 const t=useText();const [status,setStatus]=useState<'unknown'|'granted'|'denied'>('unknown'),[busy,setBusy]=useState(false),[services,setServices]=useState<boolean|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{
  let alive=true;
  if(Platform.OS==='web'){
   if(isNativeWebView()){
    // In the installed app Android owns permission. Do not misreport the
    // browser origin's separate permission as the Android permission state.
    const host=window as Window&{__YALLA_NATIVE_LOCATION_GRANTED__?:boolean;__YALLA_GPS_STATUS__?:GpsStatus};
    const gpsUpdate=(event:Event)=>{const value=(event as CustomEvent).detail as GpsStatus;if(!alive||!value)return;setDiagnostic(value);if(typeof value.permission==='boolean')setStatus(value.permission?'granted':'denied');if(typeof value.services==='boolean')setServices(value.services)};
    if(host.__YALLA_GPS_STATUS__)gpsUpdate(new CustomEvent('yalla:gps-status',{detail:host.__YALLA_GPS_STATUS__}));
    host.addEventListener('yalla:gps-status',gpsUpdate);
    if(host.__YALLA_NATIVE_LOCATION_GRANTED__===true)setStatus('granted');
    const update=(event:Event)=>{
     if(alive)setStatus((event as CustomEvent).detail?.granted===true?'granted':'unknown');
    };
    host.addEventListener('yalla:native-location-permission',update);
    return()=>{alive=false;host.removeEventListener('yalla:native-location-permission',update);host.removeEventListener('yalla:gps-status',gpsUpdate)};
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
  }catch(error){
   const code=error instanceof PositionError?error.code:'position';
   if(code==='permission')setStatus('denied');
   if(code==='services')setServices(false);
   setMessage(code==='accuracy'?t('الإذن الحالي تقريبي. افتح إعدادات التطبيق وفعّل «استخدام الموقع الدقيق».','Only rough location is allowed. Open app settings and turn on precise location.'):code==='permission'?t('إذن الموقع غير ممنوح. اسمح بالموقع أثناء استخدام التطبيق من إعدادات الهاتف.','Location is not allowed. Allow it while using the app in phone settings.'):code==='services'?t('الإذن لا يشغّل GPS. فعّل خدمة الموقع وتحسين دقة الموقع في الهاتف.','Permission does not turn on GPS. Turn on location and location accuracy in phone settings.'):code==='timeout'?t('الإذن موجود لكن لم تصل إشارة موقع خلال المهلة. تأكد من تشغيل تحسين دقة الموقع، وحاول قرب نافذة أو في مكان مفتوح.','No location signal arrived in time. Turn on location accuracy and try near a window or outside.'):t('لم يرسل الهاتف موقعًا. راجع حالة GPS أدناه ثم أعد المحاولة.','The phone did not send a location. Check GPS status below and try again.'));
  }
  finally{setBusy(false)}
 }
 return <Panel>
  <Label>{t('إذن الموقع','Location permission')}</Label>
  <Label muted>{t('يُستخدم موقعك أثناء فتح التطبيق لتحديد الانطلاق وإظهار الطريق. اضغط الزر للتحقق منه.','Your location is used while the app is open for pickup and directions. Tap to check it.')}</Label>
  <Label>{status==='granted'?t('إذن الموقع ممنوح','Location permission is on'):t('يحتاج الموقع إلى موافقتك','Location needs your permission')}</Label>
  {services===false&&<Label>{t('خدمة GPS متوقفة؛ فعّل الموقع من إعدادات الهاتف.','GPS is off. Turn on location in phone settings.')}</Label>}
  <Button secondary disabled={busy} title={busy?t('جارٍ التحقق من الموقع…','Checking location…'):t('تحديد موقعي الآن','Find my location now')} onPress={()=>{void request()}}/>
  {Platform.OS==='web'&&isNativeWebView()&&<Button secondary title={t('فتح إعدادات موقع التطبيق','Open app location settings')} onPress={()=>{void nativeAction('location-settings').catch(()=>setMessage(t('افتح إعدادات الهاتف ثم أذونات يلا نروح.','Open phone settings, then Yalla Nrouh permissions.')))}}/>}
  {diagnostic&&<View style={{gap:4}}><Label muted>{t('نسخة أندرويد: ','Android version: ')+(diagnostic.version??'—')}</Label><Label muted>{t('الدقة: ','Accuracy: ')+(diagnostic.precise?t('دقيقة','Precise'):t('تقريبية','Rough'))+' • GPS: '+(diagnostic.gps?t('يعمل','On'):t('متوقف','Off'))}</Label><Label muted>{t('تحسين الموقع بالشبكة: ','Network location: ')+(diagnostic.network?t('يعمل','On'):t('متوقف','Off'))}</Label></View>}
  {Platform.OS==='web'&&<View style={{gap:6}}><Label muted>{t('إذا لم يعمل الزر: افتح إعدادات الهاتف ← التطبيقات ← يلا نروح ← الأذونات ← الموقع، ثم اختر «السماح أثناء استخدام التطبيق» و«الموقع الدقيق». شغّل الموقع (GPS) أيضًا.','If location does not work: Phone Settings → Apps → Yalla Nrouh → Permissions → Location. Allow while using the app and precise location. Also turn on GPS.')}</Label></View>}
  {status==='denied'&&Platform.OS!=='web'&&<Button secondary title={t('فتح إعدادات الأذونات','Open permission settings')} onPress={()=>{void Linking.openSettings().catch(()=>setMessage(t('افتح إعدادات التطبيق يدويًا.','Open app settings on your phone.')))}}/>}
  {message!==''&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
 </Panel>;
}
