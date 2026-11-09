import React,{useCallback,useEffect} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect,useIsFocused} from 'expo-router';
import {cloudCurrentToken,cloudMyRides} from '../cloud-api';
import {RideResumeCard} from '../ride-resume-card';
import {useRideState} from '../use-ride-state';
import {readPendingRideOperation} from '../use-ride-recovery';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {useCurrentPosition} from '../use-current-position';
import MapCanvas from '../map/MapCanvas';
import {PassengerMapFrame,usePassengerMapHeight} from '../passenger-trip-summary';
import {brandHeader} from '../theme';
import {Button,DeviceStatus,Icon,Label,type IconName,useText,useTheme} from '../ui';

export default function Booking(){
 const {state,draft,ready}=useApp();
 const auth=useAuth();
 const rideState=useRideState();
 const userId=auth.session?.user.id;
 const resumable=rideState.owner===userId?rideState.resume:null;
 const pendingRequest=readPendingRideOperation('request',userId);
 const canBook=auth.rolesReady&&(!auth.driver||auth.admin);
 const bookingBlocked=!!auth.session&&!canBook;
 const t=useText();
 const {colors}=useTheme();
 const isFocused=useIsFocused();
 const mapHeight=usePassengerMapHeight();
 const gps=useCurrentPosition(isFocused&&ready&&state.preferences.permissionsIntroSeen);
 const rtl=state.language==='ar';
 const row={flexDirection:rtl?'row-reverse' as const:'row' as const};

 useEffect(()=>{if(auth.recovery)router.replace('/account')},[auth.recovery]);
 useFocusEffect(useCallback(()=>{
  if(!userId||!canBook)return;
  let checking=false;
  function load(){
   if(checking)return;
   checking=true;
   void cloudCurrentToken().then(cloudMyRides).catch(()=>{}).finally(()=>{checking=false});
  }
  load();
  const resume=(event:Event)=>{if((event as CustomEvent).detail?.active===true)load()};
  const visible=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('yalla:native-visibility',resume);
  window.addEventListener('online',load);
  document.addEventListener('visibilitychange',visible);
  return ()=>{
   window.removeEventListener('yalla:native-visibility',resume);
   window.removeEventListener('online',load);
   document.removeEventListener('visibilitychange',visible);
  };
 },[userId,canBook]));

 function choose(){
  if(pendingRequest){router.push('/review');return}
  if(resumable){router.push({pathname:'/cloud',params:{ride:resumable.id}});return}
  if(rideState.active){router.push('/cloud');return}
  router.push({pathname:'/location',params:{target:'destination',focus:'1'}});
 }
 function openPickup(){
  if(pendingRequest){router.push('/review');return}
  if(resumable){router.push({pathname:'/cloud',params:{ride:resumable.id}});return}
  if(rideState.active){router.push('/cloud');return}
  router.push({pathname:'/location',params:{target:'pickup'}});
 }

 const status=gps.busy?t('جارٍ تحديد موقعك…','Finding your location…'):gps.failure==='permission'?t('اسمح بالموقع لعرض مكانك على الخريطة','Allow location access to see where you are.'):gps.failure==='accuracy'?t('فعّل الموقع الدقيق من أذونات التطبيق','Turn on precise location in app settings'):gps.failure==='services'?t('فعّل خدمة الموقع في الهاتف','Turn on phone location'):t('تعذر تحديد الموقع؛ اضغط زر موقعي للمحاولة','We couldn’t find your location. Tap My location to try again.');
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
  <View style={styles.frame}>
   <ScrollView contentContainerStyle={styles.scroll}>
    {!bookingBlocked&&resumable&&<View style={{paddingHorizontal:12}}>
     <RideResumeCard ride={resumable} verified={rideState.known} onOpen={()=>router.push({pathname:'/cloud',params:{ride:resumable.id}})}/>
    </View>}
    <View style={styles.mapFrame}><PassengerMapFrame>
     <MapCanvas compact readOnly minMapHeight={mapHeight} cameraTarget={gps.camera} point={gps.camera?.point??null} onChange={()=>{}}/>
     {(gps.busy||gps.failure)&&<View pointerEvents="none" style={[styles.status,{backgroundColor:colors.background}]}><Label muted>{status}</Label></View>}
     <Pressable accessibilityRole="button" accessibilityLabel={t('موقعي الحالي','My current location')} onPress={()=>void gps.locate()} disabled={gps.busy} style={[styles.locate,{backgroundColor:colors.background,borderColor:colors.line}]}>{gps.busy?<ActivityIndicator color={colors.purple}/>:<Icon name="locate" color={colors.purple}/>}</Pressable>
    </PassengerMapFrame></View>
    <View style={styles.content}>
     <DeviceStatus/>
     <Pressable accessibilityRole="button" disabled={bookingBlocked} accessibilityState={{disabled:bookingBlocked}} accessibilityLabel={t('لوين بدك تروح؟ ابحث عن وجهتك','Where to? Search for your destination')} onPress={choose} style={({pressed})=>[styles.search,row,{backgroundColor:colors.brandAction,opacity:pressed ? .82 : 1}]}>
      <View style={[styles.iconBadge,{backgroundColor:brandHeader.accent}]}><Icon name="search-outline" size={23} color={brandHeader.background}/></View>
      <View style={{flex:1,minWidth:0}}><Text style={[styles.searchTitle,{textAlign:rtl?'right':'left'}]}>{t('لوين بدك تروح؟','Where to?')}</Text>{!!draft.destination&&<Text style={{color:'#d6e6f5',textAlign:rtl?'right':'left'}} numberOfLines={1}>{draft.destination}</Text>}</View>
      <Icon name={rtl?'chevron-back':'chevron-forward'} size={20} color="#d6e6f5"/>
     </Pressable>
     {bookingBlocked&&<View accessibilityLiveRegion="polite" style={styles.accountStatus}>
      {!auth.problem&&<ActivityIndicator size="small" color={colors.purple}/>}
      <View style={{flex:1}}><Label muted>{auth.problem?t('تعذر تحديث الجلسة أو صلاحيات الحساب. تحقق من الاتصال وأعد المحاولة.','Could not check the session or account access. Check internet and try again.'):t('جارٍ التحقق من صلاحيات الحساب…','Checking account access…')}</Label></View>
      {!!auth.problem&&<Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}
     </View>}
     {!bookingBlocked&&(pendingRequest||!resumable&&(rideState.active||draft.destinationPoint))&&<Button icon="arrow-forward-outline" title={pendingRequest?t('التحقق من طلب التاكسي','Check taxi request'):rideState.active?t('متابعة رحلتي الحالية','View my current ride'):t('متابعة إلى نقطة الانطلاق','Continue to the pickup point')} onPress={openPickup}/>}
     <View style={[row,styles.shortcuts]}>
      <Shortcut mint icon="bookmark-outline" title={t('العناوين المحفوظة','Saved addresses')} onPress={()=>router.push({pathname:'/location',params:{view:'saved'}})}/>
      <Shortcut icon="time-outline" title={t('الرحلات الأخيرة','Recent rides')} onPress={()=>router.push({pathname:'/cloud',params:{mode:'history'}})}/>
     </View>
    </View>
   </ScrollView>
  </View>
 </SafeAreaView>;
}
function Shortcut({icon,title,onPress,mint=false}:{icon:IconName;title:string;onPress:()=>void;mint?:boolean}){
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({pressed})=>[styles.shortcut,{backgroundColor:pressed?colors.selected:colors.surface,borderColor:colors.line}]}>
  <View style={[styles.iconBadge,{backgroundColor:mint?colors.brandTint:colors.soft}]}><Icon name={icon} size={21} color={mint?colors.brandAccent:colors.purple}/></View>
  <Text style={[styles.shortcutTitle,{color:colors.ink}]}>{title}</Text>
 </Pressable>;
}

const styles=StyleSheet.create({
 frame:{flex:1,width:'100%',maxWidth:1000,alignSelf:'center'},
 scroll:{paddingBottom:28,paddingTop:10},
 mapFrame:{marginHorizontal:12},
 content:{width:'100%',maxWidth:640,alignSelf:'center',paddingHorizontal:16,gap:12},
 status:{position:'absolute',top:12,left:16,right:16,borderRadius:12,paddingVertical:7,paddingHorizontal:12,elevation:2},
 locate:{position:'absolute',bottom:12,left:16,width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center',elevation:3,boxShadow:'0px 2px 10px #00000018'},
 search:{minHeight:66,paddingHorizontal:14,paddingVertical:10,borderRadius:20,alignItems:'center',gap:12},
 searchTitle:{color:'#fff',fontSize:19,fontWeight:'700',lineHeight:27},
 accountStatus:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
 shortcuts:{gap:10,alignItems:'stretch'},
 shortcut:{flexBasis:0,flexGrow:1,minWidth:0,minHeight:90,padding:10,borderWidth:1,borderRadius:18,alignItems:'center',justifyContent:'center',gap:5,boxShadow:'0px 3px 10px #08264818'},
 shortcutTitle:{fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'center'},
 iconBadge:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center'},
});
