import {foregroundFix} from './foreground-fix';
import Constants from 'expo-constants';
import {requireOptionalNativeModule} from 'expo';
import {createPositionJobs} from './position-jobs';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Linking,Platform,View,Text,Pressable} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import * as Location from 'expo-location';
import {enableLocalAlerts,notifyLocal} from './alerts';

import {SITE_URL,isSiteUrl,externalLink,buildVersion,readShellMessage,bootstrapScript,resultScript,locationScript} from './site-shell-policy';
const nativeNavigation=Platform.OS==='android'?requireOptionalNativeModule<{
 setScreenAwake:(active:boolean)=>Promise<void>;
 open:(latitude:number,longitude:number,label:string,arabic:boolean)=>Promise<boolean>;
}>('YallaDriverNavigation'):null;
export default function SiteShell(){
 const [language,setLanguage]=useState('ar'),[dark,setDark]=useState(false);
 const t=(ar:string,en:string)=>language==='ar'?ar:en;const colors={background:dark?'#171b20':'#ffffff',purple:'#d67749',ink:dark?'#ffffff':'#202529'};
 const web=useRef<WebView>(null);
 const Label=({children,muted:_muted}:{children:React.ReactNode;muted?:boolean})=><Text style={{color:colors.ink,fontSize:16,textAlign:'center'}}>{children}</Text>;
 const Button=({title,onPress,secondary:_secondary}:{title:string;onPress:()=>void;secondary?:boolean})=><Pressable accessibilityRole="button" onPress={onPress} style={{padding:16,backgroundColor:colors.purple,borderRadius:12}}><Text style={{color:'#ffffff',textAlign:'center'}}>{title}</Text></Pressable>;
 const [url,setUrl]=useState(()=>SITE_URL+'?app=android&launch='+Date.now());
 const [failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[available,setAvailable]=useState(false),[notice,setNotice]=useState('');
 const permissionRequest=useRef<Promise<Location.LocationPermissionResponse>|null>(null);
 // Ask Android for foreground location once at first launch. The embedded
 // website intentionally hides its own permission dialog, so without this
 // step a fresh installation can never auto-centre until a manual tap.
 const requestLaunchPermission=async()=>{
  let permission=await Location.getForegroundPermissionsAsync();
  if(!permission.granted&&permission.canAskAgain){
   if(!permissionRequest.current)permissionRequest.current=Location.requestForegroundPermissionsAsync().finally(()=>{permissionRequest.current=null});
   permission=await permissionRequest.current;
  }
  if(alive.current){
   web.current?.injectJavaScript(`window.__YALLA_NATIVE_LOCATION_GRANTED__=${permission.granted};window.dispatchEvent(new CustomEvent('yalla:native-location-permission',{detail:{granted:${permission.granted}}}));true;`);
  }
  return permission;
 };
 const gpsJobs=useRef<ReturnType<typeof createPositionJobs<Location.LocationObject>>|null>(null);
 const awakeRequest=useRef<string|null>(null);
 const keepNavigationScreenAwake=(id:string|null)=>{
  if(awakeRequest.current===id)return;
  awakeRequest.current=id;
  void nativeNavigation?.setScreenAwake(id!==null).catch(()=>{});
 };
 const driverWatch=useRef<{id:string;remove?:()=>void}|null>(null);
 const stopDriverWatch=()=>{
  const watch=driverWatch.current;
  driverWatch.current=null;
  watch?.remove?.();
 };
 async function startDriverWatch(id:string,askPermission:boolean){
  stopDriverWatch();
  if(AppState.currentState!=='active')return;
  const watch:{id:string;remove?:()=>void}={id};
  driverWatch.current=watch;
  const current=()=>alive.current&&driverWatch.current===watch&&AppState.currentState==='active';
  const report=(code:string)=>{if(current())web.current?.injectJavaScript(locationScript(id,null,code))};
  try{
   const permission=askPermission?await requestLaunchPermission():await Location.getForegroundPermissionsAsync();
   if(!current())return;
   if(!permission.granted){report('permission');stopDriverWatch();return}
   if(permission.android?.accuracy==='coarse'){report('accuracy');stopDriverWatch();return}
   if(!await Location.hasServicesEnabledAsync()){report('services');if(current())stopDriverWatch();return}
   if(!current())return;
   const subscription=await Location.watchPositionAsync({
    accuracy:Location.Accuracy.High,timeInterval:1000,distanceInterval:0,mayShowUserSettingsDialog:false,
   },fix=>{
    if(!current())return;
    const {latitude,longitude,accuracy}=fix.coords;
    web.current?.injectJavaScript(locationScript(id,{latitude,longitude},undefined,{accuracy,time:fix.timestamp}));
   },()=>report('position'));
   if(current())watch.remove=()=>subscription.remove();
   else subscription.remove();
  }catch{
   if(current()){report('position');stopDriverWatch()}
  }
 }
 const gpsAbort=useRef(new AbortController());
 if(!gpsJobs.current)gpsJobs.current=createPositionJobs(precise=>foregroundFix<Location.LocationObject>((next,error)=>Location.watchPositionAsync({accuracy:precise?Location.Accuracy.High:Location.Accuracy.Balanced,timeInterval:1000,distanceInterval:0,mayShowUserSettingsDialog:false},next,error),fix=>Number.isFinite(fix.coords.latitude)&&Number.isFinite(fix.coords.longitude)&&fix.timestamp>=Date.now()-30000&&typeof fix.coords.accuracy==='number'&&fix.coords.accuracy<=(precise?50:250),gpsAbort.current.signal),21000);
 const safe=useRef(false),canGoBack=useRef(false),loadedVersion=useRef<string|null>(null),checking=useRef(false),alive=useRef(true),checkAbort=useRef<AbortController|null>(null);
 const navigationTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const finishLoading=()=>{if(navigationTimer.current)clearTimeout(navigationTimer.current);navigationTimer.current=null;setLoading(false)};
 const gpsStatus=async(stage:string)=>{const [permission,providers]=await Promise.all([Location.getForegroundPermissionsAsync(),Location.getProviderStatusAsync()]);const value=JSON.stringify({version:Constants.expoConfig?.version,stage,permission:permission.granted,precise:permission.android?.accuracy!=='coarse',services:providers.locationServicesEnabled,gps:providers.gpsAvailable,network:providers.networkAvailable});if(alive.current)web.current?.injectJavaScript(`window.__YALLA_GPS_STATUS__=${value};window.dispatchEvent(new CustomEvent('yalla:gps-status',{detail:${value}}));true;`);return {permission,providers}};
 function refresh(){if(!safe.current){setNotice(t('احفظ بياناتك وأكمل الرحلة، ثم حدّث العرض من الصفحة الرئيسية.','Save your work and finish the ride, then refresh from the home page.'));return}setNotice('');setAvailable(false);setFailed(false);setLoading(true);safe.current=false;setUrl(SITE_URL+'?app=android&launch='+Date.now())}
 useEffect(()=>{alive.current=true;void requestLaunchPermission().catch(()=>{});return()=>{alive.current=false;keepNavigationScreenAwake(null);stopDriverWatch();gpsAbort.current.abort();checkAbort.current?.abort();if(navigationTimer.current)clearTimeout(navigationTimer.current)}},[]);
 useEffect(()=>{
  const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(failed||loading)return false;web.current?.injectJavaScript("if(window.dispatchEvent(new CustomEvent('yalla:native-back',{cancelable:true}))&&window.dispatchEvent(new CustomEvent('yalla:native-back-default',{cancelable:true}))){window.ReactNativeWebView.postMessage(JSON.stringify({type:'back-default'}));}true;");return true});
  return()=>listener.remove();
 },[failed,loading]);
 useEffect(()=>{
  const listener=AppState.addEventListener('change',async value=>{
   if(value!=='active'){keepNavigationScreenAwake(null);stopDriverWatch()}
   if(value==='background')gpsAbort.current.abort();else if(value==='active'&&gpsAbort.current.signal.aborted)gpsAbort.current=new AbortController();
   web.current?.injectJavaScript(`window.__YALLA_NATIVE_ACTIVE__=${value==='active'};window.dispatchEvent(new CustomEvent('yalla:native-visibility',{detail:{active:window.__YALLA_NATIVE_ACTIVE__}}));true;`);
   if(value!=='active'||checking.current||!loadedVersion.current)return;
   checking.current=true;const controller=new AbortController();checkAbort.current=controller;const timer=setTimeout(()=>controller.abort(),8000);
   try{const response=await fetch(SITE_URL+'version.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!response.ok)return;const next=buildVersion((await response.json()).version);if(alive.current&&next&&next!==loadedVersion.current)setAvailable(true)}catch{}finally{clearTimeout(timer);checking.current=false}
  });return()=>listener.remove();
 },[]);
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
  {(available||notice!=='')&&<View style={{padding:10,gap:8}}><Label muted>{notice||t('تتوفر نسخة جديدة من الموقع.','A new website version is ready.')}</Label>{available&&<Button secondary title={t('تحديث العرض','Refresh page')} onPress={refresh}/>}</View>}
  <WebView ref={web} source={{uri:url}} style={{flex:1,backgroundColor:colors.background}}
   originWhitelist={['https://abdallrahimbirekdar-rgb.github.io']}
   javaScriptEnabled domStorageEnabled geolocationEnabled={false} cacheEnabled cacheMode="LOAD_DEFAULT" mixedContentMode="never" allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
   setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
   onShouldStartLoadWithRequest={request=>{if(request.isTopFrame===false)return true;if(isSiteUrl(request.url))return true;if(externalLink(request.url))void Linking.openURL(request.url).catch(()=>setNotice(t('تعذر فتح الرابط الخارجي.','Could not open the link.')));return false}}
   onOpenWindow={event=>{const target=event.nativeEvent.targetUrl;if(externalLink(target))void Linking.openURL(target).catch(()=>setNotice(t('تعذر فتح الرابط.','Could not open the link.')))}}
   onNavigationStateChange={navigation=>{canGoBack.current=navigation.canGoBack;if(!navigation.loading)finishLoading()}}
   onLoadStart={()=>{keepNavigationScreenAwake(null);stopDriverWatch();setLoading(true);setFailed(false);if(navigationTimer.current)clearTimeout(navigationTimer.current);navigationTimer.current=setTimeout(()=>{if(alive.current){setLoading(false);setFailed(true)}},30000)}} onLoadEnd={finishLoading}
   onError={()=>{setLoading(false);setFailed(true)}} onRenderProcessGone={()=>{setLoading(false);setFailed(true)}} onHttpError={event=>{if(event.nativeEvent.url===url&&event.nativeEvent.statusCode>=400){setLoading(false);setFailed(true)}}}
   onMessage={event=>{
    if(!isSiteUrl(event.nativeEvent.url))return;const message=readShellMessage(event.nativeEvent.data);if(!message)return;
    if(message.type==='status'){finishLoading();setFailed(false);safe.current=message.safeToReload;canGoBack.current=message.canGoBack;if(message.language)setLanguage(message.language);if(message.theme)setDark(message.theme==='dark');return}
    if(message.type==='refresh'){refresh();return}
    if(message.type==='back-default'){if(canGoBack.current)web.current?.goBack();else BackHandler.exitApp();return}
    if(message.type==='location-settings'){void Linking.openSettings().then(()=>web.current?.injectJavaScript(resultScript(message.id,true))).catch(()=>web.current?.injectJavaScript(resultScript(message.id,false)));return}
    if(message.type==='google-navigation'){
     const reply=(ok:boolean)=>{if(alive.current)web.current?.injectJavaScript(resultScript(message.id,ok))};
     if(!nativeNavigation||AppState.currentState!=='active'){reply(false);return}
     void nativeNavigation.open(message.latitude,message.longitude,message.label,message.arabic).then(reply,()=>reply(false));
     return;
    }
    if(message.type==='driver-location-start'){
     if(AppState.currentState==='active')keepNavigationScreenAwake(message.id);
     void startDriverWatch(message.id,message.askPermission);return;
    }
    if(message.type==='driver-location-stop'){if(driverWatch.current?.id===message.id)stopDriverWatch();if(awakeRequest.current===message.id)keepNavigationScreenAwake(null);return}
    if(message.type==='location'){
     // Only requests from our approved HTTPS site can reach this native foreground GPS bridge.
     void (async()=>{
      let delivered=false;
      const send=(point:{latitude:number;longitude:number}|null,error?:string,fix?:{accuracy:number|null;time:number})=>{
       if(!alive.current||!web.current||AppState.currentState==='background')return;
       web.current.injectJavaScript(locationScript(message.id,point,error,fix));
       if(point)delivered=true;
      };
      try{
       if(AppState.currentState==='background'){send(null,'position');return}
       let permission=await Location.getForegroundPermissionsAsync();
       if(!permission.granted&&message.askPermission){permission=await requestLaunchPermission();}
       if(!permission.granted){send(null,'permission');return}
       let providers=await Location.getProviderStatusAsync();
       // Permission and Android's high-accuracy service are separate settings.
       // Only a deliberate tap may show the service-enablement dialog.
       if(message.askPermission&&(!providers.locationServicesEnabled||providers.networkAvailable===false)){try{await Location.enableNetworkProviderAsync()}catch{/* Satellite GPS may still be available. */}providers=await Location.getProviderStatusAsync()}
       await gpsStatus('locating');
       if(!providers.locationServicesEnabled){send(null,'services');return}
       if(permission.android?.accuracy==='coarse'){send(null,'accuracy');return}
       // Bounded last-known lookup: even a stalled cache read must not hold
       // the first GPS fix. Ride tracking only accepts measured accuracy.
       const track=message.track===true;
       const allowed=(position:Location.LocationObject)=>!track||(typeof position.coords.accuracy==='number'&&position.coords.accuracy<=50);
       const transmit=(position:Location.LocationObject)=>send(
        {latitude:position.coords.latitude,longitude:position.coords.longitude},
        undefined,{accuracy:position.coords.accuracy,time:position.timestamp}
       );
       let cacheTimer:ReturnType<typeof setTimeout>|undefined;
       let cached:Location.LocationObject|null=null;
       try{
        cached=await Promise.race([
         Location.getLastKnownPositionAsync({maxAge:track?30000:60000,requiredAccuracy:track?50:250}).catch(()=>null),
         new Promise<null>(resolve=>{cacheTimer=setTimeout(()=>resolve(null),1200)}),
        ]);
       }finally{if(cacheTimer)clearTimeout(cacheTimer)}
       if(cached&&allowed(cached))transmit(cached);
       try{
        const fresh=await gpsJobs.current!(track);
        if(allowed(fresh))transmit(fresh);
        else if(!delivered)send(null,'accuracy');
        await gpsStatus('found');
       }catch(error){
        if(!delivered){const code=error instanceof Error&&error.message==='timeout'?'timeout':'position';send(null,code);await gpsStatus(code)}
       }
      }catch{if(!delivered)send(null,'position')}
     })();
     return;
    }
    if(message.type==='alerts-enable'||message.type==='notify'){const task=message.type==='alerts-enable'?enableLocalAlerts():notifyLocal(message.title,message.body).then(()=>true);void task.then(ok=>{if(alive.current)web.current?.injectJavaScript(resultScript(message.id,ok))}).catch(()=>{if(alive.current)web.current?.injectJavaScript(resultScript(message.id,false))});return}
    loadedVersion.current=message.version;
    void gpsStatus('ready').catch(()=>{});
    void Location.getForegroundPermissionsAsync().then(permission=>{if(alive.current)web.current?.injectJavaScript(bootstrapScript(message.id,null,permission.granted,true,!!nativeNavigation))}).catch(()=>{if(alive.current)web.current?.injectJavaScript(bootstrapScript(message.id,null,false,true,!!nativeNavigation))});
   }}/>
  {loading&&!failed&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:colors.background,justifyContent:'center',alignItems:'center',gap:12}}><ActivityIndicator color={colors.purple}/><Label>{t('جارٍ فتح يلا نروح…','Opening Yalla Nrouh…')}</Label></View>}
  {failed&&<View style={{position:'absolute',left:0,right:0,top:0,bottom:0,padding:24,backgroundColor:colors.background,justifyContent:'center',gap:16}}><Label>{t('تعذر فتح الموقع. تحقق من الإنترنت ثم أعد المحاولة.','Could not open the website. Check your internet and try again.')}</Label><Label muted>{t('بياناتك المحفوظة تبقى على الجهاز.','Your saved data stays on this device.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={()=>{setFailed(false);setLoading(true);web.current?.reload()}}/></View>}
 </SafeAreaView>;
}
