import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {syrianMobile} from '../syrian-phone';
import {AccountLinks} from '../account-links';
import AccountProfile from '../account-profile';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {useApp} from '../context';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
export default function Account(){
 const auth=useAuth();const {state}=useApp();const t=useText();const {next}=useLocalSearchParams<{next?:string}>();
 const [mode,setMode]=useState<'login'|'driver'|'signup'|'reset'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [driverPhone,setDriverPhone]=useState('');
 const [changingPassword,setChangingPassword]=useState(false),[currentPassword,setCurrentPassword]=useState('');
 const accountId=auth.session?.user.id;
 const driverLogin=mode==='driver';
 const loginMode=mode==='login'||driverLogin;
 const driverPhoneValid=syrianMobile(driverPhone);
 const allowedNext=next==='delete-account'?'/delete-account':next==='admin'?'/admin':next==='review'?'/review':next==='complaints'?'/complaints':next==='destination'||next==='saved'?'/location':null;
 useEffect(()=>{if(auth.recovery)setNotice('')},[auth.recovery]);
 useEffect(()=>{setChangingPassword(false);setCurrentPassword('');setPassword('');setRepeat('')},[accountId]);
 async function submit(){
  if(busy)return;setBusy(true);setNotice('');
  try{
   if(auth.recovery){if(password.length<8||password!==repeat){setNotice(t('كلمتا المرور غير متطابقتين، أو أقل من ٨ أحرف.','Passwords must match and have at least 8 characters.'));return}await auth.updatePassword(password);setPassword('');setRepeat('');setNotice(t('تم تغيير كلمة المرور بنجاح.','Password changed.'));return}
   if(mode==='reset'){await auth.reset(email);setNotice(t('إذا كان البريد مسجلًا، ستصلك رسالة لإعادة تعيين كلمة المرور. افحص البريد غير المرغوب أيضًا.','If the email has an account, a reset message will arrive. Check spam too.'));return}
   if(mode==='signup'){if(password!==repeat){setNotice(t('كلمتا المرور غير متطابقتين.','Passwords do not match.'));return}const signed=await auth.signUp(email,password);setPassword('');setRepeat('');setNotice(signed?t('تم إنشاء الحساب وتسجيل الدخول.','Account created. You are signed in.'):t('افتح رسالة التأكيد في بريدك، ثم عد إلى تسجيل الدخول.','Open the email to confirm your account, then sign in.'));return}
   if(driverLogin&&!driverPhoneValid){setNotice(t('أدخل رقم موبايل سوري صالح.','Enter a valid Syrian mobile number.'));return}
   await auth.signIn(driverLogin?driverPhoneValid!:email,password);setPassword('');
   if(allowedNext==='/location')router.replace({pathname:'/location',params:next==='saved'?{view:'saved'}:{target:'destination'}});else if(next==='history')router.replace({pathname:'/cloud',params:{mode:'history'}});else if(allowedNext)router.replace(allowedNext);else if(driverLogin)router.replace({pathname:'/cloud',params:{mode:'driver'}});else router.replace('/');
  }catch(error){setNotice(authErrorMessage(error,state.language))}finally{setBusy(false)}
 }
 async function changeDriverPassword(){
  if(busy||!currentPassword||password.length<8||password!==repeat)return;
  setBusy(true);setNotice('');
  try{
   await auth.updatePassword(password,currentPassword);
   setNotice(t('تم تغيير كلمة المرور.','Password changed.'));
   setChangingPassword(false);setCurrentPassword('');setPassword('');setRepeat('');
  }catch(error){setNotice(authErrorMessage(error,state.language))}
  finally{setBusy(false)}
 }
 const signOut=()=>{setBusy(true);void auth.signOut().catch(error=>setNotice(authErrorMessage(error,state.language))).finally(()=>setBusy(false))};
 const privacy={title:t('سياسة الخصوصية','Privacy policy','Datenschutzerklärung'),icon:'shield-outline' as const,onPress:()=>router.push('/privacy')};
 const signedIn=!!auth.session&&!auth.recovery;
 return <Page simpleHeader compact title={auth.recovery?t('كلمة مرور جديدة','New password'):auth.session?t('حسابي','My account'):t('تسجيل الدخول','Sign in')}>
  {!auth.ready||auth.session&&!auth.rolesReady?<ActivityIndicator/>:auth.session&&!auth.recovery?<>
   <AccountProfile key={auth.session.user.id} userId={auth.session.user.id}
    identity={auth.session.user.app_metadata?.yalla_driver_phone&&auth.session.user.phone
     ?syrianMobile(auth.session.user.phone)||auth.session.user.phone:auth.session.user.email||auth.session.user.phone||''}
    role={auth.admin?t('حساب الإدارة','Administrator','Administratorkonto'):auth.driver?t('حساب سائق معتمد','Approved driver','Zugelassener Fahrer'):t('حساب الراكب','Passenger account','Fahrgastkonto')}/>
   {!auth.driver&&<Button icon="car-outline" title={t('حجز رحلة','Book a ride','Fahrt buchen')} onPress={()=>router.replace('/')}/>}
   <AccountLinks title={t('الإعدادات العامة','General','Allgemein')} items={[
    ...(!auth.driver?([
     {title:t('رحلاتي','My rides','Meine Fahrten'),icon:'list-outline',onPress:()=>router.push('/cloud')},
     {title:t('أماكني المحفوظة','My saved places','Meine gespeicherten Orte'),icon:'bookmark-outline',onPress:()=>router.push({pathname:'/location',params:{view:'saved'}})},
    ] as const):[]),
    {title:t('الإشعارات','Notifications','Benachrichtigungen'),icon:'notifications-outline',onPress:()=>router.push('/notifications')},
    {title:auth.driver?t('لوحة السائق','Driver dashboard','Fahrerbereich'):t('وضع السائق','Driver mode','Fahrermodus'),icon:'car-sport-outline',onPress:()=>router.push({pathname:'/cloud',params:{mode:'driver'}})},
    ...(auth.admin?[{title:t('لوحة الإدارة','Administration','Verwaltung'),icon:'shield-checkmark-outline' as const,onPress:()=>router.push('/admin')}]:[]),
   ]}/>
   <AccountLinks title={t('إعدادات الحساب','Account settings','Kontoeinstellungen')} items={[
    {title:auth.driver?t('إعدادات السائق والسيارة','Driver and vehicle settings','Fahrer- und Fahrzeugeinstellungen'):t('اللغة والمظهر والأذونات','Language, theme and permissions','Sprache, Design und Berechtigungen'),
     icon:'options-outline',onPress:()=>router.push(auth.driver?{pathname:'/settings',params:{mode:'driver'}}:'/settings')},
    privacy,
    {title:t('تسجيل الخروج من هذا الجهاز','Sign out on this device','Auf diesem Gerät abmelden'),icon:'log-out-outline',onPress:signOut,disabled:busy},
    {title:t('حذف الحساب','Delete account','Konto löschen'),icon:'trash-outline',danger:true,onPress:()=>router.push('/delete-account')},
   ]}/>
   {auth.session.user.phone&&(!auth.session.user.email||auth.session.user.app_metadata?.yalla_driver_phone)&&<Panel>
    <Button secondary title={t('تغيير كلمة المرور','Change password')} onPress={()=>{setChangingPassword(!changingPassword);setCurrentPassword('');setPassword('');setRepeat('');setNotice('')}} disabled={busy}/>
    {changingPassword&&<>
     <Field label={t('كلمة المرور الحالية','Current password')} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password"/>
     <Field label={t('كلمة المرور الجديدة','New password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password"/>
     <Field label={t('تأكيد كلمة المرور الجديدة','Repeat new password')} value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password"/>
     <Button title={t('حفظ كلمة المرور','Save password')} disabled={busy||!currentPassword||password.length<8||password!==repeat} onPress={()=>void changeDriverPassword()}/>
    </>}
   </Panel>}
  </>:<Panel>
   {!auth.recovery&&<View style={{flexDirection:state.language==='ar'?'row-reverse':'row',gap:10}}><View style={{flex:1}}><Button secondary={mode!=='login'} title={t('تسجيل الدخول','Sign in')} onPress={()=>{setMode('login');setNotice('')}}/></View><View style={{flex:1}}><Button secondary={mode!=='signup'} title={t('حساب جديد','New account')} onPress={()=>{setMode('signup');setNotice('')}}/></View></View>}
   {!auth.recovery&&<Button secondary={!driverLogin} title={t('دخول السائق برقم الموبايل','Driver login by mobile number','Fahrer-Login per Mobilnummer')} onPress={()=>{setMode('driver');setNotice('');setPassword('')}}/>}
   {driverLogin&&!auth.recovery&&<Label muted>{t('إذا أضافتك الإدارة برقم موبايل، أدخل رقمك وكلمة المرور التي أعطتك إياها. إذا نسيتها تواصل مع الإدارة.','If admin added you by mobile number, enter your number and the password they gave you. Contact admin if you forget it.')}</Label>}
   {mode==='reset'&&!auth.recovery&&<Label>{t('استعادة كلمة المرور','Reset password')}</Label>}
   {!auth.recovery&&driverLogin&&<Field label={t('رقم الموبايل السوري (+963)','Syrian mobile number (+963)','Syrische Mobilnummer (+963)')} value={driverPhone} onChangeText={setDriverPhone} placeholder="09XXXXXXXX" keyboardType="phone-pad" autoComplete="tel" maxLength={30}/>}
   {!auth.recovery&&!driverLogin&&<Field label={t('البريد الإلكتروني','Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={200}/>}
   {(mode!=='reset'||auth.recovery)&&<><Field label={t('كلمة المرور','Password')} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoComplete={mode==='signup'||auth.recovery?'new-password':'current-password'} maxLength={128} onSubmitEditing={()=>void submit()} returnKeyType="go"/><Pressable accessibilityRole="button" onPress={()=>setVisible(!visible)}><Label muted>{visible?t('إخفاء كلمة المرور','Hide password'):t('إظهار كلمة المرور','Show password')}</Label></Pressable></>}
   {(mode==='signup'||auth.recovery)&&<Field label={t('تأكيد كلمة المرور','Repeat password')} value={repeat} onChangeText={setRepeat} secureTextEntry={!visible} autoComplete="new-password" maxLength={128}/>}
   <Button icon="log-in-outline" title={busy?t('جارٍ المتابعة…','Just a moment…'):auth.recovery?t('حفظ كلمة المرور','Save password'):mode==='signup'?t('إنشاء الحساب','Create account'):mode==='reset'?t('إرسال رابط الاستعادة','Send reset link'):t('تسجيل الدخول','Sign in')} disabled={busy||(!auth.recovery&&(driverLogin?!driverPhoneValid:!email.includes('@')))||((mode!=='reset'||auth.recovery)&&password.length<(loginMode&&!auth.recovery?1:8))} onPress={()=>void submit()}/>
   {mode==='login'&&!auth.recovery&&<Button secondary title={t('نسيت كلمة المرور؟','Forgot password?')} onPress={()=>{setMode('reset');setNotice('')}}/>}
   <Label muted>{t('تبقى الجلسة محفوظة على هذا الجهاز حتى تسجّل الخروج. لا نحفظ كلمة المرور.','You stay signed in on this device until you sign out. Your password is not saved.')}</Label>
  </Panel>}
  {!signedIn&&<Button secondary icon={privacy.icon} title={privacy.title} onPress={privacy.onPress}/>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {!!auth.problem&&<Panel><Label>{t('تعذر تحديث الجلسة أو صلاحيات الحساب. تحقق من الاتصال وأعد المحاولة.','Could not check the session or account access. Check internet and try again.')}</Label><Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/></Panel>}
 </Page>;
}
