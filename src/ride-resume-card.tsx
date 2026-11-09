import {RideStatusCard} from './ride-status-card';
import type {ResumeRide} from './ride-resume';
import {Button,useText} from './ui';

export function RideResumeCard({ride,verified,onOpen}:{ride:ResumeRide;verified:boolean;onOpen?:()=>void}){
 const t=useText();
 const stage={
  requested:t('البحث عن سائق','Looking for a driver','Fahrersuche'),
  accepted:t('السائق في الطريق لنقطة الالتقاء','Driver is heading to pickup','Fahrer ist auf dem Weg zum Abholort'),
  arrived:t('وصل السائق إلى نقطة الالتقاء','Driver arrived at pickup','Fahrer ist am Abholort'),
  riding:t('الرحلة جارية','Ride in progress','Fahrt läuft'),
 }[ride.status];
 return <RideStatusCard icon="car-outline" warning={!verified} title={stage} detail={!verified
  ?t('آخر حالة محفوظة. نتحقق من الحالة الحالية عند توفر الاتصال.','Last saved status. We’ll check the current status when a connection is available.','Zuletzt gespeicherter Status. Der aktuelle Status wird bei bestehender Verbindung geprüft.')
  :undefined}>
  {onOpen&&<Button title={t('متابعة الرحلة','Continue ride','Fahrt fortsetzen')} icon="arrow-forward-outline" onPress={onOpen}/>}
 </RideStatusCard>;
}
