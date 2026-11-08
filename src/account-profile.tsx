import {useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {authClient} from './auth-client';
import {Button,Field,Label,Panel,useText} from './ui';

export default function AccountProfile({userId}:{userId:string}){
 const t=useText();
 const [name,setName]=useState(''),[phone,setPhone]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 const [status,setStatus]=useState<'load'|'phone'|'save'|'saved'|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   try{
    const {data,error}=await authClient().from('account_profiles').select('full_name,phone')
     .eq('user_id',userId).abortSignal(controller.signal).maybeSingle();
    if(error)throw error;
    if(controller.signal.aborted)return;
    setName(data?.full_name??'');setPhone(data?.phone??'');
   }catch{if(!controller.signal.aborted)setStatus('load')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  }
  void load();
  return()=>controller.abort();
 },[userId,attempt]);
 async function save(){
  const normalized=phone.trim().replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit<'۰'?0x660:0x6f0))).replace(/[\s()-]/g,'');
  if(normalized&&!/^\+?\d{7,15}$/.test(normalized)){setStatus('phone');return}
  setBusy(true);setStatus(null);
  try{
   const {error}=await authClient().from('account_profiles').upsert({user_id:userId,full_name:name.trim(),phone:normalized});
   if(error)throw error;
   setName(name.trim());setPhone(normalized);setStatus('saved');
  }catch{setStatus('save')}finally{setBusy(false)}
 }
 return <Panel>
  <Label large>{t('معلوماتي الشخصية','My personal information','Meine persönlichen Daten')}</Label>
  <Label muted>{t('يمكنك حفظ اسمك ورقم هاتفك أو إفراغهما وحفظ التغييرات. هذه الحقول اختيارية وخاصة بحسابك.','You can save, edit or clear your name and phone. These optional fields are private to your account.','Name und Telefonnummer sind freiwillig und nur für dein Konto sichtbar.')}</Label>
  {loading?<ActivityIndicator/>:status==='load'?<>
   <Label>{t('تعذّر تحميل معلوماتك.','Could not load your details.')}</Label>
   <Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>{setStatus(null);setLoading(true);setAttempt(value=>value+1)}}/>
  </>:<>
   <Field label={t('الاسم الكامل','Full name','Vollständiger Name')} value={name} onChangeText={value=>{setName(value);setStatus(null)}} autoComplete="name" maxLength={80} editable={!busy}/>
   <Field label={t('رقم الهاتف','Phone number','Telefonnummer')} value={phone} onChangeText={value=>{setPhone(value);setStatus(null)}} autoComplete="tel" keyboardType="phone-pad" maxLength={30} editable={!busy}/>
   <Button icon="save-outline" title={t('حفظ معلوماتي','Save my details','Daten speichern')} disabled={busy} onPress={()=>void save()}/>
   {status&&<View accessibilityRole="alert"><Label>{status==='saved'?t('تم حفظ معلوماتك.','Your details were saved.'):status==='phone'?t('أدخل رقم هاتف من ٧ إلى ١٥ رقمًا.','Enter a phone number with 7 to 15 digits.'):t('تعذّر حفظ المعلومات. جرّب مرة أخرى.','Could not save the details. Try again.')}</Label></View>}
  </>}
 </Panel>;
}
