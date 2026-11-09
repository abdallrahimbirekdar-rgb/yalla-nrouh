import {useAuth} from '../auth';
import {ridePushAvailable,useRidePushEnrolled} from '../ride-push';
import {useRef,useState} from 'react';
import {Linking,Platform,Text,View} from 'react-native';
import {enableLocalAlerts,notifyLocal} from '../alerts';
import {useApp} from '../context';
import {isNativeWebView,nativeAction} from '../site-bridge';
import {brandHeader,useTheme} from '../theme';
import {Button,Icon,Label,Page,Panel,useText} from '../ui';

export default function Notifications(){
 const {state,dispatch}=useApp();
 const auth=useAuth();
 const backgroundReady=useRidePushEnrolled(auth.session?.user.id);
 const t=useText();
 const {colors,dark}=useTheme();
 const busyRef=useRef(false);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<'denied'|'error'|'sent'|null>(null);
 const available=Platform.OS!=='web'||isNativeWebView();
 const enabled=state.preferences.notifications;
 const actionColor=dark?brandHeader.accent:colors.brandAction;

 async function toggle(){
  if(busyRef.current)return;
  setFeedback(null);
  if(enabled){
   dispatch({type:'preferences',preferences:{notifications:false}});
   return;
  }
  busyRef.current=true;
  setBusy(true);
  try{
   if(await enableLocalAlerts())dispatch({type:'preferences',preferences:{notifications:true}});
   else setFeedback('denied');
  }catch{setFeedback('error')}
  finally{busyRef.current=false;setBusy(false)}
 }

 async function sendTest(){
  if(busyRef.current)return;
  busyRef.current=true;setBusy(true);setFeedback(null);
  try{
   await notifyLocal(t('يلّا نروح','Yalla Nrouh','Yalla Nrouh'),
    t('وصل إشعار يلّا نروح التجريبي.','Your Yalla Nrouh test notification arrived.','Deine Yalla-Nrouh-Testmeldung ist angekommen.'));
   setFeedback('sent');
  }catch{setFeedback('error')}
  finally{busyRef.current=false;setBusy(false)}
 }

 async function openSettings(){
  try{
   if(Platform.OS==='web'){
    if(!await nativeAction('location-settings'))setFeedback('error');
   }else await Linking.openSettings();
  }catch{setFeedback('error')}
 }

 return <Page compact simpleHeader title={t('الإشعارات','Notifications','Benachrichtigungen')} backTo="/account">
  <Panel>
   <View accessible={false} style={{alignSelf:'center',width:136,height:136,borderRadius:68,
    backgroundColor:colors.soft,alignItems:'center',justifyContent:'center',marginVertical:10}}>
    <View style={{width:66,height:100,borderRadius:16,borderWidth:2,borderColor:colors.line,
     backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',gap:8}}>
     <View style={{width:20,height:3,borderRadius:2,backgroundColor:colors.line}}/>
     <Icon name="notifications" size={30} color={actionColor}/>
     <View style={{width:26,height:3,borderRadius:2,backgroundColor:colors.line}}/>
    </View>
    <View style={{position:'absolute',top:26,right:22,width:18,height:18,borderRadius:9,
     borderWidth:3,borderColor:colors.surface,backgroundColor:actionColor}}/>
   </View>
   <Text accessibilityRole="header" style={{textAlign:'center',color:colors.ink,fontSize:22,fontWeight:'700'}}>
    {t('تنبيهات الرحلة على جهازك','Ride alerts on your phone','Fahrtmeldungen auf deinem Handy')}
   </Text>
   <Label>{t('عندما يكون التطبيق مفتوحًا، يمكن للهاتف تنبيهك عند قبول رحلتك أو وصول السائق. وإذا كنت في الدوام كسائق، ينبهك التطبيق عند ظهور طلب جديد.','While the app is open, your phone can notify you when your ride is accepted or your driver arrives. On-duty drivers can also get a notification when a new offer appears.','Bei geöffneter App kann dein Handy melden, wenn deine Fahrt angenommen wird oder der Fahrer ankommt. Fahrer im Dienst können eine Meldung bei neuen Anfragen erhalten.')}</Label>
   {available?<Label muted>{enabled
    ?t('التنبيهات مفعّلة داخل التطبيق. يعتمد ظهورها على إذن الهاتف.','Alerts are on in the app. Your phone must also allow them.','Meldungen sind in der App aktiv. Dein Handy muss sie ebenfalls erlauben.')
    :t('التنبيهات متوقفة داخل التطبيق.','Alerts are off in the app.','Meldungen sind in der App aus.')}</Label>
    :<Label muted>{t('تنبيهات الجهاز متاحة في تطبيق الهاتف.','Phone alerts are available in the mobile app.','Gerätemeldungen sind in der Handy-App verfügbar.')}</Label>}
   {available&&enabled&&<Label muted>{backgroundReady
    ?t('تنبيهات الخلفية مفعّلة لهذا الحساب.','Background alerts are enabled for this account.','Hintergrundmeldungen sind für dieses Konto aktiv.')
    :ridePushAvailable()?t('تنبيهات الخلفية بانتظار تسجيل الجهاز.','Background alerts are waiting for device registration.','Hintergrundmeldungen warten auf die Geräteregistrierung.')
    :t('هذه النسخة تعرض التنبيهات أثناء فتح التطبيق.','This build shows alerts while the app is open.','Diese Version zeigt Meldungen bei geöffneter App.')}</Label>}
   {available&&<Button prominent secondary={enabled} icon={enabled?'notifications-off-outline':'notifications-outline'}
    title={busy?t('جارٍ التحقق من الإذن…','Checking permission…','Berechtigung wird geprüft…'):enabled
     ?t('إيقاف تنبيهات الرحلة','Turn off ride alerts','Fahrtmeldungen ausschalten')
     :t('تفعيل تنبيهات الرحلة','Turn on ride alerts','Fahrtmeldungen einschalten')}
    disabled={busy} onPress={()=>void toggle()}/>}
   {available&&enabled&&<Button secondary icon="paper-plane-outline"
    title={t('إرسال إشعار تجريبي','Send a test notification','Testmeldung senden')}
    disabled={busy} onPress={()=>void sendTest()}/>}
   {available&&<Button secondary icon="settings-outline"
    title={t('فتح إعدادات الهاتف','Open phone settings','Handy-Einstellungen öffnen')}
    disabled={busy} onPress={()=>void openSettings()}/>}
   {feedback&&<View accessibilityRole="alert"><Label>{feedback==='sent'
    ?t('تم إرسال الإشعار التجريبي.','Test notification sent.','Testmeldung gesendet.')
    :feedback==='denied'
    ?t('لم يُمنح الإذن. افتح إعدادات الهاتف واسمح بإشعارات يلّا نروح، ثم أعد المحاولة.','Permission was not granted. Allow Yalla Nrouh notifications in your phone settings, then try again.','Die Berechtigung fehlt. Erlaube Yalla-Nrouh-Benachrichtigungen in den Handy-Einstellungen und versuche es erneut.')
    :t('تعذّر إكمال الإجراء. افتح إعدادات الهاتف واختر يلّا نروح ثم الإشعارات.','This action could not finish. Open your phone settings and choose Yalla Nrouh, then Notifications.','Das hat nicht geklappt. Wähle in den Handy-Einstellungen Yalla Nrouh und dann Benachrichtigungen.')}</Label></View>}
  </Panel>
 </Page>;
}
