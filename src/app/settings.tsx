import PermissionsPanel from '../permissions-panel';
import React from 'react';
import {router,useLocalSearchParams} from 'expo-router';
import {useAuth} from '../auth';
import DriverNavigationSettings from '../driver-navigation-settings';
import DriverVehicleSettings from '../driver-vehicle-settings';
import {useApp} from '../context';
import {Button,Label,LanguagePicker,Page,Panel,useText} from '../ui';
export function SettingsContent(){
 const {state,dispatch,connection}=useApp();
 const t=useText();
 return <><Panel><LanguagePicker/></Panel><PermissionsPanel/>
 <Panel><Label>{t('توفير البيانات','Data saver')}</Label><Label muted>{t('الخريطة تفتح تلقائيًا وتتكيف مع جودة الاتصال التي يبلّغ عنها جهازك. فعّل التوفير لإبقاء التفاصيل الإضافية مخفّضة دائمًا.','The map opens on its own and uses connection information from your device. Turn on data saver to always use fewer extra details.')}</Label><Button secondary title={state.preferences.dataSaver?t('مفعّل • خريطة تلقائية وخفيفة','On • automatic, light map'):t('متوقف • الخريطة تتكيف مع الاتصال','Off • map follows connection quality')} onPress={()=>dispatch({type:'preferences',preferences:{dataSaver:!state.preferences.dataSaver}})}/><Label muted>{t('العناوين والسجل محفوظة محليًا. تفاصيل الخريطة تحتاج اتصالًا، وقد تتوفر الأجزاء التي زرتها من ذاكرة المتصفح؛ ليست خريطة كاملة دون إنترنت.','Addresses and history are saved on this phone. Map details need internet. Some viewed areas may stay in browser cache; this is not a full offline map.')}</Label></Panel>
 <Panel><Label>{t('المظهر','Theme')}</Label>{(['system','light','dark'] as const).map((value,i)=><Button key={value} secondary={state.preferences.theme!==value} title={(state.preferences.theme===value?'✓ ':'')+t(['حسب الجهاز','فاتح','مظلم'][i],['Phone setting','Light','Dark'][i])} onPress={()=>dispatch({type:'preferences',preferences:{theme:value}})}/>)}</Panel>
 <Panel><Button secondary icon="notifications-outline" title={t('إعدادات الإشعارات','Notification settings','Benachrichtigungseinstellungen')}
  onPress={()=>router.push('/notifications')}/></Panel>
 <Panel><Label>{t('الاتصال وحفظ البيانات','Connection and saved data')}</Label><Label>{connection==='offline'?t('الجهاز دون اتصال','No connection'):connection==='online'?t('يتوفر اتصال بالإنترنت','Internet connection is available'):t('لم يُتحقق من وصول الإنترنت','Internet access has not been checked')}</Label><Label muted>{t('تُحفظ مسودة نقاط الرحلة على هذا الجهاز. تحتاج الحسابات والطلبات وحساب الطريق إلى الإنترنت. لا يُرسل طلب رحلة إلا بعد تأكيده.','Your draft points stay on this device. Accounts, requests and routes need internet. A ride request is sent only after you confirm it.')}</Label><Button secondary title={t('حالة الخدمات','Service status')} onPress={()=>router.push('/services')}/></Panel>
 </>;
}
export default function Settings(){
 const t=useText();
 const auth=useAuth();
 const {mode}=useLocalSearchParams<{mode?:string}>();
 const driverMode=!!auth.session&&(auth.driver||mode==='driver');
 return <Page title={driverMode?t('إعدادات السائق','Driver settings'):t('الإعدادات','Settings')}
  backTo={driverMode?{pathname:'/cloud',params:{mode:'driver'}}:'/'}>
  {driverMode&&<><DriverNavigationSettings/><DriverVehicleSettings key={auth.session?.user.id}/></>}
  <SettingsContent/>
 </Page>;
}

