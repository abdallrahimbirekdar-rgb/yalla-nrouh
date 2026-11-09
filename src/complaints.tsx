import {useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {cloudComplaints,cloudCurrentToken,cloudReviewComplaint,complaintPageSize,type ComplaintCategory,type RideComplaint} from './cloud-api';
import {useApp} from './context';
import {Button,Label,Panel,useText,useTheme} from './ui';

export const complaintCategories=[
 ['behavior','التصرّف أو السلامة','Conduct or safety','Verhalten oder Sicherheit'],
 ['fare','الأجرة','Fare','Fahrpreis'],
 ['vehicle','السيارة أو اللوحة','Vehicle or plate','Fahrzeug oder Kennzeichen'],
 ['app','مشكلة بالتطبيق','App issue','Problem mit der App'],
 ['other','سبب آخر','Other','Sonstiges'],
] as const satisfies readonly (readonly [ComplaintCategory,string,string,string])[];

export function ComplaintList({owner}:{owner?:string}){
 const t=useText();
 const {state:{language}}=useApp();
 const {colors}=useTheme();
 const [rows,setRows]=useState<RideComplaint[]>([]);
 const [offset,setOffset]=useState(0);
 const [more,setMore]=useState(false);
 const [loading,setLoading]=useState(true);
 const [failed,setFailed]=useState(false);
 const [reload,setReload]=useState(0);
 const [reviewing,setReviewing]=useState<string|null>(null);
 const [reviewFailed,setReviewFailed]=useState(false);

 useEffect(()=>{
  let active=true;
  setLoading(true);setFailed(false);
  void cloudCurrentToken().then(token=>cloudComplaints(token,owner,offset)).then(next=>{
   if(!active)return;
   setRows(previous=>offset===0?next:[...previous,...next.filter(row=>!previous.some(item=>item.id===row.id))]);
   setMore(next.length===complaintPageSize);
  }).catch(()=>{if(active)setFailed(true)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[owner,offset,reload]);

 function refresh(){
  setOffset(0);setReload(value=>value+1);
 }

 async function review(id:string){
  if(reviewing)return;
  setReviewing(id);setReviewFailed(false);
  try{
   if(!await cloudReviewComplaint(await cloudCurrentToken(),id))throw Error('missing_complaint');
   refresh();
  }catch{setReviewFailed(true)}finally{setReviewing(null)}
 }

 return <View style={{gap:8}}>
  <Button secondary icon="refresh-outline" title={t('تحديث الشكاوى','Refresh complaints','Beschwerden aktualisieren')} disabled={loading} onPress={refresh}/>
  {rows.map(row=>{
   const category=complaintCategories.find(item=>item[0]===row.category);
   return <Panel key={row.id} outlined>
    <Label large>{category?t(category[1],category[2],category[3]):row.category}</Label>
    <Label muted>{row.reviewed_at?t('تمت المراجعة','Reviewed','Geprüft'):t('بانتظار المراجعة','Waiting for review','Wartet auf Prüfung')} · {new Date(row.created_at).toLocaleString(language)}</Label>
    <Label muted>{t('رقم الشكوى','Complaint ID','Beschwerde-ID')} · {row.id.slice(0,8)}</Label>
    {row.ride_id&&<Label muted>{t('رقم الرحلة','Ride ID','Fahrt-ID')} · {owner?row.ride_id.slice(0,8):row.ride_id}</Label>}
    {!owner&&<Label muted>{t('معرّف الحساب','Account ID','Konto-ID')} · {row.reporter_id}</Label>}
    <Label>{row.detail}</Label>
    {!owner&&!row.reviewed_at&&<Button secondary icon="checkmark-circle-outline" title={t('تمت المراجعة','Mark reviewed','Als geprüft markieren')} disabled={!!reviewing||loading} onPress={()=>void review(row.id)}/>}
   </Panel>;
  })}
  {loading&&<ActivityIndicator color={colors.purple}/>}
  {failed&&<Label>{t('تعذّر تحميل الشكاوى. حاول تحديث القائمة.','Could not load complaints. Try refreshing the list.','Beschwerden konnten nicht geladen werden. Aktualisiere die Liste.')}</Label>}
  {reviewFailed&&<Label>{t('تعذّر حفظ المراجعة. أعد المحاولة.','Could not save the review. Try again.','Prüfung konnte nicht gespeichert werden. Versuche es erneut.')}</Label>}
  {!loading&&!failed&&!rows.length&&<Label muted>{t('ما في شكاوى لعرضها.','No complaints to show.','Keine Beschwerden vorhanden.')}</Label>}
  {!loading&&!failed&&more&&<Button secondary title={t('عرض المزيد','Show more','Mehr anzeigen')} onPress={()=>setOffset(value=>value+complaintPageSize)}/>}
 </View>;
}
