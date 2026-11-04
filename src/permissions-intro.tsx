import React,{useEffect,useState} from 'react';
import {Modal,Platform,View} from 'react-native';
import {announceWebPosition} from './web-position';
import {isNativeWebView,siteCurrentPosition} from './site-bridge';
import * as Location from 'expo-location';
import {useApp} from './context';
import {Button,Label,useText,useTheme,styles} from './ui';
export default function PermissionsIntro(){const {state,dispatch}=useApp();const {colors}=useTheme();const t=useText();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const close=()=>dispatch({type:'preferences',preferences:{permissionsIntroSeen:true}});
 // The outer Android screen already asks for foreground permission. A second
 // in-page introduction would repeat that request and block the passenger map.
 const embedded=Platform.OS==='web'&&isNativeWebView();
 useEffect(()=>{if(embedded&&!state.preferences.permissionsIntroSeen)dispatch({type:'preferences',preferences:{permissionsIntroSeen:true}})},[embedded,state.preferences.permissionsIntroSeen,dispatch]);
 async function allow(){setBusy(true);try{if(Platform.OS==='web'){const point=await siteCurrentPosition(true);close();announceWebPosition(point)}else{const result=await Location.requestForegroundPermissionsAsync();if(result.granted)close();else setMessage(t('لم يُمنح الإذن. يمكنك المتابعة وإدخال العناوين يدويًا، أو تفعيله لاحقًا من الإعدادات.','Permission was not given. You can enter addresses by hand or turn on location later in settings.'))}}catch{setMessage(t('تعذر الحصول على الموقع. افتح إعدادات الهاتف ← التطبيقات ← يلا نروح ← الأذونات واسمح بالموقع، ثم أعد المحاولة. يمكنك أيضًا المتابعة يدويًا.','Could not get your location. Allow location in your phone app settings, or continue by hand.'));}finally{setBusy(false);}}
 if(embedded)return null;
 return <Modal visible={!state.preferences.permissionsIntroSeen} transparent animationType="none" onRequestClose={close}><View style={styles.overlay}><View style={{width:'100%',maxWidth:420,alignSelf:'center',backgroundColor:colors.background,borderRadius:20,padding:24,gap:18}}><Label large>{t('جهّز موقعك للرحلة','Set up location for your ride')}</Label><Label>{t('الموقع يساعدنا على تحديد نقطة انطلاقك وإظهار الطريق. اختر «أثناء استخدام التطبيق» و«الموقع الدقيق» عندما يسألك الهاتف.','Location helps with pickup and directions. Choose “while using the app” and “precise location” in your phone prompt.')}</Label><Label muted>{t('لا نطلب موقعًا في الخلفية. الإشعارات اختيارية من الإعدادات.','No background location is requested. Alerts are optional in settings.')}</Label><Button disabled={busy} title={t('السماح بالموقع','Allow location')} onPress={()=>{void allow();}}/><Button secondary disabled={busy} title={t('المتابعة الآن دون إذن','Continue without permission')} onPress={close}/>{message!==''&&<Label>{message}</Label>}</View></View></Modal>;
}
