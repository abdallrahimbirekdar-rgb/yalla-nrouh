import {useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {authClient} from './auth-client';
import {syrianMobile} from './syrian-phone';
import {useApp} from './context';
import {brandHeader} from './theme';
import {Button,Field,Icon,Label,Panel,useText} from './ui';

export default function AccountProfile({userId,identity,role}:{userId:string;identity:string;role:string}){
 const t=useText();
 const {state:{language}}=useApp();
 const rtl=language==='ar';
 const [expanded,setExpanded]=useState(false);
 const [profile,setProfile]=useState({name:'',phone:''});
 const editLabel=expanded?t('طيّ معلومات الحساب','Collapse profile','Profildaten einklappen'):t('تعديل معلومات الحساب','Edit profile','Profil bearbeiten');
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
    const saved={name:data?.full_name??'',phone:data?.phone??''};
    setProfile(saved);setName(saved.name);setPhone(saved.phone);
   }catch{if(!controller.signal.aborted)setStatus('load')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  }
  void load();
  return()=>controller.abort();
 },[userId,attempt]);
 async function save(){
  const normalized=phone.trim()?syrianMobile(phone):'';
  if(normalized===null){setStatus('phone');return}
  setBusy(true);setStatus(null);
  try{
   const {error}=await authClient().from('account_profiles').upsert({user_id:userId,full_name:name.trim(),phone:normalized});
   if(error)throw error;
   setProfile({name:name.trim(),phone:normalized});setName(name.trim());setPhone(normalized);setStatus('saved');
  }catch{setStatus('save')}finally{setBusy(false)}
 }
 return <View style={{gap:12}}>
  <View style={{borderRadius:25,backgroundColor:'#0c4080',padding:16,gap:14}}>
   <View style={{flexDirection:rtl?'row-reverse':'row',alignItems:'center',gap:11}}>
    <View style={{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:brandHeader.accent,
     backgroundColor:brandHeader.background,alignItems:'center',justifyContent:'center'}}>
     <Icon name="person-outline" size={27} color={brandHeader.accent}/>
    </View>
    <View style={{flex:1,minWidth:0,gap:3}}>
     <Text style={{textAlign:rtl?'right':'left',fontSize:13,color:'#c1e3ff'}}>{role}</Text>
     <Text numberOfLines={2} style={{textAlign:rtl?'right':'left',fontSize:19,fontWeight:'700',color:'#fff'}}>
      {profile.name||t('حسابي','My account','Mein Konto')}
     </Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={editLabel} accessibilityState={{expanded}}
     onPress={()=>setExpanded(value=>!value)} style={({pressed})=>({height:44,width:44,borderRadius:22,
      alignItems:'center',justifyContent:'center',backgroundColor:pressed?'#305889':brandHeader.control})}>
     <Icon name={expanded?'chevron-up':'pencil-outline'} color="#fff" size={20}/>
    </Pressable>
   </View>
   {!!(profile.phone||identity)&&<Text selectable style={{alignSelf:rtl?'flex-end':'flex-start',
    maxWidth:'100%',writingDirection:'ltr',color:'#e1efff',fontSize:14,lineHeight:21}}>{profile.phone||identity}</Text>}
  </View>
  {expanded&&<Panel>
  <Label large>{t('معلوماتي الشخصية','My personal information','Meine persönlichen Daten')}</Label>
  <Label muted>{t('يمكنك حفظ اسمك ورقم هاتفك أو إفراغهما وحفظ التغييرات. هذه الحقول اختيارية. رقم الهاتف يُستخدم للاتصال العادي بين طرفي الرحلة النشطة بعد قبولها.','You can save, edit or clear your name and phone. These fields are optional. Your number enables regular phone calls between the two parties after accepting an active ride.','Name und Telefonnummer sind freiwillig. Die Nummer ermöglicht normale Telefonanrufe zwischen beiden Beteiligten nach Annahme einer laufenden Fahrt.')}</Label>
  {loading?<ActivityIndicator/>:status==='load'?<>
   <Label>{t('تعذّر تحميل معلوماتك.','Could not load your details.')}</Label>
   <Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>{setStatus(null);setLoading(true);setAttempt(value=>value+1)}}/>
  </>:<>
   <Field label={t('الاسم الكامل','Full name','Vollständiger Name')} value={name} onChangeText={value=>{setName(value);setStatus(null)}} autoComplete="name" maxLength={80} editable={!busy}/>
   <Field label={t('رقم الموبايل السوري (+963)','Syrian mobile number (+963)','Syrische Mobilnummer (+963)')} placeholder="09XXXXXXXX" value={phone} onChangeText={value=>{setPhone(value);setStatus(null)}} autoComplete="tel" keyboardType="phone-pad" maxLength={30} editable={!busy}/>
   <Button icon="save-outline" title={t('حفظ معلوماتي','Save my details','Daten speichern')} disabled={busy} onPress={()=>void save()}/>
   {status&&<View accessibilityRole="alert"><Label>{status==='saved'?t('تم حفظ معلوماتك.','Your details were saved.'):status==='phone'?t('أدخل رقم موبايل سوري يبدأ بـ 09 أو +9639.','Enter a Syrian mobile number starting with 09 or +9639.','Gib eine syrische Mobilnummer mit 09 oder +9639 ein.'):t('تعذّر حفظ المعلومات. جرّب مرة أخرى.','Could not save the details. Try again.')}</Label></View>}
  </>}
  </Panel>}
 </View>;
}
