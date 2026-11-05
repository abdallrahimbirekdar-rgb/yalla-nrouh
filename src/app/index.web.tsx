import {cloudCurrentToken,cloudMyRides} from '../cloud-api';
import {useRideState} from '../use-ride-state';
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Pressable,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {sameCoordinate} from '../geo';
import {pickupPosition,pickupPositionMessage} from '../pickup-position';
import {siteCurrentPosition} from '../site-bridge';
import {useCurrentPosition} from '../use-current-position';
import MapCanvas from '../map/MapCanvas';
import {AccountButton,AppMenu,Button,DeviceStatus,Icon,Label,useText,useTheme} from '../ui';
export default function Booking(){
 const {state,draft,setDraft,ready}=useApp();const auth=useAuth();const rideState=useRideState();const userId=auth.session?.user.id;const t=useText();const {colors,dark}=useTheme();const gps=useCurrentPosition(ready&&state.preferences.permissionsIntroSeen);const [preparing,setPreparing]=useState(false),[error,setError]=useState('');const rtl=state.language==='ar';const row={flexDirection:rtl?'row-reverse' as const:'row' as const};
 useEffect(()=>{const point=gps.camera?.point;if(!point)return;setDraft(previous=>{if(previous.pickupPoint&&sameCoordinate(previous.pickupPoint,point)&&previous.pickup===(state.language==='ar'?'موقعي الحالي':'My current location'))return previous;return {...previous,pickupPoint:point,pickup:state.language==='ar'?'موقعي الحالي':'My current location'}})},[gps.camera,setDraft,state.language]);
 useEffect(()=>{if(auth.recovery)router.replace('/account')},[auth.recovery]);
 useEffect(()=>{if(!userId)return;const check=()=>{void cloudCurrentToken().then(token=>cloudMyRides(token)).catch(()=>{})};check();const resume=(event:Event)=>{if((event as CustomEvent).detail?.active===true)check()};const visible=()=>{if(document.visibilityState==='visible')check()};window.addEventListener('yalla:native-visibility',resume);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('yalla:native-visibility',resume);document.removeEventListener('visibilitychange',visible)}},[userId]);
 function choose(){setError('');router.push({pathname:'/location',params:{target:'destination',focus:'1'}})}
 async function current(){const point=await gps.locate();if(point){setDraft(previous=>({...previous,pickupPoint:point,pickup:t('موقعي الحالي','My current location')}));setError('')}}
 async function next(){if(preparing)return;if(rideState.active){router.push('/cloud');return}if(!draft.destinationPoint){choose();return}setPreparing(true);setError('');try{const point=await pickupPosition(siteCurrentPosition);if(sameCoordinate(point,draft.destinationPoint)){setError(t('اختر وجهة مختلفة عن الانطلاق.','Choose a different destination.'));return}setDraft(previous=>({...previous,pickupPoint:point,pickup:t('موقعي الحالي','My current location')}));router.push('/review')}catch(e){setError(pickupPositionMessage(e,state.language==='ar'))}finally{setPreparing(false)}}

 if(auth.session&&(!auth.rolesReady||auth.driver&&!auth.admin))return <SafeAreaView style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background}}><ActivityIndicator color={colors.purple}/>{auth.problem&&<Button title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}</SafeAreaView>;
 const status=gps.busy?t('جارٍ تحديد موقعك…','Finding your location…'):gps.failure==='permission'?t('اسمح بالموقع لتحديد الانطلاق','Allow location to set pickup'):gps.failure==='accuracy'?t('فعّل الموقع الدقيق من أذونات التطبيق','Turn on precise location in app settings'):gps.failure==='services'?t('فعّل خدمة الموقع في الهاتف','Turn on phone location'):gps.failure?t('تعذر تحديد الموقع؛ اضغط زر موقعي للمحاولة','Location failed. Tap My location to retry'):t('اختر وجهتك، والباقي علينا','Choose your destination');
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><View style={{flex:1,width:'100%',maxWidth:1000,alignSelf:'center'}}>
  <View style={[styles.header,row,{backgroundColor:colors.background}]}><AppMenu/><Image source={dark?require('../../assets/logo-header-dark.png'):require('../../assets/logo-approved.png')} accessibilityLabel="يلا نروح" resizeMode="contain" style={{width:90,height:48,flex:1}}/><AccountButton/></View>
  <View style={{flex:1,minHeight:260,backgroundColor:colors.surface}}>
   <MapCanvas compact readOnly minMapHeight={260} cameraTarget={gps.camera} point={gps.camera?.point??null} onChange={()=>{}}/>
   {(gps.busy||gps.failure)&&<View pointerEvents="none" style={[styles.status,{backgroundColor:colors.background}]}><Label muted>{status}</Label></View>}
   <View pointerEvents="box-none" style={styles.bottom}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('استخدام موقعي الحالي','Use my current location')} onPress={()=>void current()} disabled={gps.busy} style={[styles.locate,{backgroundColor:colors.background,borderColor:colors.line}]}>{gps.busy?<ActivityIndicator color={colors.purple}/>:<Icon name="locate" color={colors.purple}/>}</Pressable>
    <View style={[styles.searchCard,{backgroundColor:colors.background,borderColor:colors.line}]}>
     <DeviceStatus/>
     <Pressable accessibilityRole="button" accessibilityLabel={t('لوين بدك تروح؟ ابحث عن وجهتك','Where are you going? Search for a destination')} onPress={choose} style={[styles.search,row,{backgroundColor:colors.surface,borderColor:colors.line}]}>
      <Icon name="search-outline" size={25} color={colors.purple}/><View style={{flex:1,gap:2}}><Label large>{t('لوين بدك تروح؟','Where are you going?')}</Label>{!!draft.destination&&<Label muted>{draft.destination}</Label>}</View><Icon name={rtl?'chevron-back':'chevron-forward'} size={20}/>
     </Pressable>
     {(rideState.active||draft.destinationPoint)&&<Button icon="arrow-forward-outline" disabled={preparing} title={preparing?t('جارٍ تحديد الانطلاق…','Finding pickup…'):rideState.active?t('متابعة رحلتي الحالية','Continue my ride'):t('عرض الطريق والأجرة','View route and fare')} onPress={()=>void next()}/>}
     {!!error&&<View accessibilityRole="alert"><Label>{error}</Label></View>}
    </View>
   </View>
  </View>
 </View></SafeAreaView>;
}
const styles=StyleSheet.create({
 header:{height:64,paddingHorizontal:16,alignItems:'center',gap:12},
 status:{position:'absolute',top:12,left:16,right:16,borderRadius:12,paddingVertical:7,paddingHorizontal:12,elevation:2},
 bottom:{position:'absolute',left:16,right:16,bottom:24,gap:12},
 locate:{alignSelf:'flex-start',width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center',elevation:3,boxShadow:'0px 2px 10px #00000018'},
 searchCard:{borderWidth:1,borderRadius:18,padding:12,gap:10,elevation:4,boxShadow:'0px 4px 20px #00000018'},
 search:{minHeight:64,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderRadius:12,alignItems:'center',gap:12}
});
