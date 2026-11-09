import {useEffect,useState} from 'react';
import {Image,Platform,Share,Text,View} from 'react-native';
import {cloudCurrentToken,cloudRideDriverVehicleDetails,type CloudRide,type DriverVehicleDetails} from './cloud-api';
import {useApp} from './context';
import {categories} from './domain';
import {formatCoordinate,isCoordinate,type Coordinate} from './geo';
import {createPickupAddressLookup,needsAddressLookup} from './map/pickup-address';
import {createRideShareImage} from './ride-share-image';
import {RideStatusCard} from './ride-status-card';
import {Button,Label,useText,useTheme} from './ui';

export function PassengerRideSafety({ride,stage,approvedPickup}:{ride:CloudRide;stage:string;approvedPickup?:Coordinate}){
 const t=useText();
 const {colors}=useTheme();
 const {foreground,connection,state:{language}}=useApp();
 const [vehicle,setVehicle]=useState<DriverVehicleDetails|null>(null);
 const [showSummary,setShowSummary]=useState(false);
 const [copiedSummary,setCopiedSummary]=useState<string|null>(null);
 const [manualCopy,setManualCopy]=useState(false);
 const [textOnly,setTextOnly]=useState(false);
 const [addresses,setAddresses]=useState<Record<string,string>>({});
 const [diagram,setDiagram]=useState<{file:File;url:string}|null>(null);
 const fromLat=approvedPickup?.latitude??ride.pickup_lat,fromLng=approvedPickup?.longitude??ride.pickup_lng;
 const toLat=ride.destination_lat,toLng=ride.destination_lng;
 const lookupFrom=!!approvedPickup||needsAddressLookup(ride.pickup);
 const lookupTo=needsAddressLookup(ride.destination);
 const from={latitude:fromLat,longitude:fromLng};
 const to={latitude:toLat,longitude:toLng};
 const validStops=isCoordinate(from)&&isCoordinate(to);
 const fromKey=language+':'+formatCoordinate(from),toKey=language+':'+formatCoordinate(to);
 const fromAddress=lookupFrom?(addresses[fromKey]||formatCoordinate(from)):ride.pickup.trim();
 const toAddress=lookupTo?(addresses[toKey]||formatCoordinate(to)):ride.destination.trim();
 const diagramTitle=t('يلّا نروح · مخطط توضيحي أ إلى ب','Yalla Nrouh · A to B diagram','Yalla Nrouh · Skizze von A nach B');

 useEffect(()=>{
  if(Platform.OS!=='web'||!foreground||connection==='offline'||!validStops||!lookupFrom&&!lookupTo)return;
  let active=true;
  void createPickupAddressLookup(language).then(async lookup=>{
   const stops=[
    ...(lookupFrom?[{key:fromKey,point:{latitude:fromLat,longitude:fromLng}}]:[]),
    ...(lookupTo?[{key:toKey,point:{latitude:toLat,longitude:toLng}}]:[]),
   ];
   if(!active)return;
   await Promise.allSettled(stops.map(async ({key,point})=>{
    const address=await lookup(point);
    if(active&&address)setAddresses(previous=>({...previous,[key]:address}));
   }));
  }).catch(()=>{/* Coordinates and the directions link remain available. */});
  return()=>{active=false};
 },[foreground,connection,validStops,lookupFrom,lookupTo,language,fromKey,toKey,fromLat,fromLng,toLat,toLng]);

 useEffect(()=>{
  setDiagram(null);
  if(Platform.OS!=='web'||!showSummary||!validStops)return;
  let active=true,url:string|undefined;
  void createRideShareImage(diagramTitle,fromAddress,toAddress).then(blob=>{
   if(!active||!blob)return;
   url=URL.createObjectURL(blob);
   setDiagram({file:new File([blob],'yalla-nrouh-a-b.png',{type:'image/png'}),url});
  }).catch(()=>{/* The shareable directions link is still available. */});
  return()=>{active=false;if(url)URL.revokeObjectURL(url)};
 },[showSummary,validStops,diagramTitle,fromAddress,toAddress]);

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
 const model=vehicle?.vehicle_model?.trim();
 const car=[model,color].filter(Boolean).join(' · ');
 const unavailable=t('غير متاح','Unavailable','Nicht verfügbar');
 const directionsUrl=validStops?'https://www.google.com/maps/dir/?'+new URLSearchParams({
  api:'1',origin:fromLat+','+fromLng,destination:toLat+','+toLng,travelmode:'driving',
 }):null;
 const supportsImage=Platform.OS==='web'&&!textOnly&&!!diagram&&typeof navigator.canShare==='function'&&
  navigator.canShare({files:[diagram.file]});
 const summary=[
  t('ملخص رحلتي مع يلّا نروح','My Yalla Nrouh ride summary','Meine Fahrt mit Yalla Nrouh'),
  stage,
  t('من','From','Von')+' — '+fromAddress,
  t('إلى','To','Nach')+' — '+toAddress,
  driverLabel+' — '+(name||unavailable),
  t('اسم السيارة وموديلها','Car make and model','Automarke und Modell')+' — '+(model||unavailable),
  plateLabel+' — '+(plate||unavailable),
  directionsUrl,
 ].filter(Boolean).join('\n');

 async function share(){
  try{
   if(Platform.OS==='web')await navigator.share({text:summary,...(supportsImage?{files:[diagram.file]}:{})});
   else await Share.share({message:summary});
  }catch(error){
   if(!(error instanceof Error&&error.name==='AbortError')){
    if(supportsImage)setTextOnly(true);
    setManualCopy(true);
   }
  }
 }

 function downloadDiagram(){
  if(!diagram)return;
  const link=document.createElement('a');
  link.href=diagram.url;
  link.download=diagram.file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  {(car||category)&&<Label>{carLabel} · {car||category}</Label>}
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
   {diagram&&<>
    <Image source={{uri:diagram.url}} accessibilityLabel={diagramTitle} resizeMode="contain" style={{width:'100%',aspectRatio:2.5,maxHeight:180}}/>
    {!supportsImage&&<Button secondary icon="download-outline" title={t('تنزيل مخطط أ إلى ب','Download A to B diagram','Skizze von A nach B herunterladen')} onPress={downloadDiagram}/>}
   </>}
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
