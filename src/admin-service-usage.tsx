import {useCallback,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {ActivityIndicator,Linking,View} from 'react-native';
import {cloudAdminServiceUsage,cloudCurrentToken} from './cloud-api';
import {useApp} from './context';
import {nextGoogleReset,quotaRemaining,serviceMetrics,type AdminServiceUsage} from './service-usage';
import {Button,Label,Panel,useText,useTheme} from './ui';

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
const refreshIntervalMs=60000;
export default function ServiceUsage(){
 const t=useText();const {state,foreground,connection}=useApp();
 const [data,setData]=useState<AdminServiceUsage|null>(null);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useFocusEffect(useCallback(()=>{
  if(!foreground||connection==='offline')return;
  let active=true;
  let timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh(){
   setBusy(true);
   try{
    const reading=await cloudAdminServiceUsage(await cloudCurrentToken());
    if(active){setData(reading);setFailed(false)}
   }catch{if(active)setFailed(true)}
   finally{
    if(active){setBusy(false);timer=setTimeout(()=>void refresh(),refreshIntervalMs)}
   }
  }
  void refresh();
  return()=>{active=false;clearTimeout(timer)};
 },[foreground,connection]));
 const now=new Date();
 const format=(value:number)=>new Intl.NumberFormat(state.language,{maximumFractionDigits:2}).format(value);
 const metrics=(group:keyof typeof serviceMetrics)=>serviceMetrics[group].map(metric=>
  <Label key={metric.id} muted>{t(metric.ar,metric.en)} · {format(metric.cap)} {metric.unit}</Label>);
 return <>
  <Panel outlined>
   <Label>{t('تتحدّث قياسات يلّا نروح كل دقيقة تلقائيًا أثناء فتح هذه الصفحة، وتُحدّث فور عودة الاتصال.','Yalla Nrouh metrics refresh every minute while this page is open, and immediately after reconnecting.')}</Label>
   {connection==='offline'?<Label muted>{t('بانتظار الاتصال. إذا ظهر قياس فهو آخر قراءة محفوظة على هذه الصفحة.','Waiting for a connection. Any values shown are the last reading on this page.')}</Label>:busy&&<ActivityIndicator/>}
   {failed&&<View accessibilityRole="alert"><Label>{t('تعذّر تحديث القياسات. سنحاول مجددًا تلقائيًا.','Could not refresh the readings. Retrying automatically.')}</Label></View>}
   {data&&<Label muted>{t('آخر قياس مباشر','Last live measurement')} · {new Date(data.checked_at).toLocaleString(state.language)}</Label>}
  </Panel>
  <Panel>
   <Label large>Supabase · {t('قاعدة البيانات والمصادقة','Database and Auth')}</Label>
   <Label>{t('يلّا نروح وسوق داريا مشروعان منفصلان ضمن نفس المؤسسة المجانية. يستخدمان خانتي المشاريع المتاحتين في الحساب. لكل مشروع قاعدة بيانات بحد ٥٠٠ MB. حصص النقل والتخزين والمستخدمين والدوال وRealtime مشتركة على مستوى المؤسسة.','Yalla Nrouh and Sooq Daraya are separate projects in the same Free organization. They use both free project slots. Each project has its own 500 MB database allowance. The egress, file storage, user, function and Realtime allowances are shared by the organization.')}</Label>
   <Label muted>{t('تحقّقت من الخطة والمشاريع في 2026-11-08. حجم قاعدة يلّا نروح يشمل حجم PostgreSQL ويُعرض بالتقريب.','Plan and projects checked on 2026-11-08. Yalla Nrouh’s PostgreSQL database size is approximate.')}</Label>
   {data&&<>
    <Label>{t('قاعدة بيانات يلّا نروح','Yalla Nrouh database')}</Label>
    <Quantity used={data.database_bytes/1000000} cap={500} unit="MB"/>
    <Label>{t('ملفات مشروع يلّا نروح في Supabase Storage','Yalla Nrouh files in Supabase Storage')} · {format(data.storage_bytes/1000000)} MB</Label>
    <Label>{t('حسابات يلّا نروح التي سجّلت الدخول خلال ٣٠ يومًا','Yalla Nrouh accounts with a sign-in in the last 30 days')} · {format(data.recent_sign_ins)}</Label>
   </>}
   <Label muted>{t('هذه القياسات لمشروع يلّا نروح. الاستهلاك المشترك وفاتورة المشروعين تظهر في لوحة مؤسسة Supabase.','These readings cover Yalla Nrouh. The Supabase organization dashboard shows shared usage and billing for both projects.')}</Label>
   <External title={t('استخدام مؤسسة Supabase','Supabase organization usage')} url={organization}/>
   <External title={t('حدود خطة Supabase الرسمية','Official Supabase plan limits')} url="https://supabase.com/docs/guides/platform/billing-on-supabase"/>
   <Label>{t('الحصص المرجعية المشتركة','Shared reference allowances')}</Label>
   {metrics('supabase')}
   <Label muted>{t('قد يوقف Supabase المشروع المجاني قليل النشاط بعد سبعة أيام. هذا منفصل عن استهلاك الحصص.','Supabase may pause a Free project after seven days of low activity, separately from quota usage.')}</Label>
   <Label muted>{t('خدمة البريد الافتراضية في Supabase محدودة برسالتين في الساعة وعناوين فريق المشروع. إذا استُخدم SMTP مخصص، تُراجع حصته لدى مزوّد البريد.','Supabase’s default SMTP is limited to two emails per hour and project team addresses. If custom SMTP is configured, check the email provider’s quota.')}</Label>
  </Panel>
  <Panel>
   <Label large>Google Maps Platform</Label>
   <Label muted>{t('الأرقام أدناه مرجع للتسعير العالمي حسب الاستخدام. الاستهلاك والمتبقي الفعليان يظهران في تقرير SKU في حساب الفوترة.','The figures below are global pay-as-you-go references. See the SKU report in your billing account for actual usage and remaining allowance.')}</Label>
   <External title={t('فتح فواتير Google Cloud','Open Google Cloud Billing')} url={googleBilling}/>
   <External title={t('حدود وأسعار Google الرسمية','Google pricing and limits')} url="https://developers.google.com/maps/billing-and-pricing/pricing"/>
   {metrics('google')}
   <Label muted>{t('تجديد حصص Google','Google quota renewal')} · {nextGoogleReset(now)} · {t('منتصف الليل بتوقيت المحيط الهادئ','midnight Pacific time')}</Label>
   <Label>{t('عداد حساب الطريق الداخلي في يلّا نروح','Yalla Nrouh internal route counter')}</Label>
   {data&&<>
    <Quantity used={data.proxy_calls_today} cap={100}/>
    <Label muted>{t('طلبات العداد خلال آخر ٣٠ يومًا حسب UTC','Proxy counter over the last 30 UTC dates')} · {format(data.proxy_calls_30_days)}</Label>
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
