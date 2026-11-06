import React,{useCallback,useEffect} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {cloudCurrentToken,cloudMyRides} from '../cloud-api';
import {useRideState} from '../use-ride-state';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {useCurrentPosition} from '../use-current-position';
import MapCanvas from '../map/MapCanvas';
import {AccountButton,AppMenu,Button,DeviceStatus,Icon,Label,useText,useTheme} from '../ui';

export default function Booking(){
 const {state,draft,ready}=useApp();
 const auth=useAuth();
 const rideState=useRideState();
 const userId=auth.session?.user.id;
 const canBook=auth.rolesReady&&(!auth.driver||auth.admin);
 const t=useText();
 const {colors,dark}=useTheme();
 const gps=useCurrentPosition(ready&&state.preferences.permissionsIntroSeen);
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
  document.addEventListener('visibilitychange',visible);
  return ()=>{
   window.removeEventListener('yalla:native-visibility',resume);
   document.removeEventListener('visibilitychange',visible);
  };
 },[userId,canBook]));

 function choose(){
  if(rideState.active){router.push('/cloud');return}
  router.push({pathname:'/location',params:{target:'destination',focus:'1'}});
 }
 function openPickup(){
  if(rideState.active){router.push('/cloud');return}
  router.push({pathname:'/location',params:{target:'pickup'}});
 }
 if(auth.session&&!canBook)return <SafeAreaView style={[styles.loading,{backgroundColor:colors.background}]}><ActivityIndicator color={colors.purple}/>{auth.problem&&<Button title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}</SafeAreaView>;

 const status=gps.busy?t('جارٍ تحديد موقعك…','Finding your location…'):gps.failure==='permission'?t('اسمح بالموقع لعرض مكانك على الخريطة','Allow location to show your position'):gps.failure==='accuracy'?t('فعّل الموقع الدقيق من أذونات التطبيق','Turn on precise location in app settings'):gps.failure==='services'?t('فعّل خدمة الموقع في الهاتف','Turn on phone location'):t('تعذر تحديد الموقع؛ اضغط زر موقعي للمحاولة','Location failed. Tap My location to retry');
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
  <View style={styles.frame}>
   <View style={[styles.header,row]}><AppMenu/><Image source={dark?require('../../assets/logo-header-dark.png'):require('../../assets/logo-approved.png')} accessibilityLabel="يلا نروح" resizeMode="contain" style={{width:90,height:48,flex:1}}/><AccountButton/></View>
   <ScrollView contentContainerStyle={styles.scroll}>
    <View style={{backgroundColor:colors.surface}}>
     <MapCanvas compact readOnly minMapHeight={300} cameraTarget={gps.camera} point={gps.camera?.point??null} onChange={()=>{}}/>
     {(gps.busy||gps.failure)&&<View pointerEvents="none" style={[styles.status,{backgroundColor:colors.background}]}><Label muted>{status}</Label></View>}
     <Pressable accessibilityRole="button" accessibilityLabel={t('موقعي الحالي','My current location')} onPress={()=>void gps.locate()} disabled={gps.busy} style={[styles.locate,{backgroundColor:colors.background,borderColor:colors.line}]}>{gps.busy?<ActivityIndicator color={colors.purple}/>:<Icon name="locate" color={colors.purple}/>}</Pressable>
    </View>
    <View style={styles.content}>
     <DeviceStatus/>
     <Pressable accessibilityRole="button" accessibilityLabel={t('لوين بدك تروح؟ ابحث عن وجهتك','Where are you going? Search for a destination')} onPress={choose} style={[styles.search,row,{backgroundColor:colors.surface,borderColor:colors.line}]}>
      <Icon name="search-outline" size={25} color={colors.purple}/><View style={{flex:1}}><Label large>{t('لوين بدك تروح؟','Where are you going?')}</Label>{!!draft.destination&&<Label muted>{draft.destination}</Label>}</View><Icon name={rtl?'chevron-back':'chevron-forward'} size={20}/>
     </Pressable>
     {(rideState.active||draft.destinationPoint)&&<Button icon="arrow-forward-outline" title={rideState.active?t('متابعة رحلتي الحالية','Continue my ride'):t('متابعة إلى نقطة الانطلاق','Continue to pickup')} onPress={openPickup}/>}
     <View style={[row,{gap:8}]}>
      <View style={{flex:1}}><Button secondary icon="folder-outline" title={t('العناوين المحفوظة','Saved addresses')} onPress={()=>router.push({pathname:'/location',params:{view:'saved'}})}/></View>
      <View style={{flex:1}}><Button secondary icon="time-outline" title={t('الرحلات السابقة','Past rides')} onPress={()=>router.push({pathname:'/cloud',params:{mode:'history'}})}/></View>
     </View>
    </View>
   </ScrollView>
  </View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 loading:{flex:1,justifyContent:'center',alignItems:'center'},
 frame:{flex:1,width:'100%',maxWidth:1000,alignSelf:'center'},
 header:{height:64,paddingHorizontal:16,alignItems:'center',gap:12},
 scroll:{paddingBottom:28},
 content:{width:'100%',maxWidth:640,alignSelf:'center',paddingHorizontal:16,gap:12},
 status:{position:'absolute',top:12,left:16,right:16,borderRadius:12,paddingVertical:7,paddingHorizontal:12,elevation:2},
 locate:{position:'absolute',bottom:12,left:16,width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center',elevation:3,boxShadow:'0px 2px 10px #00000018'},
 search:{minHeight:64,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderRadius:12,alignItems:'center',gap:12},
});
