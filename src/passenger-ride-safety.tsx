import {useEffect,useState} from 'react';
import {Platform,Share,Text,View} from 'react-native';
import {cloudCurrentToken,cloudRideDriverVehicleDetails,type CloudRide,type DriverVehicleDetails} from './cloud-api';
import {useApp} from './context';
import {categories} from './domain';
import {RideStatusCard} from './ride-status-card';
import {Button,Label,useText,useTheme} from './ui';

export function PassengerRideSafety({ride,stage}:{ride:CloudRide;stage:string}){
 const t=useText();
 const {colors}=useTheme();
 const {foreground,connection,state:{language}}=useApp();
 const [vehicle,setVehicle]=useState<DriverVehicleDetails|null>(null);
 const [showSummary,setShowSummary]=useState(false);
 const [copiedSummary,setCopiedSummary]=useState<string|null>(null);
 const [manualCopy,setManualCopy]=useState(false);

 useEffect(()=>{
  if(!foreground||connection==='offline')return;
  let current=true;
  void cloudCurrentToken().then(token=>current?cloudRideDriverVehicleDetails(token,ride.id):null)
   .then(details=>{if(current)setVehicle(details)})
   .catch(()=>{/* The summary remains available when the vehicle details cannot be loaded. */});
  return()=>{current=false};
 },[ride.id,foreground,connection]);

 const name=vehicle?.display_name?.trim();
 const plate=vehicle?.vehicle_plate?.trim();
 const color=vehicle?.vehicle_color?.trim();
 const category=categories.find(item=>item.id===(vehicle?.category??ride.category))?.[language];
 const driverLabel=t('السائق','Driver','Fahrer');
 const plateLabel=t('رقم اللوحة','License plate','Kennzeichen');
 const carLabel=t('السيارة','Vehicle','Fahrzeug');
 const car=[category,color].filter(Boolean).join(' · ');
 const summary=[
  t('ملخص رحلتي مع يلّا نروح','My Yalla Nrouh ride summary','Meine Fahrt mit Yalla Nrouh'),
  stage,
  t('نقطة الانطلاق عند الحجز','Booked pickup','Gebuchter Abholort')+' — '+ride.pickup,
  t('الوجهة','Destination','Ziel')+' — '+ride.destination,
  name&&driverLabel+' — '+name,
  car&&carLabel+' — '+car,
  plate&&plateLabel+' — '+plate,
 ].filter(Boolean).join('\n');

 async function share(){
  try{
   if(Platform.OS==='web')await navigator.share({text:summary});
   else await Share.share({message:summary});
  }catch(error){
   if(!(error instanceof Error&&error.name==='AbortError'))setManualCopy(true);
  }
 }

 async function copy(){
  setCopiedSummary(null);
  try{
   await navigator.clipboard.writeText(summary);
   setCopiedSummary(summary);
  }catch{setManualCopy(true)}
 }

 return <RideStatusCard icon="shield-checkmark-outline" title={t('أمان الرحلة','Ride safety','Sicherheit auf der Fahrt')}>
  {name&&<Label>{driverLabel} · {name}</Label>}
  {car&&<Label>{carLabel} · {car}</Label>}
  {plate?<Label large>{plateLabel} · {plate}</Label>
   :<Label muted>{t('رقم اللوحة غير متاح حاليًا.','The license plate is currently unavailable.','Das Kennzeichen ist derzeit nicht verfügbar.')}</Label>}
  {ride.status!=='riding'&&<Label muted>{plate
   ?t('طابق رقم اللوحة قبل الركوب. إذا كانت اللوحة مختلفة، لا تركب.','Check the license plate before getting in. If it differs, do not get in.','Prüfe vor dem Einsteigen das Kennzeichen. Steig bei einem anderen Kennzeichen nicht ein.')
   :t('تأكد من هوية السائق والسيارة قبل الركوب.','Confirm the driver and vehicle before getting in.','Prüfe vor dem Einsteigen, ob Fahrer und Fahrzeug stimmen.')}</Label>}
  <Button secondary icon="share-social-outline" title={showSummary
   ?t('إخفاء ملخص الرحلة','Hide ride summary','Fahrtübersicht ausblenden')
   :t('مشاركة ملخص الرحلة','Share ride summary','Fahrtübersicht teilen')}
   onPress={()=>{setShowSummary(!showSummary);setCopiedSummary(null);setManualCopy(false)}}/>
  {showSummary&&<View style={{gap:8}}>
   <Label muted>{t('أرسل هذا الملخص لشخص تثق به. يعرض تفاصيل الرحلة وقت المشاركة.','Send this summary to someone you trust. It shows the ride details at the time of sharing.','Sende die Übersicht an eine Person, der du vertraust. Sie zeigt die Fahrtdaten zum Zeitpunkt des Teilens.')}</Label>
   <Text selectable style={{color:colors.ink,fontSize:14,lineHeight:22,textAlign:language==='ar'?'right':'left',writingDirection:language==='ar'?'rtl':'ltr'}}>{summary}</Text>
   {(Platform.OS!=='web'||typeof navigator!=='undefined'&&typeof navigator.share==='function')&&
    <Button secondary icon="share-outline" title={t('فتح خيارات المشاركة','Open sharing options','Teilen-Optionen öffnen')} onPress={()=>void share()}/>}
   {Platform.OS==='web'&&<Button secondary icon="copy-outline" title={t('نسخ الملخص','Copy summary','Übersicht kopieren')} onPress={()=>void copy()}/>}
   <View accessibilityLiveRegion="polite">
    {copiedSummary===summary&&<Label>{t('تم نسخ ملخص الرحلة.','Ride summary copied.','Fahrtübersicht kopiert.')}</Label>}
    {copiedSummary!==summary&&manualCopy&&<Label muted>{t('اضغط مطولًا على نص الملخص لنسخه يدويًا.','Press and hold the summary text to copy it manually.','Halte den Text der Übersicht gedrückt, um ihn manuell zu kopieren.')}</Label>}
   </View>
  </View>}
 </RideStatusCard>;
}
