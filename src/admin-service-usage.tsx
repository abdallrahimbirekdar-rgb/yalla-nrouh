import {useEffect,useState} from 'react';
import {ActivityIndicator,Linking,View} from 'react-native';
import {cloudAdminServiceUsage,cloudCurrentToken,cloudRecordServiceUsage} from './cloud-api';
import {useApp} from './context';
import {parseAmount} from './meter';
import {nextGoogleReset,quotaRemaining,serviceMetrics,usageSnapshotExpired,validUsageDate,type AdminServiceUsage,type UsageMetric,type UsageSnapshot} from './service-usage';
import {Button,Field,Label,Panel,useText,useTheme} from './ui';

const organization='https://supabase.com/dashboard/org/jputmlhqnsyaxyvimord/usage';
const googleBilling='https://console.cloud.google.com/billing';
const githubActions='https://github.com/abdallrahimbirekdar-rgb/yalla-nrouh/actions';
function External({title,url}:{title:string;url:string}){
 return <Button secondary icon="open-outline" title={title} onPress={()=>void Linking.openURL(url).catch(()=>{})}/>;
}
function Quantity({used,cap,unit=''}:{used:number;cap:number;unit?:string}){
 const {state}=useApp();const {colors}=useTheme();const t=useText();
 const {remaining,ratio,state:level}=quotaRemaining(used,cap);
 const format=(value:number)=>new Intl.NumberFormat(state.language,{maximumFractionDigits:2}).format(value);
 const tone=level==='limit'?colors.error:level==='near'?colors.purple:colors.brandAccent;
 return <>
  <Label>{format(used)} / {format(cap)} {unit} · {t('المتبقي','Remaining')} {format(remaining)} {unit}</Label>
  <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:Math.round(ratio*100)}}
   style={{height:6,borderRadius:4,backgroundColor:colors.line,overflow:'hidden'}}>
   <View style={{width:`${ratio*100}%`,height:6,backgroundColor:tone}}/>
  </View>
  {level==='limit'&&<Label muted>{t('وصل إلى الحد أو تجاوزه.','Limit reached or exceeded.')}</Label>}
  {level==='near'&&<Label muted>{t('وصل الاستخدام إلى ٨٠٪ من الحد على الأقل.','Usage is at least 80% of the limit.')}</Label>}
 </>;
}
function Metric({metric,snapshot,now,onSaved}:{metric:UsageMetric;snapshot?:UsageSnapshot;now:Date;onSaved:()=>void}){
 const t=useText();const {state}=useApp();const {colors}=useTheme();
 const [editing,setEditing]=useState(false),[used,setUsed]=useState(''),[reset,setReset]=useState('');
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const expired=!!snapshot&&usageSnapshotExpired(metric,snapshot,now);
 const resetDate=metric.reset==='google'?nextGoogleReset(now):snapshot?.resets_on;
 const amount=parseAmount(used);
 async function save(){
  if(busy||amount===null||amount>1000000000000||(reset!==''&&!validUsageDate(reset)))return;
  setBusy(true);setFailed(false);
  try{
   const date=metric.reset==='google'?nextGoogleReset(now):metric.reset==='manual'?(reset||null):null;
   if(!await cloudRecordServiceUsage(await cloudCurrentToken(),metric.id,amount,date))throw Error('save');
   setEditing(false);onSaved();
  }catch{setFailed(true)}finally{setBusy(false)}
 }
 return <View style={{gap:6,paddingVertical:8,borderTopWidth:1,borderColor:colors.line}}>
  <Label>{t(metric.ar,metric.en)}</Label>
  {snapshot&&!expired?<Quantity used={snapshot.used} cap={metric.cap} unit={metric.unit}/>:<>
   <Label muted>{t('الحد المرجعي المجاني','Reference free cap')} · {new Intl.NumberFormat(state.language).format(metric.cap)} {metric.unit}</Label>
   <Label muted>{expired?t('قراءة من فترة سابقة. أدخل قراءة الفترة الحالية.','The reading is from a previous period. Enter the current usage.'):t('لم يُسجّل الاستخدام بعد.','Usage has not been recorded yet.')}</Label>
  </>}
  {!!resetDate&&<Label muted>{expired&&metric.reset==='manual'?t('تاريخ تجديد القراءة السابقة','Renewal date for the previous reading'):t('تجديد الحصة','Quota renewal')} · {resetDate}{metric.reset==='google'?t('، منتصف الليل بتوقيت المحيط الهادئ',' at midnight Pacific time'):''}</Label>}
  {snapshot&&<Label muted>{t('آخر قراءة يدوية','Last manual reading')} · {new Date(snapshot.recorded_at).toLocaleString(state.language)}</Label>}
  {editing?<>
   <Field label={t('الاستخدام الحالي من لوحة المزوّد','Current usage from provider console')+(metric.unit?' · '+metric.unit:'')} value={used} onChangeText={setUsed} keyboardType="decimal-pad" editable={!busy} maxLength={20}/>
   {metric.reset==='manual'&&<Field label={t('تاريخ التجديد إن ظهر في لوحة المزوّد','Renewal date if shown in provider console')} placeholder="YYYY-MM-DD" value={reset} onChangeText={setReset} editable={!busy} maxLength={10}/>}
   <Button title={t('حفظ القراءة','Save reading')} disabled={busy||amount===null||amount>1000000000000||(reset!==''&&!validUsageDate(reset))} onPress={()=>void save()}/>
   <Button secondary title={t('إلغاء','Cancel')} disabled={busy} onPress={()=>setEditing(false)}/>
   {failed&&<View accessibilityRole="alert"><Label>{t('تعذّر حفظ القراءة.','Could not save the reading.')}</Label></View>}
  </>:<Button secondary title={t('إدخال الاستخدام','Enter usage')} onPress={()=>{setUsed(snapshot&&!expired?String(snapshot.used):'');setReset(resetDate&&!expired&&metric.reset==='manual'?resetDate:'');setFailed(false);setEditing(true)}}/>}
 </View>;
}

export default function ServiceUsage(){
 const t=useText();const {state}=useApp();
 const [data,setData]=useState<AdminServiceUsage|null>(null),[attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;setBusy(true);setFailed(false);
  void cloudCurrentToken().then(cloudAdminServiceUsage).then(value=>{if(active)setData(value)})
   .catch(()=>{if(active)setFailed(true)}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[attempt]);
 const refresh=()=>setAttempt(value=>value+1);
 const now=new Date();
 const metrics=(group:keyof typeof serviceMetrics)=>serviceMetrics[group].map(metric=>
  <Metric key={metric.id} metric={metric} now={now} snapshot={data?.snapshots[metric.id]} onSaved={refresh}/>);
 return <>
  <Panel outlined>
   <Label>{t('تُقاس قاعدة بيانات يلّا نروح وطلبات المسار الداخلية تلقائيًا. بقية قراءات الاستخدام تدخلها من لوحات المزوّدين.','Yalla Nrouh database size and the internal route counter are measured automatically. Enter other readings from the provider consoles.')}</Label>
   <Button secondary icon="refresh-outline" title={t('تحديث القياسات','Refresh readings')} disabled={busy} onPress={refresh}/>
   {busy&&<ActivityIndicator/>}
   {failed&&<View accessibilityRole="alert"><Label>{t('تعذّر تحديث القياسات.','Could not refresh the readings.')}</Label></View>}
   {data&&<Label muted>{t('آخر قياس مباشر','Last live measurement')} · {new Date(data.checked_at).toLocaleString(state.language)}</Label>}
  </Panel>
  <Panel>
   <Label large>Supabase · {t('قاعدة البيانات والمصادقة','Database and Auth')}</Label>
   <Label>{t('يلّا نروح وسوق داريا مشروعان منفصلان ضمن نفس المؤسسة المجانية. يستخدمان خانتي المشاريع المتاحتين في الحساب. لكل مشروع قاعدة بيانات بحد ٥٠٠ MB. حصص النقل والتخزين والمستخدمين والدوال وRealtime مشتركة على مستوى المؤسسة.','Yalla Nrouh and Sooq Daraya are separate projects in the same Free organization. They use both free project slots. Each project has its own 500 MB database allowance. The egress, file storage, user, function and Realtime allowances are shared by the organization.')}</Label>
   <Label muted>{t('تحقّقت من الخطة والمشاريع في 2026-11-08. حجم قاعدة يلّا نروح يشمل حجم PostgreSQL ويُعرض بالتقريب.','Plan and projects checked on 2026-11-08. Yalla Nrouh’s PostgreSQL database size is approximate.')}</Label>
   {data&&<Quantity used={data.database_bytes/1000000} cap={500} unit="MB"/>}
   <External title={t('استخدام مؤسسة Supabase','Supabase organization usage')} url={organization}/>
   <External title={t('حدود خطة Supabase الرسمية','Official Supabase plan limits')} url="https://supabase.com/docs/guides/platform/billing-on-supabase"/>
   {metrics('supabase')}
   <Label muted>{t('قد يوقف Supabase المشروع المجاني قليل النشاط بعد سبعة أيام. هذا منفصل عن استهلاك الحصص.','Supabase may pause a Free project after seven days of low activity, separately from quota usage.')}</Label>
   <Label muted>{t('خدمة البريد الافتراضية في Supabase محدودة برسالتين في الساعة وعناوين فريق المشروع. إذا استُخدم SMTP مخصص، تُراجع حصته لدى مزوّد البريد.','Supabase’s default SMTP is limited to two emails per hour and project team addresses. If custom SMTP is configured, check the email provider’s quota.')}</Label>
  </Panel>
  <Panel>
   <Label large>Google Maps Platform</Label>
   <Label muted>{t('الأرقام أدناه مرجع للتسعير العالمي حسب الاستخدام. أدخل الاستخدام القابل للفوترة من تقرير SKU في حساب الفوترة، بما يشمل المشاريع المرتبطة به عند الاقتضاء.','The figures below are global pay-as-you-go references. Enter billable usage from the SKU report for your billing account, including other linked projects when applicable.')}</Label>
   <External title={t('فتح فواتير Google Cloud','Open Google Cloud Billing')} url={googleBilling}/>
   <External title={t('حدود وأسعار Google الرسمية','Google pricing and limits')} url="https://developers.google.com/maps/billing-and-pricing/pricing"/>
   {metrics('google')}
   <Label>{t('عداد حساب الطريق الداخلي في يلّا نروح','Yalla Nrouh internal route counter')}</Label>
   {data&&<>
    <Quantity used={data.proxy_calls_today} cap={100}/>
    <Label muted>{t('يتجدّد','Resets')} · {new Date(data.proxy_resets_at).toLocaleString(state.language)}</Label>
   </>}
   <Label muted>{t('هذا عداد يومي للخدمة داخل التطبيق. يستثني طلبات الإدارة ومصفوفة توزيع السائقين. تعرّف الفاتورة الاستخدام الفعلي لدى Google.','This is the app’s daily proxy counter. It excludes admin calls and driver-dispatch matrix calls. Check Google Billing for actual usage.')}</Label>
  </Panel>
  <Panel>
   <Label large>GitHub Pages &amp; Actions</Label>
   <Label muted>{t('استضافة الموقع ونشره وبناء Android. التشغيل العادي في المستودع العام مجاني على مشغّلات GitHub القياسية. حدّ الموقع المنشور ١ GB.','Website hosting, deployment and Android builds. Standard GitHub-hosted runners are free for public repositories. Published site size is limited to 1 GB.')}</Label>
   {metrics('github')}
   <External title={t('حدود GitHub Pages الرسمية','Official GitHub Pages limits')} url="https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits"/>
   <External title={t('سجل النشر والبناء','Deployments and builds')} url={githubActions}/>
  </Panel>
  <Panel>
   <Label large>{t('الإشعارات والملاحة والنشر','Notifications, navigation and distribution')}</Label>
   <Label>Firebase Cloud Messaging · {t('إشعارات الدفع عند إعداده. الخدمة دون تكلفة، مع حدود لمعدل الإرسال.','Push notifications when configured. FCM has no usage charge and has sending rate limits.')}</Label>
   <External title={t('حصص إشعارات Firebase','Firebase messaging quotas')} url="https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas"/>
   <Label>OsmAnd · {t('تطبيق ملاحة خارجي. تحميل الخرائط يعتمد على نسخة OsmAnd المثبتة لدى السائق.','External navigation app. Map downloads depend on the OsmAnd version installed by the driver.')}</Label>
   <Label>Google Play Console · {t('حساب نشر أندرويد. رسم تسجيل المطوّر مرة واحدة، ولا توجد حصة شهرية تتجدّد لهذا الرسم.','Android distribution. A one-time developer registration fee applies.')}</Label>
   <External title={t('فتح Google Play Console','Open Google Play Console')} url="https://play.google.com/console"/>
  </Panel>
 </>;
}
