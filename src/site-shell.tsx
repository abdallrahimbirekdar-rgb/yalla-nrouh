import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Linking,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import * as Location from 'expo-location';
import {enableLocalAlerts,notifyLocal} from './alerts';
import {useApp} from './context';
import {Button,Label,useText,useTheme} from './ui';
import {SITE_URL,isSiteUrl,externalLink,buildVersion,readShellMessage,bootstrapScript,resultScript} from './site-shell-policy';
export default function SiteShell(){
 const {ready,state,draft,dispatch}=useApp();const t=useText();const {colors}=useTheme();const web=useRef<WebView>(null);
 const [url,setUrl]=useState(()=>SITE_URL+'?app=android&launch='+Date.now());
 const [failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[available,setAvailable]=useState(false),[notice,setNotice]=useState('');
 const safe=useRef(false),canGoBack=useRef(false),loadedVersion=useRef<string|null>(null),checking=useRef(false),alive=useRef(true),checkAbort=useRef<AbortController|null>(null);
 const saved=useRef('');saved.current=JSON.stringify({storageVersion:2,state,draft});
 function refresh(){if(!safe.current){setNotice(t('احفظ بياناتك وأكمل الرحلة، ثم حدّث العرض من الصفحة الرئيسية.','Save your work and finish the ride, then refresh from the home page.'));return}setNotice('');setAvailable(false);setFailed(false);setLoading(true);safe.current=false;setUrl(SITE_URL+'?app=android&launch='+Date.now())}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;checkAbort.current?.abort()}},[]);
 useEffect(()=>{
  const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(failed||loading)return false;web.current?.injectJavaScript("if(window.dispatchEvent(new CustomEvent('yalla:native-back',{cancelable:true}))){window.ReactNativeWebView.postMessage(JSON.stringify({type:'back-default'}));}true;");return true});
  return()=>listener.remove();
 },[failed,loading]);
 useEffect(()=>{
  const listener=AppState.addEventListener('change',async value=>{
   web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('yalla:native-visibility',{detail:{active:${value==='active'}}}));true;`);
   if(value!=='active'||checking.current||!loadedVersion.current)return;
   checking.current=true;const controller=new AbortController();checkAbort.current=controller;const timer=setTimeout(()=>controller.abort(),8000);
   try{const response=await fetch(SITE_URL+'version.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!response.ok)return;const next=buildVersion((await response.json()).version);if(alive.current&&next&&next!==loadedVersion.current)setAvailable(true)}catch{}finally{clearTimeout(timer);checking.current=false}
  });return()=>listener.remove();
 },[]);
 if(!ready||!state.preferences.permissionsIntroSeen)return <View style={{flex:1,backgroundColor:colors.background,justifyContent:'center'}}><ActivityIndicator color={colors.purple}/></View>;
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
  {(available||notice!=='')&&<View style={{padding:10,gap:8}}><Label muted>{notice||t('تتوفر نسخة جديدة من الموقع.','A new website version is ready.')}</Label>{available&&<Button secondary title={t('تحديث العرض','Refresh page')} onPress={refresh}/>}</View>}
  <WebView ref={web} source={{uri:url}} style={{flex:1,backgroundColor:colors.background}}
   originWhitelist={['https://abdallrahimbirekdar-rgb.github.io']}
   javaScriptEnabled domStorageEnabled geolocationEnabled cacheEnabled cacheMode="LOAD_DEFAULT" mixedContentMode="never" allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
   setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
   onShouldStartLoadWithRequest={request=>{if(request.isTopFrame===false)return true;if(isSiteUrl(request.url))return true;if(externalLink(request.url))void Linking.openURL(request.url).catch(()=>setNotice(t('تعذر فتح الرابط الخارجي.','Could not open the link.')));return false}}
   onOpenWindow={event=>{const target=event.nativeEvent.targetUrl;if(externalLink(target))void Linking.openURL(target).catch(()=>setNotice(t('تعذر فتح الرابط.','Could not open the link.')))}}
   onNavigationStateChange={navigation=>{canGoBack.current=navigation.canGoBack}}
   onLoadStart={()=>{setLoading(true);setFailed(false)}} onLoadEnd={()=>setLoading(false)}
   onError={()=>{setLoading(false);setFailed(true)}} onRenderProcessGone={()=>{setLoading(false);setFailed(true)}} onHttpError={event=>{if(event.nativeEvent.url===url&&event.nativeEvent.statusCode>=400){setLoading(false);setFailed(true)}}}
   onMessage={event=>{
    if(!isSiteUrl(event.nativeEvent.url))return;const message=readShellMessage(event.nativeEvent.data);if(!message)return;
    if(message.type==='status'){safe.current=message.safeToReload;canGoBack.current=message.canGoBack;if(message.language&&message.language!==state.language)dispatch({type:'language',language:message.language});if(message.theme&&message.theme!==state.preferences.theme)dispatch({type:'preferences',preferences:{theme:message.theme}});return}
    if(message.type==='refresh'){refresh();return}
    if(message.type==='back-default'){if(canGoBack.current)web.current?.goBack();else BackHandler.exitApp();return}
    if(message.type==='alerts-enable'||message.type==='notify'){const task=message.type==='alerts-enable'?enableLocalAlerts():notifyLocal(message.title,message.body).then(()=>true);void task.then(ok=>{if(alive.current)web.current?.injectJavaScript(resultScript(message.id,ok))}).catch(()=>{if(alive.current)web.current?.injectJavaScript(resultScript(message.id,false))});return}
    loadedVersion.current=message.version;
    void Location.getForegroundPermissionsAsync().then(permission=>{if(alive.current)web.current?.injectJavaScript(bootstrapScript(message.id,message.needsSavedState?saved.current:null,permission.granted))}).catch(()=>{if(alive.current)web.current?.injectJavaScript(bootstrapScript(message.id,message.needsSavedState?saved.current:null,false))});
   }}/>
  {loading&&!failed&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:colors.background,justifyContent:'center',alignItems:'center',gap:12}}><ActivityIndicator color={colors.purple}/><Label>{t('جارٍ فتح يلا نروح…','Opening Yalla Nrouh…')}</Label></View>}
  {failed&&<View style={{position:'absolute',left:0,right:0,top:0,bottom:0,padding:24,backgroundColor:colors.background,justifyContent:'center',gap:16}}><Label>{t('تعذر فتح الموقع. تحقق من الإنترنت ثم أعد المحاولة.','Could not open the website. Check your internet and try again.')}</Label><Label muted>{t('بياناتك المحفوظة تبقى على الجهاز.','Your saved data stays on this device.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={()=>{setFailed(false);setLoading(true);web.current?.reload()}}/></View>}
 </SafeAreaView>;
}
