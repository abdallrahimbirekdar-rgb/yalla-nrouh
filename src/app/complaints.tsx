import {useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useAuth} from '../auth';
import {useApp} from '../context';
import {CloudError,cloudCurrentToken,cloudMutationUncertain,cloudSubmitComplaint,type ComplaintCategory} from '../cloud-api';
import {ComplaintList,complaintCategories} from '../complaints';
import {newRideRequestId} from '../use-ride-recovery';
import {Button,Field,Label,Page,Panel,useText,useTheme} from '../ui';

export default function Complaints(){
 const auth=useAuth();
 const t=useText();
 const {ride}=useLocalSearchParams<{ride?:string}>();
 const owner=auth.session?.user.id;
 const title=t('الشكاوى','Complaints','Beschwerden');
 const rideId=typeof ride==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ride)?ride:null;
 return <Page simpleHeader title={title} backTo={rideId?'/cloud':'/account'}>
  {owner?<ComplaintForm key={owner+':'+(rideId??'general')} owner={owner} rideId={rideId}/>
   :<Panel>
    <Label>{auth.ready?t('سجّل دخولك لتقديم شكوى ومتابعتها.','Sign in to submit and track a complaint.','Melde dich an, um eine Beschwerde einzureichen und zu verfolgen.'):t('جارٍ تحميل الحساب…','Loading account…','Konto wird geladen …')}</Label>
    {auth.ready&&<Button title={t('تسجيل الدخول','Sign in','Anmelden')} onPress={()=>router.push({pathname:'/account',params:{next:'complaints'}})}/>}
   </Panel>}
 </Page>;
}

function ComplaintForm({owner,rideId}:{owner:string;rideId:string|null}){
 const t=useText();
 const {colors}=useTheme();
 const {connection,state:{language}}=useApp();
 const [category,setCategory]=useState<ComplaintCategory>('other');
 const [detail,setDetail]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [revision,setRevision]=useState(0);
 const request=useRef<string|null>(null);
 const inFlight=useRef(false);
 const locked=busy||!!request.current;

 async function submit(){
  if(inFlight.current||detail.trim().length<10||connection==='offline')return;
  inFlight.current=true;
  setBusy(true);setMessage('');
  try{
   const token=await cloudCurrentToken();
   request.current??=newRideRequestId();
   const id=await cloudSubmitComplaint(token,request.current,rideId,category,detail.trim());
   if(typeof id!=='string'||!id)throw new CloudError(500,'bad_response');
   request.current=null;
   setDetail('');setCategory('other');setRevision(value=>value+1);
   setMessage(t('تم إرسال الشكوى للإدارة.','Your complaint was sent to the team.','Deine Beschwerde wurde an das Team gesendet.'));
  }catch(error){
   if(request.current&&cloudMutationUncertain(error)){
    setMessage(t('لم يتأكد وصول الشكوى. أعد إرسال الشكوى نفسها عند عودة الاتصال.','Receipt is unconfirmed. Retry the same complaint when you reconnect.','Der Eingang ist unbestätigt. Sende dieselbe Beschwerde erneut, sobald du online bist.'));
   }else{
    request.current=null;
    const kind=error instanceof CloudError?error.kind:'';
    setMessage(kind==='P0001'
     ?t('بلغت حد الشكاوى لهذه الساعة. حاول لاحقًا.','You reached the hourly complaint limit. Try again later.','Das Stundenlimit für Beschwerden ist erreicht. Versuche es später.')
     :kind==='42501'?t('يتعذّر ربط الشكوى بهذه الرحلة.','This complaint cannot be linked to that ride.','Diese Beschwerde kann der Fahrt nicht zugeordnet werden.')
     :t('تعذّر إرسال الشكوى. أعد المحاولة.','Could not send the complaint. Try again.','Beschwerde konnte nicht gesendet werden. Versuche es erneut.'));
   }
  }finally{inFlight.current=false;setBusy(false)}
 }

 return <>
  <Panel outlined>
   <Label large>{t('قدّم شكوى','Submit a complaint','Beschwerde einreichen')}</Label>
   <Label muted>{rideId?t('الرحلة','Ride','Fahrt')+' · '+rideId.slice(0,8):t('شكوى عامة','General complaint','Allgemeine Beschwerde')}</Label>
   <View style={{flexDirection:language==='ar'?'row-reverse':'row',flexWrap:'wrap',gap:6}}>
    {complaintCategories.map(([id,ar,en,de])=><Pressable key={id} disabled={locked} accessibilityRole="radio"
     accessibilityState={{checked:id===category,disabled:locked}} onPress={()=>setCategory(id)}
     style={{minHeight:40,justifyContent:'center',paddingHorizontal:10,borderRadius:10,
      backgroundColor:id===category?colors.selected:colors.soft,borderWidth:1,borderColor:id===category?colors.purple:colors.line}}>
     <Label>{t(ar,en,de)}</Label>
    </Pressable>)}
   </View>
   <Field label={t('شو صار؟','What happened?','Was ist passiert?')} multiline maxLength={1000} value={detail}
    editable={!locked} onChangeText={setDetail} style={{minHeight:88,textAlignVertical:'top'}}
    placeholder={t('اكتب وصفًا من 10 أحرف على الأقل','Write at least 10 characters','Schreibe mindestens 10 Zeichen')}/>
   <Button icon="flag-outline" title={request.current&&!busy?t('إعادة إرسال الشكوى','Retry complaint','Beschwerde erneut senden'):t('إرسال للإدارة','Send to the team','An das Team senden')}
    disabled={busy||detail.trim().length<10||connection==='offline'} onPress={()=>void submit()}/>
   {!!message&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
  </Panel>
  <Label large>{t('شكاواي','My complaints','Meine Beschwerden')}</Label>
  <ComplaintList key={revision} owner={owner}/>
 </>;
}
