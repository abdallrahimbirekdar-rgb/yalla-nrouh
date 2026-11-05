import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {router} from 'expo-router';
import {useAuth} from '../auth';
import {useApp} from '../context';
import {cloudCurrentToken,cloudFareSettings,cloudUpdateFareSettings,cloudStaffDrivers,cloudApproveDriver,cloudAdminAddDriverByEmail,type StaffDriver} from '../cloud-api';
import {authErrorMessage} from '../auth-errors';
import {parseAmount,priceForRoute,type Tariff} from '../meter';
import {regions} from '../domain';
import {Button,Field,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
export default function Admin(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,dispatch}=useApp();const t=useText();const {colors}=useTheme();
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[drivers,setDrivers]=useState<StaffDriver[]>([]),[updated,setUpdated]=useState('');
 const [base,setBase]=useState(''),[perKm,setPerKm]=useState(''),[perMinute,setPerMinute]=useState(''),[peak,setPeak]=useState('');
 const [newDriverEmail,setNewDriverEmail]=useState('');
 const load=useCallback(async()=>{
  if(!userId||!auth.admin)return;setBusy(true);setNotice('');
  try{const token=await cloudCurrentToken();const [rates,accounts]=await Promise.all([cloudFareSettings(token),cloudStaffDrivers(token)]);setBase(String(rates.base));setPerKm(String(rates.perKm));setPerMinute(String(rates.perMinute));setPeak(String(rates.peakMultiplier??1));setDrivers(accounts);setUpdated(rates.updatedAt);setLoaded(true);dispatch({type:'tariff',tariff:rates})}
  catch(e){setNotice(authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}
 },[userId,auth.admin,dispatch,state.language]);
 useEffect(()=>{void load()},[load]);
 const amounts=[base,perKm,perMinute,peak].map(parseAmount);const valid=amounts.every(value=>value!==null)&&amounts[3]!>=1&&amounts[3]!<=10;
 const tariff:Tariff|null=valid?{base:amounts[0]!,perKm:amounts[1]!,perMinute:amounts[2]!,peakMultiplier:amounts[3]!,updatedAt:new Date().toISOString()}:null;
 const example=tariff?priceForRoute(5000,10,tariff):null;
 async function publish(){if(!tariff||busy)return;setBusy(true);setNotice('');try{const token=await cloudCurrentToken();await cloudUpdateFareSettings(token,tariff);const verified=await cloudFareSettings(token);dispatch({type:'tariff',tariff:verified});setUpdated(verified.updatedAt);setNotice(t('تم حفظ التسعيرة المشتركة بنجاح. ستُستخدم عند حساب الأجرة لجميع الحسابات.','Shared rates saved. They will be used for fare estimates for all accounts.'))}catch(e){setNotice(authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}}
 async function addDriverByEmail(){
  if(busy||!newDriverEmail.includes('@'))return;
  setBusy(true);setNotice('');
  try{
   const token=await cloudCurrentToken();
   const registered=await cloudAdminAddDriverByEmail(token,newDriverEmail,0,'classic');
   if(!registered){
    setNotice(t('الحساب غير موجود أو البريد لم يتم تأكيده بعد. أنشئ الحساب من صفحة التسجيل وأكّد البريد ثم أعد المحاولة.','Account not found or email unconfirmed. Sign up, verify the email, and retry.'));
    return;
   }
   setDrivers(await cloudStaffDrivers(token));
   setNewDriverEmail('');
   setNotice(t('أُضيف الحساب إلى قائمة السائقين. راجع بيانات السائق ثم اضغط «اعتماد السائق».','Account added to driver list. Review the driver, then approve.'));
  }catch(e){setNotice(authErrorMessage(e,state.language==='ar'))}
  finally{setBusy(false)}
 }
 async function approve(account:StaffDriver){if(busy)return;setBusy(true);setNotice('');try{const token=await cloudCurrentToken();const ok=await cloudApproveDriver(token,account.user_id,!account.approved);if(!ok)throw Error('not_allowed');setDrivers(await cloudStaffDrivers(token));setNotice(t('تم تحديث صلاحية السائق.','Driver access updated.'))}catch(e){setNotice(authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}}
 if(!auth.ready||auth.checkingAdmin)return <Page title={t('لوحة الإدارة','Administration')}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ التحقق من صلاحيات الحساب…','Checking account access…')}</Label></Page>;
 if(!auth.session)return <Page title={t('لوحة الإدارة','Administration')}><Panel><Icon name="shield-checkmark-outline" size={44}/><Label>{t('ادخل ببريد حساب الإدارة وكلمة المرور لفتح لوحة التحكم.','Sign in with the admin email and password to open this page.')}</Label><Button title={t('تسجيل دخول الإدارة','Admin sign in')} onPress={()=>router.replace({pathname:'/account',params:{next:'admin'}})}/></Panel></Page>;
 if(!auth.admin)return <Page title={t('لوحة الإدارة','Administration')}><Panel><Label>{t('هذا الحساب لا يملك صلاحية الإدارة.','This account does not have admin access.')}</Label><Label muted>{auth.session.user.email}</Label><Button title={t('الذهاب إلى حسابي','Go to my account')} onPress={()=>router.replace('/account')}/><Button secondary title={t('إعادة التحقق من الصلاحية','Check access again')} onPress={()=>void auth.retry()}/></Panel></Page>;
 return <Page title={t('لوحة الإدارة','Administration')} backTo="/account">
  <Panel><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Icon name="shield-checkmark-outline" size={36} color={colors.purple}/><View style={{flex:1}}><Label>{t('أهلًا بك في الإدارة','Welcome to administration')}</Label><Label muted>{auth.session.user.email}</Label></View></View><Button secondary icon="refresh-outline" title={t('تحديث بيانات الإدارة','Refresh admin data')} disabled={busy} onPress={()=>void load()}/></Panel>
  {!loaded?<Panel><Label>{t('جارٍ تحميل إعدادات المشروع.','Loading project settings.')}</Label>{busy&&<ActivityIndicator/>}</Panel>:<>
   <Panel><Label large>{t('تسعيرة الرحلات','Ride rates')}</Label><Label muted>{t('الأجرة = (فتح العداد + كم × سعر الكيلومتر + دقائق × سعر الدقيقة) × معامل الذروة','Fare = (base + km × km price + minutes × minute price) × peak factor')}</Label>
    <Field label={t('فتح العداد — ل.س','Starting fare — SYP')} value={base} onChangeText={setBase} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('سعر الكيلومتر — ل.س','Price per km — SYP')} value={perKm} onChangeText={setPerKm} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('سعر الدقيقة — ل.س','Price per minute — SYP')} value={perMinute} onChangeText={setPerMinute} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('معامل الذروة — ١ للسعر العادي','Peak factor — 1 for normal price')} value={peak} onChangeText={setPeak} keyboardType="decimal-pad" editable={!busy}/>
    {example!==null&&<View style={{padding:12,borderRadius:12,backgroundColor:colors.selected}}><Label>{t('مثال: رحلة ٥ كم و١٠ دقائق','Example: 5 km and 10 minutes')}</Label><Label large>{example} {t('ل.س','SYP')}</Label></View>}
    {!valid&&<Label>{t('أدخل أرقامًا صحيحة. معامل الذروة بين ١ و١٠.','Enter valid numbers. Peak factor must be from 1 to 10.')}</Label>}
    <Button icon="save-outline" title={busy?t('جارٍ الحفظ…','Saving…'):t('حفظ التسعيرة لجميع المستخدمين','Save rates for all users')} onPress={()=>void publish()} disabled={!valid||busy}/>
    {!!updated&&<Label muted>{t('آخر تحديث: ','Last update: ')}{new Date(updated).toLocaleString(state.language==='ar'?'ar':'en')}</Label>}
   </Panel>
   <Panel><Label large>{t('إضافة حساب سائق للتجربة','Add a test driver account')}</Label>
    <Label muted>{t('أنشئ الحساب من صفحة التسجيل أولًا ثم أكّد بريده الإلكتروني. لا نطلب كلمة المرور في لوحة الإدارة.','Create the account on the sign-up page and verify the email first. Admin never asks for the password.')}</Label>
    <Field label={t('البريد الإلكتروني للسائق','Driver email')} value={newDriverEmail} onChangeText={setNewDriverEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={200}/>
    <Label muted>{t('إعداد التجربة: دمشق · كلاسيك. اختر المنطقة والفئة نفسيهما عند طلب السيارة.','Test setup: Damascus · Classic. Choose the same region and car type when booking.')}</Label>
    <Button title={t('إضافة الحساب إلى السائقين','Add existing account as driver')} disabled={busy||!newDriverEmail.includes('@')} onPress={()=>void addDriverByEmail()}/>
   </Panel>
   <Panel><Label large>{t('طلبات السائقين','Driver accounts')}</Label><Label muted>{t('تحقق من هوية السائق وأوراق السيارة قبل اعتماده.','Check the driver and vehicle papers before approval.')}</Label>
    {drivers.length===0&&<Label muted>{t('لا توجد طلبات تسجيل سائق بعد.','No driver accounts yet.')}</Label>}
    {drivers.map(account=><View key={account.user_id} style={{gap:9,paddingVertical:10,borderTopWidth:1,borderColor:colors.line}}><Label>{regions[account.region]?.[state.language==='ar'?0:1]} · {account.category}</Label><Label muted>{account.user_id}</Label><Label>{account.approved?t('معتمد','Approved'):t('بانتظار المراجعة','Waiting for review')}</Label><Button secondary title={account.approved?t('تعليق السائق','Suspend driver'):t('اعتماد السائق','Approve driver')} disabled={busy} onPress={()=>void approve(account)}/></View>)}
   </Panel>
  </>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
 </Page>;
}
