import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,BackHandler,Linking,Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import {readRidePushTarget,type RidePushTarget} from '../ride-push-target';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {readLocalAlerts,requestLocalAlerts,notifyLocal} from '../alerts';
import Storage from 'expo-sqlite/kv-store';
import {setupPermission} from './permission-setup';
import LaunchScreen from './LaunchScreen';
import {acceptableFix,awaitFreshFix,deadlineOr,firstUsableMapFix,GpsTaskPool} from './gps';
import {SITE,websiteEntryUrl,bootstrapScript,diagnosticScript,eventScript,autoFixScript,externalTarget,positionScript,readWebMessage,trustedSite,trustedWebMessage,
 type WebMessage,type PositionResponse} from './bridge';

const ridePushConfigured=Constants.expoConfig?.extra?.ridePushConfigured===true;
async function deviceRidePushToken(){
 if(!(await readLocalAlerts()).granted)return null;
 await Notifications.setNotificationChannelAsync('ride-offers',{name:'Ride offers',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
 await Notifications.setNotificationChannelAsync('rides',{name:'Ride updates',importance:Notifications.AndroidImportance.DEFAULT,sound:'default'});
 const token=await Notifications.getDevicePushTokenAsync();
 return token.type==='android'&&typeof token.data==='string'?token.data:null;
}
let alertPermissionTask:Promise<boolean>|null=null;
function requestAlertPermission(){
 if(alertPermissionTask)return alertPermissionTask;
 alertPermissionTask=(async()=>{
  const permission=await readLocalAlerts();
  return permission.granted||(permission.canAskAgain&&(await requestLocalAlerts()).granted);
 })().finally(()=>{alertPermissionTask=null});
 return alertPermissionTask;
}

// Fresh native app: it owns ONLY Android foreground location and the live website.
// No legacy SQLite hydration, native router screen, cached GPS controller or
// second WebView geolocation permission. The website owns accounts, fares and trips.
class ForegroundLocation {
 private permissionTask:Promise<Location.LocationPermissionResponse>|null=null;

 async permission(request:boolean):Promise<Location.LocationPermissionResponse>{
  if(this.permissionTask)return this.permissionTask;
  if(!request)return Location.getForegroundPermissionsAsync();
  const task=setupPermission(Storage,'android-permission-location-v1',Location.getForegroundPermissionsAsync,Location.requestForegroundPermissionsAsync);
  this.permissionTask=task;
  void task.finally(()=>{if(this.permissionTask===task)this.permissionTask=null}).catch(()=>{});
  return task;
 }
 async status(stage:string){
  const [permission,providers]=await Promise.all([
   Location.getForegroundPermissionsAsync(),
   Location.getProviderStatusAsync(),
  ]);
  return {version:Constants.expoConfig?.version||'1.0.0',stage,
   permission:permission.granted,precise:permission.granted&&permission.android?.accuracy!=='coarse',
   services:providers.locationServicesEnabled,gps:providers.gpsAvailable,network:providers.networkAvailable};
 }
 async locate(ask:boolean,track:boolean,signal:AbortSignal,
  preview:(fix:Location.LocationObject)=>void):Promise<Location.LocationObject>{
  const permission=await this.permission(ask);
  if(!permission.granted)throw new Error('permission');
  if(permission.android?.accuracy==='coarse')throw new Error('accuracy');
  if(!await Location.hasServicesEnabledAsync())throw new Error('services');
  if(signal.aborted)throw new Error('GPS_CANCELLED');
  const accuracy=track?50:250;
  const subscribe=(mode:Location.Accuracy,watchSignal:AbortSignal)=>
   awaitFreshFix<Location.LocationObject>(
    (next,error)=>Location.watchPositionAsync({
      accuracy:mode,timeInterval:1000,distanceInterval:0,
      mayShowUserSettingsDialog:false,
    },next,error),
    fix=>acceptableFix(fix,accuracy,30000),
    20000,watchSignal,
   );
  if(track)return subscribe(Location.Accuracy.High,signal);

  let finished=false;
  // Check the recent cache while both providers acquire a fresh map fix.
  void deadlineOr(
   Location.getLastKnownPositionAsync({maxAge:20000,requiredAccuracy:accuracy}).catch(()=>null),
   900,null,
  ).then(last=>{
   if(last&&!finished&&!signal.aborted&&acceptableFix(last,accuracy,20000))preview(last);
  });
  try{
   return await firstUsableMapFix((mode,watchSignal)=>subscribe(
    mode==='high'?Location.Accuracy.High:Location.Accuracy.Balanced,watchSignal,
   ),signal);
  }finally{finished=true}
 }
}
type Run={controller:AbortController;id:string};
type ShareEvent={rideId:string;active:boolean;latitude?:number;longitude?:number;accuracy?:number;time?:number};
type DriverStream={id:string;active:boolean;subscription:Location.LocationSubscription|null};
const screenModule=requireOptionalNativeModule<{setScreenAwake:(active:boolean)=>Promise<void>;
 speakDirection:(text:string,language:'ar'|'en')=>Promise<'started'|'voice-unavailable'|'playback'>;
 openVoiceSetup:()=>Promise<boolean>;
 startRideSharing:(ride:string,secret:string,arabic:boolean)=>Promise<boolean>;
 stopRideSharing:(ride:string)=>Promise<void>;
 rideSharingStatus:()=>Promise<string|null>;
 openRideMaps:(latitude:number,longitude:number,adjacent:boolean,provider:'google'|'osmand',
  ride:string|null,accessToken:string|null,arabic:boolean)=>Promise<boolean>;
 stopOsmAndPassenger:()=>Promise<void>;
 requestOsmAndMapAccess:()=>Promise<boolean>;
 addListener:(event:'rideSharing',callback:(event:ShareEvent)=>void)=>{remove:()=>void};
 stopDirection:()=>Promise<void>}>('YallaDriverNavigation');
const supportsSharing=typeof screenModule?.startRideSharing==='function';
const nativeOsmAndPassenger=typeof screenModule?.requestOsmAndMapAccess==='function';
const stopOsmAndPassenger=()=>{if(nativeOsmAndPassenger)void screenModule?.stopOsmAndPassenger().catch(()=>{});};
const nativeDriverSpeech=typeof screenModule?.speakDirection==='function';
const nativeVoiceSetup=typeof screenModule?.openVoiceSetup==='function';
const stopDriverSpeech=()=>{if(nativeDriverSpeech)void screenModule?.stopDirection().catch(()=>{});};
const btn={paddingVertical:13,paddingHorizontal:18,backgroundColor:'#d67749',borderRadius:12} as const;
const websiteEntryKey='android-website-entry-v1';
const websiteVersion=(v:unknown):string|null=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v)?v:null;
export default function FreshAndroid(){
 const web=useRef<WebView>(null);
 const sharing=useRef<string|null>(null),shareFix=useRef<Location.LocationObject|null>(null);
 const documentUrl=useRef('');
 const engine=useRef(new ForegroundLocation()).current;
 const active=useRef(true),runs=useRef(new Map<string,Run>()),canGoBack=useRef(false);
 const gpsPool=useRef(new GpsTaskPool<Location.LocationObject>()).current;
  const driverStream=useRef<DriverStream|null>(null),screenAwake=useRef(false);
 const autoStarted=useRef(false),locationRequestedByPage=useRef(false);
 const safeToReload=useRef(false),websiteRevision=useRef<string|null>(null);
 const [uri,setUri]=useState(()=>{
  try{return websiteEntryUrl(Storage.getItemSync(websiteEntryKey))}
  catch{return websiteEntryUrl()}
 });
 const pendingEntry=useRef<string|null>(null),bootStarted=useRef(false);
 const updateCheck=useRef<AbortController|null>(null);
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[newWeb,setNewWeb]=useState(false);
 const [webSession,setWebSession]=useState(0),[rendererLost,setRendererLost]=useState(false);
 const pageReady=useRef(false),wasBackground=useRef(false),resumeIndex=useRef(0),pendingResume=useRef<string|null>(null);
 const readyTimer=useRef<ReturnType<typeof setTimeout>|null>(null),resumeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [language,setLanguage]=useState<'ar'|'en'>('ar');
 const [notice,setNotice]=useState('');
 const [colorMode,setColorMode]=useState<'system'|'light'|'dark'>('system');
 const ar=language==='ar';
 const text=useCallback((arText:string,enText:string)=>ar?arText:enText,[ar]);
 const background=colorMode==='dark'?'#081b35':'#edf3fb';
 const foreground=colorMode==='dark'?'#f0f6ff':'#082648';
 const clearReadyTimer=useCallback(()=>{if(readyTimer.current){clearTimeout(readyTimer.current);readyTimer.current=null}},[]);
 const clearResumeTimer=useCallback(()=>{if(resumeTimer.current){clearTimeout(resumeTimer.current);resumeTimer.current=null}},[]);
 const beginPageLoad=useCallback(()=>{
  clearReadyTimer();pageReady.current=false;
  readyTimer.current=setTimeout(()=>{if(active.current&&!pageReady.current){setLoading(false);setFailed(true)}},30000);
 },[clearReadyTimer]);
 // A dead WebView renderer cannot be reloaded. Rebuild only on user request.
 const reopenWebsite=useCallback(()=>{
  clearReadyTimer();clearResumeTimer();pendingResume.current=null;
  pageReady.current=false;safeToReload.current=false;canGoBack.current=false;documentUrl.current='';
  setNotice('');setNewWeb(false);setFailed(false);setLoading(true);setRendererLost(false);
  websiteRevision.current=null;
  updateCheck.current?.abort();
  updateCheck.current=null;
  pendingEntry.current=String(Date.now());
  setUri(websiteEntryUrl(pendingEntry.current));
  setWebSession(value=>value+1);
 },[clearReadyTimer,clearResumeTimer]);
 const inject=useCallback((script:string)=>{
  if(active.current)web.current?.injectJavaScript(script);
 },[]);
 const pendingPushTarget=useRef<RidePushTarget|null>(null);
 const pushTap=useCallback((response:Notifications.NotificationResponse)=>{
  const target=readRidePushTarget(response.notification.request.content.data);
  if(!target)return;
  Notifications.clearLastNotificationResponse();
  if(pageReady.current)inject(eventScript('yalla:ride-push-tap',target));
  else pendingPushTarget.current=target;
 },[inject]);
 useEffect(()=>{
  const subscription=Notifications.addNotificationResponseReceivedListener(pushTap);
  const response=Notifications.getLastNotificationResponse();
  if(response)pushTap(response);
  return()=>subscription.remove();
 },[pushTap]);
 const syncPermission=useCallback(async(stage:string)=>{
  try{
   const state=await engine.status(stage);
   inject(diagnosticScript(state));
   inject('window.__YALLA_NATIVE_LOCATION_GRANTED__='+JSON.stringify(state.permission)+';'+eventScript('yalla:native-location-permission',{granted:state.permission}));
  }catch{/* Settings must still open if GPS providers cannot be queried. */}
 },[engine,inject]);
 const boot=useCallback(async()=>{
  try{const permission=await engine.permission(true);
   inject(eventScript('yalla:native-location-permission',{granted:permission.granted}));
  }catch{/* The website still offers manual pickup. */}
 },[engine,inject]);
 const setScreenAwake=useCallback((awake:boolean)=>{
   if(screenAwake.current===awake)return;
   screenAwake.current=awake;
   // The local native module adds FLAG_KEEP_SCREEN_ON only during navigation.
   void Promise.resolve().then(()=>screenModule?.setScreenAwake(awake)).catch(()=>{});
  },[]);
  const stopDriverStream=useCallback((id?:string)=>{
   const stream=driverStream.current;
   if(!stream||(id&&stream.id!==id))return;
   stream.active=false;
   stream.subscription?.remove();
   driverStream.current=null;
   setScreenAwake(false);
  },[setScreenAwake]);
  useEffect(()=>{const requests=runs.current;active.current=true;return()=>{
  active.current=false;updateCheck.current?.abort();updateCheck.current=null;clearReadyTimer();clearResumeTimer();stopDriverSpeech();stopDriverStream();for(const task of requests.values())task.controller.abort();requests.clear();
 }},[stopDriverStream,clearReadyTimer,clearResumeTimer]);
 const refresh=useCallback(()=>{
  if(!safeToReload.current){
   setNotice(text('أكمل تعديلك أو رحلتك أولًا ثم حدّث من الصفحة الرئيسية.','Finish your edit or ride, then refresh at home.'));
   return;
  }
  reopenWebsite();
 },[reopenWebsite,text]); // no automatic reset of drafts or website storage
 const checkWebUpdate=useCallback(async()=>{
  const revision=websiteRevision.current;
  if(!revision||updateCheck.current)return;
  const controller=new AbortController();
  updateCheck.current=controller;
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch(SITE+'version.json?check='+Date.now(),{cache:'no-store',signal:controller.signal});
   if(!response.ok)return;
   const next=websiteVersion((await response.json()).version);
   if(next&&revision===websiteRevision.current&&active.current&&!controller.signal.aborted)setNewWeb(next!==revision);
  }catch{}finally{clearTimeout(timer);if(updateCheck.current===controller)updateCheck.current=null}
 },[]);
 useEffect(()=>{
  const handle=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(failed)return false;
   inject("if(window.dispatchEvent(new CustomEvent('yalla:native-back',{cancelable:true}))){window.ReactNativeWebView.postMessage(JSON.stringify({type:'back-default'}))};true;");
   return true;
  });
  const state=AppState.addEventListener('change',value=>{
   // Android permission sheets can briefly mark the activity inactive.
   // Cancel only on actual backgrounding so the first GPS request survives consent.
   if(value==='background'){wasBackground.current=true;pendingResume.current=null;clearResumeTimer();stopDriverSpeech();stopDriverStream();autoStarted.current=false;locationRequestedByPage.current=false;for(const task of runs.current.values()){inject(positionScript({id:task.id,point:null,error:'timeout'}));task.controller.abort()}inject(eventScript('yalla:native-visibility',{active:false}));return}
   if(value==='active'){
    inject(eventScript('yalla:native-visibility',{active:true}));
    if(wasBackground.current&&pageReady.current){
     const id='resume-'+(++resumeIndex.current);
     pendingResume.current=id;clearResumeTimer();
     // A compositor-only blank screen can recover after a harmless repaint.
     // A silent renderer displays manual recovery; never auto-reload a live ride.
     inject("window.ReactNativeWebView?.postMessage(JSON.stringify({type:'host-alive',id:"+JSON.stringify(id)+"}));if(document.body){document.body.style.transform='translateZ(0)';requestAnimationFrame(function(){document.body.style.transform=''})}true;");
     resumeTimer.current=setTimeout(()=>{if(active.current&&pendingResume.current===id){pendingResume.current=null;setLoading(false);setFailed(true)}},9000);
    }
    wasBackground.current=false;
    void syncPermission('resumed');
    void checkWebUpdate();
   }
  });
  return()=>{handle.remove();state.remove()};
 },[failed,inject,syncPermission,checkWebUpdate,stopDriverStream,clearResumeTimer]);
 const respond=useCallback((reply:PositionResponse)=>{
  inject(positionScript(reply));
 },[inject]);
 const locate=useCallback(async(message:Extract<WebMessage,{type:'location'}>)=>{
  runs.current.get(message.id)?.controller.abort();
  const controller=new AbortController();
  const task:Run={controller,id:message.id};
  runs.current.set(message.id,task);
  let delivered=false;
  const send=(fix:Location.LocationObject)=>{
   if(controller.signal.aborted||!active.current||AppState.currentState==='background')return;
   delivered=true;
   const point={latitude:fix.coords.latitude,longitude:fix.coords.longitude};
   // The startup fix is independent of website -> native postMessage.
   // Save it on window before firing the event, so late website mounts recover it.
   const accuracy=fix.coords.accuracy??undefined;
   if(message.id==='auto-location')inject(autoFixScript(point,fix.timestamp,accuracy));
   respond({id:message.id,point,fix:accuracy===undefined?undefined:{accuracy,time:fix.timestamp}});
  };
  void syncPermission('locating');
  try{
   const fix=await gpsPool.request(message.track?'track':'map',controller.signal,send,(signal,preview)=>{
    if(!sharing.current)return engine.locate(message.askPermission,message.track,signal,preview);
    const maximum=message.track?50:250;
    if(acceptableFix(shareFix.current,maximum,5000))return Promise.resolve(shareFix.current!);
    return awaitFreshFix<Location.LocationObject>(async next=>screenModule!.addListener('rideSharing',()=>{
     if(shareFix.current)next(shareFix.current);
    }),value=>acceptableFix(value,maximum,5000),18000,signal);
   });
   send(fix);void syncPermission('found');
  }catch(error){
   if(!controller.signal.aborted&&!delivered){
    const reason=error instanceof Error?error.message:'position';
    const code:PositionResponse['error']=
     reason==='permission'||reason==='accuracy'||reason==='services'?reason:
     reason==='GPS_TIMEOUT'?'timeout':'position';
    respond({id:message.id,point:null,error:code});
    void syncPermission(code||'position');
   }
  }finally{if(runs.current.get(message.id)===task)runs.current.delete(message.id)}
 },[engine,gpsPool,inject,respond,syncPermission]);
 const startDriverStream=useCallback(async(message:Extract<WebMessage,{type:'driver-location-start'}>)=>{
   stopDriverStream();
   const stream:DriverStream={id:message.id,active:true,subscription:null};
   driverStream.current=stream;
   try{
    const permission=await engine.permission(message.askPermission);
    if(!permission.granted)throw new Error('permission');
    if(permission.android?.accuracy==='coarse')throw new Error('accuracy');
    if(!await Location.hasServicesEnabledAsync())throw new Error('services');
    if(!stream.active||AppState.currentState==='background')return;
    if(sharing.current){setScreenAwake(true);return}
    const sub=await Location.watchPositionAsync({
     accuracy:Location.Accuracy.BestForNavigation,
     timeInterval:1000,distanceInterval:0,mayShowUserSettingsDialog:false,
    },fix=>{
     if(!stream.active||driverStream.current!==stream||AppState.currentState==='background')return;
     if(!acceptableFix(fix,250,5000))return;
     inject(positionScript({
      id:stream.id,
      point:{latitude:fix.coords.latitude,longitude:fix.coords.longitude},
      fix:{accuracy:fix.coords.accuracy!,time:fix.timestamp},
     }));
    },()=>{if(stream.active)inject(positionScript({id:stream.id,point:null,error:'position'}));});
    stream.subscription=sub;
    if(!stream.active||driverStream.current!==stream||sharing.current){sub.remove();stream.subscription=null;return}
    setScreenAwake(true);
   }catch(error){
    if(!stream.active||driverStream.current!==stream)return;
    const reason=error instanceof Error?error.message:'position';
    const code=reason==='permission'||reason==='accuracy'||reason==='services'?reason:'position';
    inject(positionScript({id:stream.id,point:null,error:code}));
    stopDriverStream(stream.id);
   }
  },[engine,inject,setScreenAwake,stopDriverStream]);
  useEffect(()=>{
  if(!supportsSharing)return;
  const module=screenModule!;
  const listener=module.addListener('rideSharing',value=>{
   if(!value.active){
    if(sharing.current===value.rideId){sharing.current=null;shareFix.current=null}
    inject(eventScript('yalla:ride-sharing',{rideId:value.rideId,active:false}));
    const stream=driverStream.current;
    if(stream&&AppState.currentState!=='background')void startDriverStream({type:'driver-location-start',id:stream.id,askPermission:false});
    return;
   }
   sharing.current=value.rideId;
   const {latitude,longitude,accuracy,time}=value;
   if(latitude===undefined||longitude===undefined||accuracy===undefined||time===undefined)return;
   shareFix.current={timestamp:time,coords:{latitude,longitude,accuracy,altitude:null,altitudeAccuracy:null,heading:null,speed:null}};
   const stream=driverStream.current;
   if(stream&&AppState.currentState!=='background')inject(positionScript({id:stream.id,point:{latitude,longitude},fix:{accuracy,time}}));
  });
  void module.rideSharingStatus().then(ride=>{if(ride)sharing.current=ride}).catch(()=>{});
  return()=>listener.remove();
 },[inject,startDriverStream]);
 const handleMessage=useCallback((event:WebViewMessageEvent)=>{
  if(!trustedWebMessage(event.nativeEvent.url,documentUrl.current))return;
  const message=readWebMessage(event.nativeEvent.data);
  if(!message)return;
  if(message.type==='host-alive'){
    if(pendingResume.current===message.id){pendingResume.current=null;clearResumeTimer();if(pageReady.current)setFailed(false)}
    return;
   }
   if(message.type==='status'){
    const firstStatus=!pageReady.current;
    pageReady.current=true;clearReadyTimer();pendingResume.current=null;clearResumeTimer();
    safeToReload.current=message.safeToReload;
   canGoBack.current=message.canGoBack;
   if(message.signedOut){
    stopOsmAndPassenger();
    if(sharing.current)void screenModule?.stopRideSharing(sharing.current).catch(()=>{});
   }
   if(message.language)setLanguage(message.language);
   if(message.theme)setColorMode(message.theme);
   setLoading(false);setFailed(false);
   if(firstStatus){
    if(pendingEntry.current){
     void Storage.setItem(websiteEntryKey,pendingEntry.current).catch(()=>{});
     pendingEntry.current=null;
    }
    void checkWebUpdate();
    inject(eventScript('yalla:ride-push-capability',{available:ridePushConfigured}));
   }
   if(!message.signedOut&&pendingPushTarget.current){
    inject(eventScript('yalla:ride-push-tap',pendingPushTarget.current));pendingPushTarget.current=null;
   }
   if(!bootStarted.current){bootStarted.current=true;void boot()}
  }else if(message.type==='bootstrap'){
   const revision=websiteVersion(message.version);
   const firstRevision=revision!==websiteRevision.current;
   websiteRevision.current=revision;
   if(firstRevision&&pageReady.current)void checkWebUpdate();
   void engine.permission(false).then(permission=>{
    inject(bootstrapScript(message.id,permission.granted,nativeDriverSpeech,nativeVoiceSetup,nativeOsmAndPassenger));
    void syncPermission('ready');
   }).catch(()=>inject(bootstrapScript(message.id,false,nativeDriverSpeech,nativeVoiceSetup,nativeOsmAndPassenger)));
  }else if(message.type==='location'){
   locationRequestedByPage.current=true;
   void locate(message);
  }else if(message.type==='driver-location-start'){
    void startDriverStream(message);
   }else if(message.type==='driver-location-stop'){
    stopDriverStream(message.id);
   }else if(message.type==='location-cancel'){
   runs.current.get(message.id)?.controller.abort();
  }else if(message.type==='ride-share-status'){
   const status=supportsSharing?screenModule!.rideSharingStatus():Promise.resolve(null);
   void status.then(rideId=>inject(eventScript('yalla:native-result',{id:message.id,ok:supportsSharing,rideId})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='ride-share-start'){
   const start=async()=>{
    if(!supportsSharing||sharing.current||AppState.currentState==='background')return false;
    const permission=await engine.permission(true);
    if(!permission.granted||permission.android?.accuracy==='coarse'||!await Location.hasServicesEnabledAsync()||!await requestAlertPermission())return false;
    if(sharing.current||String(AppState.currentState)==='background')return false;
    sharing.current=message.rideId;
    for(const task of runs.current.values())task.controller.abort();
    const stream=driverStream.current;
    stream?.subscription?.remove();
    if(stream)stream.subscription=null;
    try{return await screenModule!.startRideSharing(message.rideId,message.secret,language==='ar')}
    finally{
     if(!await screenModule!.rideSharingStatus().catch(()=>null)){
      sharing.current=null;
      if(stream?.active&&String(AppState.currentState)!=='background')void startDriverStream({type:'driver-location-start',id:stream.id,askPermission:false});
     }
    }
   };
   void start().then(ok=>inject(eventScript('yalla:native-result',{id:message.id,ok})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='ride-share-stop'){
   const stop=supportsSharing?screenModule!.stopRideSharing(message.rideId):Promise.resolve();
   void stop.then(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:supportsSharing})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='ride-maps'||message.type==='ride-osmand'){
   const provider={'ride-maps':'google','ride-osmand':'osmand'} as const;
   const open=supportsSharing?screenModule!.openRideMaps(message.latitude,message.longitude,message.adjacent,provider[message.type],
    message.passenger?.rideId??null,message.passenger?.accessToken??null,language==='ar'):Promise.resolve(false);
   void open.then(ok=>inject(eventScript('yalla:native-result',{id:message.id,ok})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='osmand-passenger-stop'){
   stopOsmAndPassenger();
  }else if(message.type==='osmand-map-access'){
   const permission=nativeOsmAndPassenger?screenModule!.requestOsmAndMapAccess():Promise.resolve(false);
   void permission.then(ok=>inject(eventScript('yalla:native-result',{id:message.id,ok})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='driver-speak'){
   const operation=nativeDriverSpeech&&AppState.currentState!=='background'
    ?screenModule!.speakDirection(message.text,message.language):Promise.resolve('playback');
   void operation.then(result=>inject(eventScript('yalla:native-result',{id:message.id,ok:result==='started',reason:result})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false,reason:'playback'})));
  }else if(message.type==='driver-voice-setup'&&nativeVoiceSetup){
   const showVoiceHelp=()=>setNotice(text('افتح إعدادات الهاتف وابحث عن تحويل النص إلى كلام.','Open phone settings and search for text-to-speech.'));
   void screenModule!.openVoiceSetup().then(opened=>{if(!opened)showVoiceHelp()}).catch(showVoiceHelp);
  }else if(message.type==='driver-speech-stop'){
   stopDriverSpeech();
  }else if(message.type==='ride-dial'){
   void Linking.openURL('tel:'+message.phone).then(
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:true})),
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})),
   );
  }else if(message.type==='location-settings'){
   // Opening system settings must never wait for a GPS fix.
   void Linking.openSettings().then(
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:true})),
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})),
   );
  }else if(message.type==='ride-push-token'||message.type==='ride-push-disable'){
   const operation=!ridePushConfigured?Promise.resolve(null):message.type==='ride-push-token'
    ?deviceRidePushToken():Notifications.unregisterForNotificationsAsync().then(()=>null);
   void operation.then(token=>inject(eventScript('yalla:ride-push-result',{id:message.id,token})))
    .catch(()=>inject(eventScript('yalla:ride-push-result',{id:message.id,token:null})));
  }else if(message.type==='alerts-enable'||message.type==='notify'){
   const operation=message.type==='alerts-enable'?requestAlertPermission():notifyLocal(message.title,message.body,message.target).then(()=>true);
   void operation.then(ok=>inject(eventScript('yalla:native-result',{id:message.id,ok})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='refresh')refresh();
  else if(message.type==='back-default'){
   if(canGoBack.current)web.current?.goBack();else BackHandler.exitApp();
  }
 },[engine,inject,language,locate,refresh,syncPermission,startDriverStream,stopDriverStream,text,clearReadyTimer,clearResumeTimer,checkWebUpdate,boot]);
 const openExternal=(url:string)=>{
  if(externalTarget(url))void Linking.openURL(url).catch(()=>setNotice(text('تعذر فتح الرابط.','Could not open the link.')));
 };
 return <SafeAreaView style={{flex:1,backgroundColor:background}}>
  {(newWeb||notice!=='')&&<View style={{padding:10,gap:9}}>
   <Text style={{color:foreground,textAlign:'center'}}>{notice||text('يوجد تحديث جديد لواجهة الموقع.','A website update is ready.')}</Text>
   {newWeb&&<Pressable onPress={refresh} style={btn}>
    <Text style={{color:'white',textAlign:'center'}}>{text('تحديث الواجهة','Refresh website')}</Text>
   </Pressable>}
  </View>}
  {!rendererLost&&<WebView key={webSession} ref={web} source={{uri}} style={{flex:1,backgroundColor:background}}
   originWhitelist={['https://abdallrahimbirekdar-rgb.github.io']}
   injectedJavaScriptBeforeContentLoaded={'window.__YALLA_RIDE_PUSH__='+JSON.stringify(ridePushConfigured)+';window.__YALLA_RIDE_DIAL__=true;true;'}
   javaScriptEnabled domStorageEnabled geolocationEnabled={false}
   cacheEnabled cacheMode="LOAD_DEFAULT" mixedContentMode="never"
   allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
   javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
   onShouldStartLoadWithRequest={request=>{
    if(request.isTopFrame===false)return true;
    if(trustedSite(request.url))return true;
    openExternal(request.url);return false;
   }}
   onOpenWindow={event=>openExternal(event.nativeEvent.targetUrl)}
   onMessage={handleMessage}
   onNavigationStateChange={nav=>{canGoBack.current=nav.canGoBack}}
   onLoadStart={event=>{documentUrl.current=event.nativeEvent.url;stopDriverSpeech();stopDriverStream();autoStarted.current=false;locationRequestedByPage.current=false;for(const task of runs.current.values())task.controller.abort();if(!pageReady.current){setLoading(true);setFailed(false);beginPageLoad()}}}
    onLoadEnd={()=>{
     // Request the current status again in case the first message arrived before navigation was recorded.
     inject(eventScript('yalla:native-status-request',{}));
     void syncPermission('page-loaded');
    // If the website cannot post its location request to Android,
    // native GPS still starts and injects a cached position for the map.
    if(!autoStarted.current&&!locationRequestedByPage.current){
     autoStarted.current=true;
     void locate({type:'location',id:'auto-location',askPermission:false,track:false});
    }
   }}
   onError={()=>{clearReadyTimer();setLoading(false);setFailed(true)}}
    onRenderProcessGone={()=>{clearReadyTimer();clearResumeTimer();pendingResume.current=null;pageReady.current=false;setLoading(false);setRendererLost(true);setFailed(true)}}
   onHttpError={event=>{if(event.nativeEvent.statusCode>=400&&event.nativeEvent.url===uri){
    clearReadyTimer();setLoading(false);setFailed(true);
    }}}
   />}
  {loading&&!failed&&<LaunchScreen
   loadingLabel={text('لحظات ونكون جاهزين…','Ready in a moment…')}
   detail={text('جارٍ تجهيز واجهة التطبيق','Preparing the app')}/>}
  {failed&&<View style={{position:'absolute',left:0,right:0,top:0,bottom:0,padding:24,
   backgroundColor:background,justifyContent:'center',gap:16}}>
   <Text style={{fontSize:18,color:foreground,textAlign:'center'}}>
    {text('تعذر فتح الموقع. تأكد من الاتصال بالإنترنت وأعد المحاولة.','Could not open the website. Check the internet and try again.')}
   </Text>
   <Pressable style={btn} onPress={reopenWebsite}>
    <Text style={{color:'#ffffff',textAlign:'center'}}>{text('إعادة المحاولة','Try again')}</Text>
   </Pressable>
   <Pressable style={btn} onPress={()=>openExternal(SITE)}>
    <Text style={{color:'#ffffff',textAlign:'center'}}>{text('فتح الموقع في المتصفح','Open website in browser')}</Text>
   </Pressable>
  </View>}
 </SafeAreaView>;
}
