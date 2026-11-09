import {useEffect,useRef} from 'react';
import {notifyLocal} from './alerts';
import {rememberOfferChimes,type HeardOffers} from './driver-offer-chime';
import {passengerAlertEvent} from './passenger-alert-events';
import {isNativeWebView} from './site-bridge';
import {useText} from './ui';

export function usePassengerRideAlert(owner:string|undefined,enabled:boolean,ride:Parameters<typeof passengerAlertEvent>[0]|undefined){
 const t=useText();
 const seen=useRef<{owner:string;events:HeardOffers}|null>(null);
 useEffect(()=>{
  if(!owner||!enabled||!ride||!isNativeWebView()||document.visibilityState==='hidden')return;
  const now=Date.now();
  const event=passengerAlertEvent(ride,now);
  if(!event)return;
  const storageKey='yalla-passenger-alerts:'+owner;
  let events=seen.current?.owner===owner?seen.current.events:{};
  try{
   const saved=JSON.parse(localStorage.getItem(storageKey)??'{}') as HeardOffers|null;
   if(saved&&typeof saved==='object')events={...events,...saved};
  }catch{/* Keep deduplication in memory when storage is unavailable. */}
  if(Object.prototype.hasOwnProperty.call(events,event.key))return;
  const next=rememberOfferChimes(events,[event.key],now);
  seen.current={owner,events:next};
  try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{/* In-memory deduplication still applies. */}
  const body=event.status==='accepted'
   ?t('قبل السائق طلبك وهو في الطريق إليك.','A driver accepted your request and is on the way.','Ein Fahrer hat deine Anfrage angenommen und ist unterwegs.')
   :t('وصل السائق إلى نقطة الالتقاء.','Your driver has arrived at the pickup point.','Dein Fahrer ist am Abholort angekommen.');
  void notifyLocal(t('يلّا نروح','Yalla Nrouh','Yalla Nrouh'),body).catch(()=>{/* The ride screen still shows the event. */});
 },[owner,enabled,ride,t]);
}
