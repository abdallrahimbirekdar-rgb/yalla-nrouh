import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Linking,Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {enableLocalAlerts,notifyLocal} from '../alerts';
import {acceptableFix,awaitFreshFix,deadlineOr,GpsTaskPool} from './gps';
import {SITE,bootstrapScript,diagnosticScript,eventScript,autoFixScript,externalTarget,positionScript,readWebMessage,trustedSite,
 type WebMessage,type PositionResponse} from './bridge';

// Fresh native app: it owns ONLY Android foreground location and the live website.
// No legacy SQLite hydration, native router screen, cached GPS controller or
// second WebView geolocation permission. The website owns accounts, fares and trips.
class ForegroundLocation {
 private permissionTask:Promise<Location.LocationPermissionResponse>|null=null;
 private askedThisLaunch=false;
 async permission(request:boolean):Promise<Location.LocationPermissionResponse>{
  if(this.permissionTask)return this.permissionTask;
  const task=(async()=>{
   const existing=await Location.getForegroundPermissionsAsync();
   if(existing.granted||!request||!existing.canAskAgain||this.askedThisLaunch)return existing;
   this.askedThisLaunch=true;
   return Location.requestForegroundPermissionsAsync();
  })();
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
  if(ask){const providers=await Location.getProviderStatusAsync();if(!providers.networkAvailable)await Location.enableNetworkProviderAsync().catch(()=>{})}
  if(signal.aborted)throw new Error('GPS_CANCELLED');
  const accuracy=track?50:250;
  if(!track){
   // A genuinely recent fix opens the map immediately. Fresh GPS still follows.
   const last=await deadlineOr(
    Location.getLastKnownPositionAsync({maxAge:20000,requiredAccuracy:accuracy}).catch(()=>null),
    900,null,
   );
   if(acceptableFix(last,accuracy,20000)&&last&&!signal.aborted)preview(last);
  }
  const subscribe=(mode:Location.Accuracy)=>
   awaitFreshFix<Location.LocationObject>(
    (next,error)=>Location.watchPositionAsync({
      accuracy:mode,timeInterval:1000,distanceInterval:0,
      mayShowUserSettingsDialog:ask,
    },next,error),
    fix=>acceptableFix(fix,accuracy,30000),
    20000,signal,
   );
  return subscribe(Location.Accuracy.High);
 }
}
type Run={controller:AbortController;id:string};
type DriverStream={id:string;active:boolean;subscription:Location.LocationSubscription|null};
const screenModule=requireOptionalNativeModule<{setScreenAwake:(active:boolean)=>Promise<void>;
 speakDirection:(text:string,language:'ar'|'en')=>Promise<'started'|'voice-unavailable'|'playback'>;
 openVoiceSetup:()=>Promise<boolean>;
 stopDirection:()=>Promise<void>}>('YallaDriverNavigation');
const nativeDriverSpeech=typeof screenModule?.speakDirection==='function';
const nativeVoiceSetup=typeof screenModule?.openVoiceSetup==='function';
const stopDriverSpeech=()=>{if(nativeDriverSpeech)void screenModule?.stopDirection().catch(()=>{});};
const btn={paddingVertical:13,paddingHorizontal:18,backgroundColor:'#d67749',borderRadius:12} as const;
const websiteVersion=(v:unknown):string|null=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v)?v:null;
export default function FreshAndroid(){
 const web=useRef<WebView>(null);
 const engine=useRef(new ForegroundLocation()).current;
 const active=useRef(true),runs=useRef(new Map<string,Run>()),canGoBack=useRef(false);
 const gpsPool=useRef(new GpsTaskPool<Location.LocationObject>()).current;
  const driverStream=useRef<DriverStream|null>(null),screenAwake=useRef(false);
 const autoStarted=useRef(false),locationRequestedByPage=useRef(false);
 const safeToReload=useRef(false),websiteRevision=useRef<string|null>(null);
 const [uri,setUri]=useState(()=>SITE+'?app=android&launch='+Date.now());
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[newWeb,setNewWeb]=useState(false);
 const [language,setLanguage]=useState<'ar'|'en'>('ar');
 const [notice,setNotice]=useState('');
 const [colorMode,setColorMode]=useState<'system'|'light'|'dark'>('system');
 const ar=language==='ar';
 const text=useCallback((arText:string,enText:string)=>ar?arText:enText,[ar]);
 const background=colorMode==='dark'?'#171b20':'#fffaf5';
 const foreground=colorMode==='dark'?'#ffffff':'#24262b';
 const inject=useCallback((script:string)=>{
  if(active.current)web.current?.injectJavaScript(script);
 },[]);
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
  useEffect(()=>{const requests=runs.current;active.current=true;void boot();return()=>{
  active.current=false;stopDriverSpeech();stopDriverStream();for(const task of requests.values())task.controller.abort();requests.clear();
 }},[boot,stopDriverStream]);
 const refresh=useCallback(()=>{
  if(!safeToReload.current){
   setNotice(text('أكمل تعديلك أو رحلتك أولًا ثم حدّث من الصفحة الرئيسية.','Finish your edit or ride, then refresh at home.'));
   return;
  }
  setNotice('');setNewWeb(false);setLoading(true);setFailed(false);
  setUri(SITE+'?app=android&launch='+Date.now());
 },[text]); // no automatic reset of drafts or website storage
 const checkWebUpdate=useCallback(async()=>{
  if(!websiteRevision.current)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch(SITE+'version.json?check='+Date.now(),{cache:'no-store',signal:controller.signal});
   if(!response.ok)return;
   const next=websiteVersion((await response.json()).version);
   if(next&&next!==websiteRevision.current&&active.current)setNewWeb(true);
  }catch{}finally{clearTimeout(timer)}
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
   if(value==='background'){stopDriverSpeech();stopDriverStream();autoStarted.current=false;locationRequestedByPage.current=false;for(const task of runs.current.values()){inject(positionScript({id:task.id,point:null,error:'timeout'}));task.controller.abort()}inject(eventScript('yalla:native-visibility',{active:false}));return}
   if(value==='active'){
    inject(eventScript('yalla:native-visibility',{active:true}));
    void syncPermission('resumed');
    void checkWebUpdate();
   }
  });
  return()=>{handle.remove();state.remove()};
 },[failed,inject,syncPermission,checkWebUpdate,stopDriverStream]);
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
   if(message.id==='auto-location')inject(autoFixScript(point,fix.timestamp));
   respond({id:message.id,point,
    fix:typeof fix.coords.accuracy==='number'?
     {accuracy:fix.coords.accuracy,time:fix.timestamp}:undefined});
  };
  void syncPermission('locating');
  try{
   const fix=await gpsPool.request(message.track?'track':'map',controller.signal,send,(signal,preview)=>engine.locate(message.askPermission,message.track,signal,preview));
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
    if(!stream.active||driverStream.current!==stream){sub.remove();return}
    setScreenAwake(true);
   }catch(error){
    if(!stream.active||driverStream.current!==stream)return;
    const reason=error instanceof Error?error.message:'position';
    const code=reason==='permission'||reason==='accuracy'||reason==='services'?reason:'position';
    inject(positionScript({id:stream.id,point:null,error:code}));
    stopDriverStream(stream.id);
   }
  },[engine,inject,setScreenAwake,stopDriverStream]);
  const handleMessage=useCallback((event:WebViewMessageEvent)=>{
  if(!trustedSite(event.nativeEvent.url))return;
  const message=readWebMessage(event.nativeEvent.data);
  if(!message)return;
  if(message.type==='status'){
   safeToReload.current=message.safeToReload;
   canGoBack.current=message.canGoBack;
   if(message.language)setLanguage(message.language);
   if(message.theme)setColorMode(message.theme);
   setLoading(false);setFailed(false);
  }else if(message.type==='bootstrap'){
   websiteRevision.current=websiteVersion(message.version);
   void engine.permission(false).then(permission=>{
    inject(bootstrapScript(message.id,permission.granted,nativeDriverSpeech,nativeVoiceSetup));
    void syncPermission('ready');
   }).catch(()=>inject(bootstrapScript(message.id,false,nativeDriverSpeech,nativeVoiceSetup)));
  }else if(message.type==='location'){
   locationRequestedByPage.current=true;
   void locate(message);
  }else if(message.type==='driver-location-start'){
    void startDriverStream(message);
   }else if(message.type==='driver-location-stop'){
    stopDriverStream(message.id);
   }else if(message.type==='location-cancel'){
   runs.current.get(message.id)?.controller.abort();
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
  }else if(message.type==='location-settings'){
   // Opening system settings must never wait for a GPS fix.
   void Linking.openSettings().then(
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:true})),
    ()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})),
   );
  }else if(message.type==='alerts-enable'||message.type==='notify'){
   const operation=message.type==='alerts-enable'?enableLocalAlerts():notifyLocal(message.title,message.body).then(()=>true);
   void operation.then(ok=>inject(eventScript('yalla:native-result',{id:message.id,ok})))
    .catch(()=>inject(eventScript('yalla:native-result',{id:message.id,ok:false})));
  }else if(message.type==='refresh')refresh();
  else if(message.type==='back-default'){
   if(canGoBack.current)web.current?.goBack();else BackHandler.exitApp();
  }
 },[engine,inject,locate,refresh,syncPermission,startDriverStream,stopDriverStream,text]);
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
  <WebView ref={web} source={{uri}} style={{flex:1,backgroundColor:background}}
   originWhitelist={['https://abdallrahimbirekdar-rgb.github.io']}
   javaScriptEnabled domStorageEnabled geolocationEnabled={true}
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
   onNavigationStateChange={nav=>{canGoBack.current=nav.canGoBack;if(!nav.loading)setLoading(false)}}
   onLoadStart={()=>{stopDriverSpeech();stopDriverStream();autoStarted.current=false;locationRequestedByPage.current=false;for(const task of runs.current.values())task.controller.abort();setLoading(true);setFailed(false)}}
   onLoadEnd={()=>{
    setLoading(false);void syncPermission('page-loaded');
    // If the website cannot post its location request to Android,
    // native GPS still starts and injects a cached position for the map.
    if(!autoStarted.current&&!locationRequestedByPage.current){
     autoStarted.current=true;
     void locate({type:'location',id:'auto-location',askPermission:false,track:false});
    }
   }}
   onError={()=>{setLoading(false);setFailed(true)}}
   onRenderProcessGone={()=>{setLoading(false);setFailed(true)}}
   onHttpError={event=>{if(event.nativeEvent.statusCode>=400&&event.nativeEvent.url===uri){
    setLoading(false);setFailed(true);
   }}}
  />
  {loading&&!failed&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,
   justifyContent:'center',alignItems:'center',backgroundColor:background,gap:14}}>
   <ActivityIndicator color="#d67749" size="large"/>
   <Text style={{color:foreground,fontSize:17}}>{text('جارٍ فتح يلا نروح…','Opening Yalla Nrouh…')}</Text>
  </View>}
  {failed&&<View style={{position:'absolute',left:0,right:0,top:0,bottom:0,padding:24,
   backgroundColor:background,justifyContent:'center',gap:16}}>
   <Text style={{fontSize:18,color:foreground,textAlign:'center'}}>
    {text('تعذر فتح الموقع. تأكد من الاتصال بالإنترنت وأعد المحاولة.','Could not open the website. Check the internet and try again.')}
   </Text>
   <Pressable style={btn} onPress={()=>{setFailed(false);setLoading(true);web.current?.reload()}}>
    <Text style={{color:'#ffffff',textAlign:'center'}}>{text('إعادة المحاولة','Try again')}</Text>
   </Pressable>
   <Pressable style={btn} onPress={()=>openExternal(SITE)}>
    <Text style={{color:'#ffffff',textAlign:'center'}}>{text('فتح الموقع في المتصفح','Open website in browser')}</Text>
   </Pressable>
  </View>}
 </SafeAreaView>;
}
