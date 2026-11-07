import {View} from 'react-native';
import {useApp} from './context';
import {chooseDriverNavigation,navigationProviders,useDriverNavigationPreference,type NavigationProvider} from './driver-navigation-preference';
import {OsmAndHelp} from './ride-live-sharing';
import {Button,HelpTip,Icon,Label,Panel,SectionTitle,useText,useTheme} from './ui';

export default function DriverNavigationSettings(){
 const t=useText();
 const {state}=useApp();
 const {colors}=useTheme();
 const selected=useDriverNavigationPreference();
 const card=(provider:NavigationProvider,icon:'download-outline'|'map-outline',description:string)=>(
  <Panel outlined>
   <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:10}}>
    <View style={{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.selected}}>
     <Icon name={icon} color={colors.purple}/>
    </View>
    <View style={{flex:1}}><Label>{navigationProviders[provider]}</Label>
     {selected===provider&&<Label muted>{t('المختار على هذا الجهاز','Selected on this device')}</Label>}
    </View>
   </View>
   <Label>{description}</Label>
   <Button secondary={selected!==provider} disabled={selected===provider}
    icon={selected===provider?'checkmark-circle-outline':'navigate-outline'}
    title={selected===provider?t('محدد','Selected'):t('اختيار '+navigationProviders[provider],'Choose '+navigationProviders[provider])}
    onPress={()=>chooseDriverNavigation(provider)}/>
   {provider==='osmand'&&<OsmAndHelp/>}
  </Panel>
 );
 return <Panel>
  <SectionTitle title={t('الملاحة','Navigation')} subtitle={t('اختر التطبيق الذي يفتحه زر الملاحة في رحلة السائق. يُحفظ اختيارك على هذا الجهاز.','Choose which app opens from the driver’s ride. Your choice is saved on this device.')}/>
  {card('osmand','download-outline',t('مناسب للطرق مع اتصال ضعيف. ثبّت OsmAnd على أندرويد ونزّل خريطة منطقة عملك مسبقًا. عند فتح الملاحة من الرحلة، يطلب يلّا نروح بدء مسار السيارة من موقعك الحالي.','Useful with a weak connection. Install OsmAnd on Android and download the map for your driving area first. From a ride, Yalla Nrouh asks OsmAnd to start driving guidance from your current location.'))}
  {card('google','map-outline',t('يفتح خرائط Google للملاحة بالسيارة إلى نقطة الالتقاء أو الوجهة. فعّل الموقع في الهاتف، واستخدم اتصال الإنترنت للحصول على أحدث معلومات الطريق وحركة المرور حيث تتوفر.','Opens Google Maps for driving directions to pickup or the destination. Enable phone location and use an internet connection for current road and traffic information where available.'))}
  <HelpTip title={t('ملء الشاشة أو تقسيم الشاشة','Full screen or split screen')}>
   <Label>{t('اختر «ملاحة بملء الشاشة» لفتح تطبيق الملاحة وحده. يتيح تقسيم الشاشة عرض تطبيق الملاحة بجانب الرحلة على الأجهزة التي تدعمه. إذا فُتحت الملاحة وحدها، افتح «التطبيقات الأخيرة»، واضغط أيقونة يلّا نروح، واختر عرض تقسيم الشاشة ثم تطبيق الملاحة.','Choose full-screen navigation to open the maps app on its own. Split screen shows the ride alongside navigation on supported devices. If the maps app opens alone, go to Recents, tap the Yalla Nrouh icon, choose split screen, then select the maps app.')}</Label>
  </HelpTip>
 </Panel>;
}
