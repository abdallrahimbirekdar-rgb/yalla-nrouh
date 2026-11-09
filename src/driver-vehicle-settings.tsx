import {useEffect,useState} from 'react';
import {cloudCurrentToken,cloudMyDriverVehicleDetails,cloudSaveDriverVehicleDetails} from './cloud-api';
import {Button,Field,Label,Panel,useText} from './ui';

type Form={display_name:string;vehicle_color:string;vehicle_plate:string;vehicle_model:string};
const fields=[
 {key:'display_name',ar:'اسم السائق للعرض',en:'Driver display name',length:80},
 {key:'vehicle_model',ar:'اسم السيارة وموديلها',en:'Car make and model',de:'Automarke und Modell',length:80},
 {key:'vehicle_color',ar:'لون السيارة',en:'Vehicle color',length:40},
 {key:'vehicle_plate',ar:'رقم اللوحة',en:'Plate number',length:24},
] as const;

export default function DriverVehicleSettings(){
 const t=useText();
 const [form,setForm]=useState<Form|null>(null);
 const [loadError,setLoadError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<'saved'|'failed'|null>(null);
 useEffect(()=>{
  let active=true;
  void cloudCurrentToken().then(cloudMyDriverVehicleDetails).then(details=>{
   if(!active||!details)return;
   setForm({display_name:details.display_name??'',vehicle_color:details.vehicle_color??'',vehicle_plate:details.vehicle_plate??'',vehicle_model:details.vehicle_model??''});
  }).catch(()=>{if(active)setLoadError(true)});
  return()=>{active=false};
 },[attempt]);
 if(loadError)return <Panel><Label>{t('تعذّر تحميل بيانات السيارة.','Could not load vehicle details.')}</Label>
  <Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>{setLoadError(false);setAttempt(n=>n+1)}}/></Panel>;
 if(!form)return null;
 async function save(values:Form){
  setBusy(true);setStatus(null);
  try{
   const result=await cloudSaveDriverVehicleDetails(await cloudCurrentToken(),values);
   setStatus(result?'saved':'failed');
  }catch{setStatus('failed')}finally{setBusy(false)}
 }
 return <Panel>
  <Label large>{t('بيانات السائق والسيارة','Driver and vehicle details')}</Label>
  <Label muted>{t('الحقول اختيارية. تظهر البيانات المحفوظة للزبون المعيّن أثناء رحلته.','Fields are optional. Saved details are shown to the assigned passenger during their ride.')}</Label>
  {fields.map(field=><Field key={field.key} label={t(field.ar,field.en,'de' in field?field.de:undefined)} value={form[field.key]} maxLength={field.length}
   editable={!busy} onChangeText={value=>{setStatus(null);setForm({...form,[field.key]:value})}}/>)}
  <Button secondary icon="save-outline" title={t('حفظ بيانات السيارة','Save vehicle details')} disabled={busy} onPress={()=>void save(form)}/>
  {status&&<Label>{status==='saved'?t('تم حفظ البيانات.','Details saved.'):t('تعذّر حفظ البيانات. جرّب مرة أخرى.','Could not save the details. Try again.')}</Label>}
 </Panel>;
}
