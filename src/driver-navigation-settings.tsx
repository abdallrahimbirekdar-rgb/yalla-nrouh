import {OsmAndHelp} from './ride-live-sharing';
import {HelpTip,Label,Panel,SectionTitle,useText} from './ui';

export default function DriverNavigationSettings(){
 const t=useText();
 return <Panel>
  <SectionTitle title={t('الملاحة','Navigation')} subtitle="OsmAnd"/>
  <Label>{t('يفتح زر الملاحة في رحلة السائق تطبيق OsmAnd على أندرويد لبدء مسار السيارة. تعرض خريطة يلّا نروح الصغيرة موقع الزبون عند مشاركته.','The driver’s navigation button opens OsmAnd on Android for driving directions. Yalla Nrouh’s small map shows the customer’s shared location.')}</Label>
  <OsmAndHelp/>
  <HelpTip title={t('ملء الشاشة أو تقسيم الشاشة','Full screen or split screen')}>
   <Label>{t('اختر «فتح OsmAnd» للملاحة بملء الشاشة، أو «OsmAnd بتقسيم الشاشة» لعرض الملاحة بجانب الرحلة على الأجهزة التي تدعم ذلك. إذا فُتح OsmAnd وحده، افتح «التطبيقات الأخيرة» واختر تقسيم الشاشة من أيقونة يلّا نروح.','Choose Open OsmAnd for full-screen directions, or OsmAnd in split screen to see the ride alongside it on supported devices. If OsmAnd opens alone, go to Recents and choose split screen from the Yalla Nrouh icon.')}</Label>
  </HelpTip>
 </Panel>;
}
