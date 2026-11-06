import React,{useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {cloudAdminDispatchOverview,cloudCurrentToken,type DispatchOverview} from './cloud-api';
import {useApp} from './context';
import {Button,Label,Panel,useText,useTheme} from './ui';

export default function AdminDispatch(){
 const t=useText();const {state}=useApp();const {colors}=useTheme();
 const [data,setData]=useState<DispatchOverview|null>(null),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;
  setBusy(true);setFailed(false);
  void cloudCurrentToken().then(cloudAdminDispatchOverview).then(value=>{if(active)setData(value)})
   .catch(()=>{if(active)setFailed(true)}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[attempt]);
 const seconds=(from:string|null,to:string|null)=>from&&to?Math.max(0,Math.round((Date.parse(to)-Date.parse(from))/1000)):null;
 const tripStatus={requested:t('بانتظار سائق','Looking for a driver'),accepted:t('مقبولة','Accepted'),arrived:t('وصل السائق','Driver arrived'),riding:t('جارية','In progress'),completed:t('مكتملة','Completed'),cancelled:t('ملغاة','Cancelled')};
 const matrixStatus:Record<string,string>={queued:t('بانتظار ترتيب السائقين','Waiting for ranking'),running:t('جارٍ ترتيب السائقين','Ranking drivers'),ranked:t('مرتّبة بزمن القيادة','Ranked by driving time'),fallback:t('توزيع بحسب القرب','Distance fallback'),no_candidates:t('لا توجد مواقع حديثة لسائقين قريبين','No nearby drivers with recent locations')};
 return <Panel outlined>
  <Label large>{t('متابعة الرحلات','Dispatch monitor')}</Label>
  <Button secondary icon="refresh-outline" title={t('تحديث المتابعة','Refresh monitor')} disabled={busy} onPress={()=>setAttempt(n=>n+1)}/>
  {busy&&<ActivityIndicator color={colors.purple}/>}
  {failed&&<View accessibilityRole="alert"><Label>{t('تعذر تحديث متابعة الرحلات.','Could not refresh dispatch data.')}</Label></View>}
  {data&&<>
   <Label>{t('مشكلات حساب الطريق خلال ٢٤ ساعة: ','Routing problems in the last 24 hours: ')}{data.route_errors_24h}</Label>
   {data.rides.length===0&&<Label muted>{t('لا توجد طلبات مسجلة بعد.','No rides yet.')}</Label>}
   {data.rides.map(ride=>{
    const first=seconds(ride.started_at,ride.first_offer_at),accepted=seconds(ride.started_at,ride.accepted_at);
    return <View key={ride.id} style={{borderTopWidth:1,borderColor:colors.line,paddingVertical:8,gap:3}}>
     <Label>{ride.search_expired_at?t('انتهت مهلة البحث','Search expired'):tripStatus[ride.status]} · {ride.id.slice(0,8)}</Label>
     <Label muted>{new Date(ride.created_at).toLocaleString(state.language)} · {ride.category}</Label>
     {!!ride.matrix_state&&<Label muted>{matrixStatus[ride.matrix_state]}</Label>}
     {first!==null&&<Label muted>{t('ظهر في قائمة أول سائق بعد ','First sent to a driver inbox after ')}{first} {t('ث','s')}</Label>}
     {accepted!==null&&<Label muted>{t('قُبل الطلب بعد ','Accepted after ')}{accepted} {t('ث','s')}</Label>}
    </View>;
   })}
  </>}
 </Panel>;
}
