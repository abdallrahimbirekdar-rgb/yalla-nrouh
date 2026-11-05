import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Pressable,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {useApp} from '../context';
import {Button,Field,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
export default function Account(){
 const auth=useAuth();const {state}=useApp();const t=useText();const {dark}=useTheme();const {next}=useLocalSearchParams<{next?:string}>();
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const allowedNext=next==='admin'?'/admin':next==='review'?'/review':next==='destination'?'/location':null;
 useEffect(()=>{if(auth.recovery)setNotice('')},[auth.recovery]);
 async function submit(){
  if(busy)return;setBusy(true);setNotice('');
  try{
   if(auth.recovery){if(password.length<8||password!==repeat){setNotice(t('كلمتا المرور غير متطابقتين، أو أقل من ٨ أحرف.','Passwords must match and have at least 8 characters.'));return}await auth.updatePassword(password);setPassword('');setRepeat('');setNotice(t('تم تغيير كلمة المرور بنجاح.','Password changed.'));return}
   if(mode==='reset'){await auth.reset(email);setNotice(t('إذا كان البريد مسجلًا، ستصلك رسالة لإعادة تعيين كلمة المرور. افحص البريد غير المرغوب أيضًا.','If the email has an account, a reset message will arrive. Check spam too.'));return}
   if(mode==='signup'){if(password!==repeat){setNotice(t('كلمتا المرور غير متطابقتين.','Passwords do not match.'));return}const signed=await auth.signUp(email,password);setPassword('');setRepeat('');setNotice(signed?t('تم إنشاء الحساب وتسجيل الدخول.','Account created. You are signed in.'):t('افتح رسالة التأكيد في بريدك، ثم عد إلى تسجيل الدخول.','Open the email to confirm your account, then sign in.'));return}
   await auth.signIn(email,password);setPassword('');
   if(allowedNext==='/location')router.replace({pathname:'/location',params:{target:'destination'}});else if(allowedNext)router.replace(allowedNext);else router.replace('/');
  }catch(error){setNotice(authErrorMessage(error,state.language==='ar'))}finally{setBusy(false)}
 }
 return <Page title={auth.recovery?t('كلمة مرور جديدة','New password'):auth.session?t('حسابي','My account'):t('تسجيل الدخول','Sign in')}>
  <View style={{alignItems:'center',gap:8}}><Image source={dark?require('../../assets/logo-header-dark.png'):require('../../assets/logo-approved.png')} style={{width:160,height:88}} resizeMode="contain" accessibilityLabel="يلا نروح"/><Label muted>{t('حساب واحد للموقع والتطبيق','One account for the website and app')}</Label></View>
  {!auth.ready||auth.session&&!auth.rolesReady?<ActivityIndicator/>:auth.session&&!auth.recovery?<>
   <Panel><Icon name="person-circle-outline" size={44}/><Label>{auth.session.user.email}</Label><Label muted>{auth.admin?t('حساب الإدارة','Administrator'):auth.driver?t('حساب سائق معتمد','Approved driver'):t('تم تسجيل الدخول','Signed in')}</Label></Panel>
   {auth.admin&&<Button icon="shield-checkmark-outline" title={t('لوحة الإدارة','Administration')} onPress={()=>router.push('/admin')}/>}
   {!auth.driver&&<>
   <Button icon="car-outline" title={t('حجز رحلة','Book a ride')} onPress={()=>router.replace('/')}/>
   <Button secondary icon="time-outline" title={t('رحلاتي','My rides')} onPress={()=>router.push('/cloud')}/>
   <Button secondary icon="bookmark-outline" title={t('أماكني المحفوظة','My saved places')} onPress={()=>router.push({pathname:'/location',params:{target:'destination',view:'saved'}})}/>
   </>}
   <Button secondary icon="car-sport-outline" title={t('وضع السائق','Driver mode')} onPress={()=>router.push({pathname:'/cloud',params:{mode:'driver'}})}/>
   <Button secondary title={t('تسجيل الخروج من هذا الجهاز','Sign out on this device')} disabled={busy} onPress={()=>{setBusy(true);void auth.signOut().catch(error=>setNotice(authErrorMessage(error,state.language==='ar'))).finally(()=>setBusy(false))}}/>
  </>:<Panel>
   {!auth.recovery&&<View style={{flexDirection:state.language==='ar'?'row-reverse':'row',gap:10}}><View style={{flex:1}}><Button secondary={mode!=='login'} title={t('تسجيل الدخول','Sign in')} onPress={()=>{setMode('login');setNotice('')}}/></View><View style={{flex:1}}><Button secondary={mode!=='signup'} title={t('حساب جديد','New account')} onPress={()=>{setMode('signup');setNotice('')}}/></View></View>}
   {mode==='reset'&&!auth.recovery&&<Label>{t('استعادة كلمة المرور','Reset password')}</Label>}
   {!auth.recovery&&<Field label={t('البريد الإلكتروني','Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={200}/>}
   {(mode!=='reset'||auth.recovery)&&<><Field label={t('كلمة المرور','Password')} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoComplete={mode==='signup'||auth.recovery?'new-password':'current-password'} maxLength={128} onSubmitEditing={()=>void submit()} returnKeyType="go"/><Pressable accessibilityRole="button" onPress={()=>setVisible(!visible)}><Label muted>{visible?t('إخفاء كلمة المرور','Hide password'):t('إظهار كلمة المرور','Show password')}</Label></Pressable></>}
   {(mode==='signup'||auth.recovery)&&<Field label={t('تأكيد كلمة المرور','Repeat password')} value={repeat} onChangeText={setRepeat} secureTextEntry={!visible} autoComplete="new-password" maxLength={128}/>}
   <Button icon="log-in-outline" title={busy?t('جارٍ المتابعة…','Please wait…'):auth.recovery?t('حفظ كلمة المرور','Save password'):mode==='signup'?t('إنشاء الحساب','Create account'):mode==='reset'?t('إرسال رابط الاستعادة','Send reset link'):t('تسجيل الدخول','Sign in')} disabled={busy||(!auth.recovery&&!email.includes('@'))||((mode!=='reset'||auth.recovery)&&password.length<(mode==='login'&&!auth.recovery?1:8))} onPress={()=>void submit()}/>
   {mode==='login'&&!auth.recovery&&<Button secondary title={t('نسيت كلمة المرور؟','Forgot password?')} onPress={()=>{setMode('reset');setNotice('')}}/>}
   <Label muted>{t('تبقى الجلسة محفوظة على هذا الجهاز حتى تسجّل الخروج. لا نحفظ كلمة المرور.','You stay signed in on this device until you sign out. Your password is not saved.')}</Label>
  </Panel>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {!!auth.problem&&<Panel><Label>{t('تعذر تحديث الجلسة أو صلاحيات الحساب. تحقق من الاتصال وأعد المحاولة.','Could not check the session or account access. Check internet and try again.')}</Label><Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/></Panel>}
 </Page>;
}
