import {useState} from 'react';
import {cloudCancellationReceipt,cloudCurrentToken} from './cloud-api';
import {reasons} from './ride-cancellation-options';
import {Button,Label,useText} from './ui';

export function CancellationReceipt({rideId}:{rideId:string}){
 const t=useText();
 const [busy,setBusy]=useState(false);
 const [receipt,setReceipt]=useState<Awaited<ReturnType<typeof cloudCancellationReceipt>>>();
 const [failed,setFailed]=useState(false);
 async function load(){
  setBusy(true);setFailed(false);
  try{setReceipt(await cloudCancellationReceipt(await cloudCurrentToken(),rideId))}
  catch{setFailed(true)}
  finally{setBusy(false)}
 }
 if(receipt===null)return <Label muted>{t('لا يوجد سبب محفوظ لهذه الرحلة.','No cancellation reason was saved.','Es wurde kein Stornierungsgrund gespeichert.')}</Label>;
 if(receipt){
  const option=reasons[receipt.actor]?.find(([id])=>id===receipt.reason);
  return <>{option&&<Label muted>{t(option[1],option[2],option[3])}</Label>}{!!receipt.detail&&<Label>{receipt.detail}</Label>}</>;
 }
 return <>
  <Button secondary disabled={busy} title={busy?t('جارٍ تحميل السبب…','Loading reason…','Grund wird geladen …'):t('عرض سبب الإلغاء','Show cancellation reason','Stornierungsgrund anzeigen')} onPress={()=>void load()}/>
  {failed&&<Label muted>{t('تعذّر تحميل السبب. حاول مجددًا.','Could not load the reason. Try again.','Der Grund konnte nicht geladen werden. Versuche es erneut.')}</Label>}
 </>;
}
