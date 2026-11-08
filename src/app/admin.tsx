import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useAuth} from '../auth';
import {useApp} from '../context';
import {cloudCurrentToken,cloudFareSettings,cloudUpdateFareSettings,cloudStaffDrivers,cloudApproveDriver,cloudAdminAddDriverByEmail,type StaffDriver} from '../cloud-api';
import AdminRulesGuide from '../admin-rules-guide';
import AdminDriverPhone from '../admin-driver-phone';
import AdminDispatch from '../admin-dispatch';
import ServiceUsage from '../admin-service-usage';
import {authErrorMessage} from '../auth-errors';
import {parseAmount,priceForRoute,type Tariff} from '../meter';
import {regions} from '../domain';
import {Button,Field,Icon,Label,Page,Panel,useText,useTheme,type IconName} from '../ui';
export default function Admin(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,dispatch}=useApp();const t=useText();const {colors}=useTheme();
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[drivers,setDrivers]=useState<StaffDriver[]>([]),[updated,setUpdated]=useState('');
 const [base,setBase]=useState(''),[perKm,setPerKm]=useState(''),[perMinute,setPerMinute]=useState(''),[peak,setPeak]=useState('');
 const [newDriverEmail,setNewDriverEmail]=useState('');
 const {section}=useLocalSearchParams<{section?:string}>();
 const showSection=(next:string)=>router.setParams({section:next});
 const load=useCallback(async()=>{
  if(!userId||!auth.admin)return;setBusy(true);setNotice('');
  try{const token=await cloudCurrentToken();const [rates,accounts]=await Promise.all([cloudFareSettings(token),cloudStaffDrivers(token)]);setBase(String(rates.base));setPerKm(String(rates.perKm));setPerMinute(String(rates.perMinute));setPeak(String(rates.peakMultiplier??1));setDrivers(accounts);setUpdated(rates.updatedAt);setLoaded(true);dispatch({type:'tariff',tariff:rates})}
  catch(e){setNotice(authErrorMessage(e,state.language))}finally{setBusy(false)}
 },[userId,auth.admin,dispatch,state.language]);
 useEffect(()=>{void load()},[load]);
 const amounts=[base,perKm,perMinute,peak].map(parseAmount);const valid=amounts.every(value=>value!==null)&&amounts[3]!>=1&&amounts[3]!<=10;
 const tariff:Tariff|null=valid?{base:amounts[0]!,perKm:amounts[1]!,perMinute:amounts[2]!,peakMultiplier:amounts[3]!,updatedAt:new Date().toISOString()}:null;
 const example=tariff?priceForRoute(5000,10,tariff):null;
 async function publish(){if(!tariff||busy)return;setBusy(true);setNotice('');try{const token=await cloudCurrentToken();await cloudUpdateFareSettings(token,tariff);const verified=await cloudFareSettings(token);dispatch({type:'tariff',tariff:verified});setUpdated(verified.updatedAt);setNotice(t('تم حفظ التسعيرة المشتركة بنجاح. ستُستخدم عند حساب الأجرة لجميع الحسابات.','Shared rates saved. They will be used for fare estimates for all accounts.'))}catch(e){setNotice(authErrorMessage(e,state.language))}finally{setBusy(false)}}
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
  }catch(e){setNotice(authErrorMessage(e,state.language))}
  finally{setBusy(false)}
 }
 async function approve(account:StaffDriver){if(busy)return;setBusy(true);setNotice('');try{const token=await cloudCurrentToken();const ok=await cloudApproveDriver(token,account.user_id,!account.approved);if(!ok)throw Error('not_allowed');setDrivers(await cloudStaffDrivers(token));setNotice(t('تم تحديث صلاحية السائق.','Driver access updated.'))}catch(e){setNotice(authErrorMessage(e,state.language))}finally{setBusy(false)}}
 if(!auth.ready||auth.checkingAdmin)return <Page title={t('لوحة الإدارة','Administration')}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ التحقق من صلاحيات الحساب…','Checking account access…')}</Label></Page>;
 if(!auth.session)return <Page title={t('لوحة الإدارة','Administration')}><Panel><Icon name="shield-checkmark-outline" size={44}/><Label>{t('ادخل ببريد حساب الإدارة وكلمة المرور لفتح لوحة التحكم.','Sign in with the admin email and password to open this page.')}</Label><Button title={t('تسجيل دخول الإدارة','Admin sign in')} onPress={()=>router.replace({pathname:'/account',params:{next:'admin'}})}/></Panel></Page>;
 if(!auth.admin)return <Page title={t('لوحة الإدارة','Administration')}><Panel><Label>{t('هذا الحساب لا يملك صلاحية الإدارة.','This account does not have admin access.')}</Label><Label muted>{auth.session.user.email}</Label><Button title={t('الذهاب إلى حسابي','Go to my account')} onPress={()=>router.replace('/account')}/><Button secondary title={t('إعادة التحقق من الصلاحية','Check access again')} onPress={()=>void auth.retry()}/></Panel></Page>;

 const pendingDrivers=drivers.filter(account=>!account.approved).length;
 const approvedDrivers=drivers.length-pendingDrivers;
 const sectionTitles:Record<string,string>={
  home:t('لوحة الإدارة','Administration'),
  drivers:t('إدارة السائقين','Driver management'),
  'driver-create':t('إضافة سائق برقم الهاتف','Add driver by phone'),
  'driver-email':t('ربط حساب سائق بالبريد','Link driver by email'),
  pricing:t('تسعيرة الرحلات','Ride pricing'),
  monitor:t('متابعة الرحلات والطلبات','Ride and dispatch monitor'),
  services:t('الخدمات وحدود الاستخدام','Services and usage'),
  guide:t('دليل الإدارة','Administration guide'),
 };
 const activeSection=section&&sectionTitles[section]?section:'home';
 const isDriverSubpage=activeSection==='driver-create'||activeSection==='driver-email';
 return <Page key={activeSection} title={sectionTitles[activeSection]} backTo="/account">
  {activeSection==='home'?<>
   <Panel>
    <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:12}}>
     <View style={{padding:10,borderRadius:14,backgroundColor:colors.selected}}><Icon name="shield-checkmark-outline" size={28} color={colors.purple}/></View>
     <View style={{flex:1,gap:2}}><Label large>{t('مركز الإدارة','Administration center')}</Label><Label muted>{auth.session.user.email}</Label></View>
    </View>
    <Label muted>{t('كل أداة في قسمها. اختر القسم الذي تريد إدارته دون التنقل في صفحة طويلة.','Each tool has its own section. Choose what you want to manage without scrolling through a long page.')}</Label>
    <Button secondary icon="refresh-outline" title={t('تحديث بيانات الإدارة','Refresh admin data')} disabled={busy} onPress={()=>void load()}/>
   </Panel>
   <Panel>
    <Label large>{t('ملخص السائقين','Driver summary')}</Label>
    {!loaded?<ActivityIndicator color={colors.purple}/>:<View style={{flexDirection:state.language==='ar'?'row-reverse':'row',flexWrap:'wrap',gap:12}}>
     <View style={{flexGrow:1,flexBasis:120,gap:2}}><Label muted>{t('بانتظار المراجعة','Waiting for review')}</Label><Label large>{pendingDrivers}</Label></View>
     <View style={{flexGrow:1,flexBasis:120,gap:2}}><Label muted>{t('سائقون معتمدون','Approved drivers')}</Label><Label large>{approvedDrivers}</Label></View>
     <View style={{flexGrow:1,flexBasis:120,gap:2}}><Label muted>{t('إجمالي الحسابات','Total accounts')}</Label><Label large>{drivers.length}</Label></View>
    </View>}
   </Panel>
   <View style={{gap:5}}>
    <Label large>{t('أقسام لوحة الإدارة','Administration sections')}</Label>
    <Label muted>{t('اختر القسم لعرض أدواته وإعداداته.','Open a section to see its tools and settings.')}</Label>
   </View>
   <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',flexWrap:'wrap',gap:12}}>
    <AdminSectionCard icon="people-outline" title={t('السائقون','Drivers')} subtitle={t('الحسابات، إضافة سائق، الاعتماد والتعليق','Accounts, new drivers, approvals and suspension')} detail={loaded?pendingDrivers>0?t('بانتظار المراجعة: ','Pending: ')+pendingDrivers:t('جميع الطلبات مراجعة','No pending approvals'):undefined} onPress={()=>showSection('drivers')}/>
    <AdminSectionCard icon="car-sport-outline" title={t('الرحلات والطلبات','Rides and requests')} subtitle={t('متابعة الطلبات وأداء توزيع الرحلات','Track rides and dispatch performance')} onPress={()=>showSection('monitor')}/>
    <AdminSectionCard icon="cash-outline" title={t('التسعيرة','Pricing')} subtitle={t('فتح العداد، سعر الكيلومتر والدقيقة والذروة','Base fare, distance, time and peak rate')} onPress={()=>showSection('pricing')}/>
    <AdminSectionCard icon="server-outline" title={t('الخدمات والاستخدام','Services and usage')} subtitle={t('الخدمات وحدود الخطة ومعلومات الاستهلاك','Services, plan limits and usage information')} onPress={()=>showSection('services')}/>
    <AdminSectionCard icon="book-outline" title={t('دليل الإدارة','Admin guide')} subtitle={t('قواعد عمل التطبيق وسجل التعديلات','App rules and their revision history')} onPress={()=>showSection('guide')}/>
   </View>
   <Button icon="person-add-outline" title={t('إضافة سائق جديد برقم الهاتف','Add a new driver by phone')} onPress={()=>showSection('driver-create')}/>
  </>:<>
   <View style={{gap:8}}>
    <Button secondary icon="arrow-back-outline" title={isDriverSubpage?t('العودة إلى إدارة السائقين','Back to driver management'):t('العودة لأقسام الإدارة','Back to administration sections')} onPress={()=>showSection(isDriverSubpage?'drivers':'home')}/>
   </View>
   {activeSection==='drivers'&&<>
    <Panel>
     <Label large>{t('إدارة حسابات السائقين','Manage driver accounts')}</Label>
     <Label muted>{t('أنشئ حسابًا برقم الموبايل وكلمة المرور التي تختارها، أو اربط حسابًا موجودًا. راجع بيانات السائق والسيارة قبل الاعتماد.','Create a phone account with a password you choose, or link an existing account. Review driver and vehicle details before approval.')}</Label>
     <Button icon="person-add-outline" title={t('إضافة سائق برقم الموبايل','Add driver by mobile number')} onPress={()=>showSection('driver-create')}/>
     <Button secondary icon="mail-outline" title={t('ربط حساب مسجل بالبريد','Link an existing email account')} onPress={()=>showSection('driver-email')}/>
     <Button secondary icon="refresh-outline" title={t('تحديث قائمة السائقين','Refresh driver list')} disabled={busy} onPress={()=>void load()}/>
    </Panel>
    {!loaded?<Panel><Label>{t('جارٍ تحميل حسابات السائقين…','Loading driver accounts…')}</Label><ActivityIndicator color={colors.purple}/></Panel>:<Panel>
     <Label large>{t('حسابات السائقين','Driver accounts')}</Label>
     <Label muted>{t('الإجمالي: ','Total: ')}{drivers.length} · {t('بانتظار المراجعة: ','Pending: ')}{pendingDrivers}</Label>
     {drivers.length===0&&<Label muted>{t('لا توجد حسابات سائقين بعد.','No driver accounts yet.')}</Label>}
     {drivers.map(account=><View key={account.user_id} style={{gap:8,paddingVertical:12,borderTopWidth:1,borderColor:colors.line}}>
      <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
       <View style={{flex:1}}><Label>{regions[account.region]?.[state.language==='ar'?0:1]} · {account.category}</Label></View>
       <Icon name={account.approved?'checkmark-circle-outline':'time-outline'} color={account.approved?colors.brandAccent:colors.purple}/>
      </View>
      <Label>{account.approved?t('معتمد','Approved'):t('بانتظار المراجعة','Waiting for review')}</Label>
      <Label muted>{account.user_id}</Label>
      <Button secondary title={account.approved?t('تعليق السائق','Suspend driver'):t('اعتماد السائق','Approve driver')} disabled={busy} onPress={()=>void approve(account)}/>
     </View>)}
    </Panel>}
   </>}
   {activeSection==='driver-create'&&<>
    <AdminDriverPhone key={userId} onCreated={()=>void load()}/>
    <Button secondary icon="people-outline" title={t('عرض قائمة السائقين','Show driver accounts')} onPress={()=>showSection('drivers')}/>
   </>}
   {activeSection==='driver-email'&&<Panel>
    <Label large>{t('ربط حساب سائق موجود بالبريد','Link an existing driver by email')}</Label>
    <Label muted>{t('أنشئ الحساب من صفحة التسجيل أولًا ثم أكّد بريده الإلكتروني. لا نطلب كلمة المرور في لوحة الإدارة.','Create the account on the sign-up page and verify the email first. Admin never asks for the password.')}</Label>
    <Field label={t('البريد الإلكتروني للسائق','Driver email')} value={newDriverEmail} onChangeText={setNewDriverEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={200}/>
    <Label muted>{t('إعداد التجربة: دمشق · كلاسيك. للتجربة اختر انطلاقًا في دمشق وفئة كلاسيك.','Test setup: Damascus · Classic. For a test ride, choose a pickup in Damascus and the Classic category.')}</Label>
    <Button title={t('إضافة الحساب إلى السائقين','Add existing account as driver')} disabled={busy||!newDriverEmail.includes('@')} onPress={()=>void addDriverByEmail()}/>
    <Button secondary title={t('العودة إلى السائقين','Back to drivers')} onPress={()=>showSection('drivers')}/>
   </Panel>}
   {activeSection==='pricing'&&(!loaded?<Panel><Label>{t('جارٍ تحميل التسعيرة…','Loading ride rates…')}</Label><ActivityIndicator color={colors.purple}/></Panel>:<Panel>
    <Label large>{t('تسعيرة الرحلات','Ride rates')}</Label>
    <Label muted>{t('الأجرة = (فتح العداد + كم × سعر الكيلومتر + دقائق × سعر الدقيقة) × معامل الذروة','Fare = (base + km × km price + minutes × minute price) × peak factor')}</Label>
    <Field label={t('فتح العداد — ل.س','Starting fare — SYP')} value={base} onChangeText={setBase} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('سعر الكيلومتر — ل.س','Price per km — SYP')} value={perKm} onChangeText={setPerKm} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('سعر الدقيقة — ل.س','Price per minute — SYP')} value={perMinute} onChangeText={setPerMinute} keyboardType="decimal-pad" editable={!busy}/>
    <Field label={t('معامل الذروة — ١ للسعر العادي','Peak factor — 1 for normal price')} value={peak} onChangeText={setPeak} keyboardType="decimal-pad" editable={!busy}/>
    {example!==null&&<View style={{padding:12,borderRadius:12,backgroundColor:colors.selected}}><Label>{t('مثال: رحلة ٥ كم و١٠ دقائق','Example: 5 km and 10 minutes')}</Label><Label large>{example} {t('ل.س','SYP')}</Label></View>}
    {!valid&&<Label>{t('أدخل أرقامًا صحيحة. معامل الذروة بين ١ و١٠.','Enter valid numbers. Peak factor must be from 1 to 10.')}</Label>}
    <Button icon="save-outline" title={busy?t('جارٍ الحفظ…','Saving…'):t('حفظ التسعيرة لجميع المستخدمين','Save rates for all users')} onPress={()=>void publish()} disabled={!valid||busy}/>
    {!!updated&&<Label muted>{t('آخر تحديث: ','Last update: ')}{new Date(updated).toLocaleString(state.language)}</Label>}
   </Panel>)}
   {activeSection==='monitor'&&<AdminDispatch key={userId}/>}
   {activeSection==='services'&&<ServiceUsage key={userId}/>}
   {activeSection==='guide'&&<AdminRulesGuide key={userId}/>}
  </>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
 </Page>;
}

function AdminSectionCard({icon,title,subtitle,detail,onPress}:{icon:IconName;title:string;subtitle:string;detail?:string;onPress:()=>void}){
 const {colors}=useTheme();const {state}=useApp();
 const rtl=state.language==='ar';
 return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({pressed})=>({
  flexGrow:1,flexBasis:240,minWidth:230,minHeight:154,padding:16,borderRadius:18,
  borderWidth:1,borderColor:pressed?colors.purple:colors.line,backgroundColor:pressed?colors.selected:colors.surface,
  gap:9,justifyContent:'flex-start',
 })}>
  <View style={{flexDirection:rtl?'row-reverse':'row',justifyContent:'space-between',alignItems:'center'}}>
   <View style={{padding:9,borderRadius:12,backgroundColor:colors.selected}}><Icon name={icon} size={24} color={colors.purple}/></View>
   <Icon name={rtl?'chevron-back':'chevron-forward'} size={20} color={colors.muted}/>
  </View>
  <Label large>{title}</Label>
  <Label muted>{subtitle}</Label>
  {!!detail&&<Label>{detail}</Label>}
 </Pressable>;
}
