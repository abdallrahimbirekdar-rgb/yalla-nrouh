import {useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {router} from 'expo-router';
import {useAuth} from '../auth';
import {authClient,createAppAuthClient} from '../auth-client';
import {syrianMobile} from '../syrian-phone';
import {useApp} from '../context';
import {Button,Field,Label,Page,Panel,useText} from '../ui';

export default function DeleteAccount(){
 const auth=useAuth();const t=useText();
 const {clearDeletedAccountData}=useApp();
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState(''),[deleted,setDeleted]=useState(false);
 const email=auth.session?.user.email;
 const phone=auth.session?.user.phone?syrianMobile(auth.session.user.phone):null;
 const identifier=email||phone;
 async function remove(){
  const userId=auth.session?.user.id;
  if(!userId||!identifier||!confirm||!password||busy)return;
  setBusy(true);setNotice('');
  const fresh=createAppAuthClient({persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
  try{
   const signed=await fresh.auth.signInWithPassword(email?{email,password}:{phone:phone!,password});
   if(signed.error||signed.data.user?.id!==userId)throw Error('reauth');
   const {data:result,error}=await fresh.rpc('delete_my_account');
   if(error)throw error;
   if(result==='active_ride'){setNotice(t('ألغِ الطلب أو أكمل الرحلة الجارية، ثم أعد محاولة الحذف.','Cancel the request or finish the active ride, then try again.'));return}
   if(result==='staff'){setNotice(t('يُعالج حذف حساب الإدارة عبر جهة التواصل المذكورة في سياسة الخصوصية.','Administrator account deletion is handled through the privacy contact.'));return}
   if(result!=='deleted')throw Error('delete_unconfirmed');
   setDeleted(true);
   try{
    const {data}=await authClient().auth.getSession();
    if(!data.session||data.session.user.id===userId)await clearDeletedAccountData(userId);
    await auth.signOut(userId);
   }catch{setNotice(t('حُذف الحساب. تعذّر إنهاء تنظيف بيانات هذا الجهاز.','The account was deleted. Cleanup on this device could not finish.'))}
  }catch{setNotice(t('تعذّر إكمال العملية. تحقّق من كلمة المرور والاتصال. إذا حُذف الحساب، لن يعمل تسجيل الدخول به مرة أخرى.','Could not finish. Check your password and connection. If the account was deleted, you can no longer sign in with it.'))}
  finally{
   void fresh.auth.signOut({scope:'local'}).catch(()=>{});
   setBusy(false);setPassword('');setConfirm(false);
  }
 }
 return <Page simpleHeader backTo="/account" title={t('حذف حساب يلّا نروح','Delete your Yalla Nrouh account','Dein Yalla-Nrouh-Konto löschen')}>
  <Panel>
   {deleted?<View accessibilityRole="alert"><Label>{t('حُذف حسابك.','Your account was deleted.','Dein Konto wurde gelöscht.')}</Label></View>:<>
    <Label>{t('يمكنك حذف الحساب نهائيًا من هذه الصفحة. سجّل دخولك، ثم أدخل كلمة المرور وأكّد الحذف.','You can permanently delete your account here. Sign in, enter your password and confirm deletion.','Melde dich an, gib dein Passwort ein und bestätige die endgültige Löschung.')}</Label>
    <Label muted>{t('يُحذف ملفك وأماكنك المحفوظة ورحلاتك كزبون وبيانات سيارتك. تبقى رحلات الزبائن الآخرين في سجلاتهم دون ربطها بحساب السائق المحذوف.','Your profile, saved places, passenger trips and vehicle details are deleted. Other passengers keep their own ride records without a link to the deleted driver account.')}</Label>
    {!auth.ready?<ActivityIndicator/>:!identifier||auth.recovery?<Button title={t('تسجيل الدخول للمتابعة','Sign in to continue')} onPress={()=>router.push({pathname:'/account',params:{next:'delete-account'}})}/>:<>
     <Label muted>{identifier}</Label>
     <Field label={t('كلمة المرور الحالية','Current password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" maxLength={128} editable={!busy}/>
     {!confirm?<Button secondary title={t('أريد حذف حسابي نهائيًا','I want to delete my account permanently')} disabled={!password||busy} onPress={()=>setConfirm(true)}/>:<>
      <Button title={busy?t('جارٍ التحقق والحذف…','Verifying and deleting…'):t('تأكيد حذف الحساب نهائيًا','Confirm permanent deletion')} disabled={busy||!password} onPress={()=>void remove()}/>
      <Button secondary title={t('تراجع','Go back')} disabled={busy} onPress={()=>setConfirm(false)}/>
     </>}
    </>}
   </>}
   {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
   <Button secondary title={t('سياسة الخصوصية','Privacy policy','Datenschutzerklärung')} onPress={()=>router.push('/privacy')}/>
  </Panel>
 </Page>;
}
