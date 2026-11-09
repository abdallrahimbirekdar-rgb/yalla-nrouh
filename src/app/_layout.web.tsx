import {AuthProvider,useAuth} from '../auth';
import SiteShellSync from '../site-shell-sync';
import PermissionsIntro from '../permissions-intro';
import React,{useEffect} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {useFonts} from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Stack,router,usePathname} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider,useApp} from '../context';
import {HomeBrandLogo} from '../brand-logo';
import {AccountButton,AppMenu,Button,Label,useText} from '../ui';
import {brandHeader,useTheme} from '../theme';

function DriverRoute(){
 const auth=useAuth();
 const path=usePathname();
 useEffect(()=>{
  if(auth.rolesReady&&auth.driver&&!auth.admin&&!['/cloud','/account','/settings','/notifications','/privacy','/delete-account'].includes(path))
   router.replace({pathname:'/cloud',params:{mode:'driver'}});
 },[auth.rolesReady,auth.driver,auth.admin,path]);
 return null;
}

// Rendering failures should provide a recovery action instead of a blank page.
class PageErrorBoundary extends React.Component<{children:React.ReactNode;message:string;retry:string;home:string},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <View style={{flex:1,padding:24,justifyContent:'center',gap:16,backgroundColor:'#edf3fb'}}>
   <Text style={{textAlign:'center',fontSize:19,color:'#082648'}}>{this.props.message}</Text>
   <Pressable accessibilityRole="button" onPress={()=>this.setState({failed:false})} style={{backgroundColor:'#082648',padding:15,borderRadius:12}}>
    <Text style={{textAlign:'center',color:'#ffffff'}}>{this.props.retry}</Text>
   </Pressable>
   <Pressable accessibilityRole="button" onPress={()=>{router.replace('/');this.setState({failed:false})}} style={{padding:14}}>
    <Text style={{textAlign:'center',color:'#082648'}}>{this.props.home}</Text>
   </Pressable>
  </View>;
 }
}

// Outside Stack: the approved brand stays visible while website routes change.
function PersistentSiteHeader(){
 const auth=useAuth();
 const {state}=useApp();
 return <View style={{backgroundColor:brandHeader.background,borderBottomColor:brandHeader.accent,borderBottomWidth:2,paddingHorizontal:12,paddingVertical:6}}>
  <View style={{width:'100%',maxWidth:1000,alignSelf:'center',minHeight:62,flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
   <HomeBrandLogo inverse/>
   <View style={{flexDirection:'row',alignItems:'center',gap:8,flexShrink:0}}>
    <AccountButton/>
    <AppMenu inverse onSettings={auth.driver?()=>router.push({pathname:'/settings',params:{mode:'driver'}}):undefined}/>
   </View>
  </View>
 </View>;
}

function Screens(){
 const {ready,loadError,retry,recoveryNotice,state}=useApp();
 const path=usePathname();
 const t=useText();
 const {colors,dark}=useTheme();
 useEffect(()=>{document.documentElement.lang=state.language},[state.language]);
 if(!ready)return <><View style={{flex:1,backgroundColor:colors.background,justifyContent:'center',padding:24,gap:16}}>{loadError?<><Label>{t('تعذر استعادة البيانات المحفوظة.','Could not restore saved data.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={retry}/></>:<ActivityIndicator color={colors.purple}/>}</View>{loadError&&<SiteShellSync/>}</>;
 return <>
  {recoveryNotice&&<View accessibilityRole="alert" style={{padding:12,backgroundColor:colors.background}}><Label>{t('تم فتح التطبيق بإعدادات آمنة. احتفظنا بنسخة احتياطية من البيانات القديمة التي تعذرت قراءتها.','The app opened with safe settings. A backup of unreadable old data was kept.')}</Label></View>}
  <StatusBar style={dark?'light':'dark'}/>
  <View style={{flex:1,backgroundColor:colors.background}}>
   <PageErrorBoundary
    message={t('تعذر عرض الصفحة. بياناتك المحفوظة ما زالت موجودة.','The page could not be shown. Your saved data was not deleted.')}
    retry={t('إعادة المحاولة','Try again')} home={t('الصفحة الرئيسية','Start page')}>
    <PersistentSiteHeader/>
    <View style={{flex:1,minHeight:0}}>
     <Stack screenOptions={{headerShown:false,animation:'none',contentStyle:{backgroundColor:colors.background}}}/>
    </View>
   </PageErrorBoundary>
  </View>
  <DriverRoute/>
  <SiteShellSync/>
  {!['/privacy','/delete-account','/account','/notifications'].includes(path)&&<PermissionsIntro/>}
 </>;
}
export default function Layout(){
 useFonts(Ionicons.font);
 return <AppProvider><AuthProvider><Screens/></AuthProvider></AppProvider>;
}
