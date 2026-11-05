import {useAuth} from './auth';
import React,{useEffect,useState} from 'react';
import {Image,Modal,ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,type TextInputProps,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {isLoaded} from 'expo-font';
import {router} from 'expo-router';
import {useApp} from './context';
import {getMigrationPending} from './storage';
import {lightColors,useTheme,type Palette} from './theme';
export {useTheme} from './theme';
export const colors=lightColors;
const font=(weight:'regular'|'medium'|'bold'='regular')=>{const family={regular:'Cairo_400Regular',medium:'Cairo_600SemiBold',bold:'Cairo_700Bold'}[weight];return isLoaded(family)?family:undefined};
export type IconName=React.ComponentProps<typeof Ionicons>['name'];
export function Icon({name,size=22,color}:{name:IconName;size?:number;color?:string}){const {colors}=useTheme();return <Ionicons name={name} size={size} color={color??colors.ink} accessible={false} importantForAccessibility="no"/>}
export function useText(){const {state}=useApp();return (ar:string,en:string)=>state.language==='ar'?ar:en}
export function Label({children,muted=false,large=false,display=false}:{children:React.ReactNode;muted?:boolean;large?:boolean;display?:boolean}){const {state}=useApp();const {colors}=useTheme();return <Text style={[styles.text,{color:muted?colors.muted:colors.ink,textAlign:state.language==='ar'?'right':'left',writingDirection:state.language==='ar'?'rtl':'ltr',fontFamily:font(large||display?'bold':'regular')},muted&&styles.muted,large&&styles.large,display&&styles.display]}>{children}</Text>}
export function Button({title,onPress,secondary=false,disabled=false,icon,prominent=false,tone,stacked=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;icon?:IconName;prominent?:boolean;tone?:'positive'|'danger';stacked?:boolean}){
 const {state}=useApp();const {colors,dark}=useTheme();
 const fill=tone==='positive'?'#116443':tone==='danger'?'#9a292f':colors.ink;
 const accent=tone==='positive'?(dark?'#85dfb1':fill):tone==='danger'?(dark?'#ffb0b4':fill):colors.ink;
 const foreground=secondary?accent:tone?'#ffffff':colors.background;
 return <Pressable accessibilityLabel={title} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[
  styles.button,prominent&&styles.prominentButton,stacked&&{paddingHorizontal:4,paddingVertical:5},
  {backgroundColor:secondary?colors.background:fill},
  secondary&&{borderWidth:tone?2:1,borderColor:tone?accent:colors.line},
  (pressed||disabled)&&{opacity:0.45},
 ]}>
  <View style={{flexDirection:stacked?'column':state.language==='ar'?'row-reverse':'row',alignItems:'center',justifyContent:'center',gap:stacked?2:9}}>
   {icon&&<Icon name={icon} size={prominent?24:20} color={foreground}/>}
   <Text style={{fontFamily:font(prominent?'bold':'medium'),fontSize:prominent?18:14,lineHeight:stacked?20:26,color:foreground,textAlign:'center',flexShrink:1}}>{title}</Text>
  </View>
 </Pressable>;
}
export function Panel({children}:{children:React.ReactNode}){const {colors}=useTheme();return <View style={[styles.panel,{backgroundColor:colors.surface}]}>{children}</View>}
export function Field({label,...props}:TextInputProps&{label:string}){const {state}=useApp();const {colors,dark}=useTheme();return <View style={{gap:5}}><Label muted>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} keyboardAppearance={dark?'dark':'light'} selectionColor={colors.purple} {...props} style={[styles.input,{color:colors.ink,backgroundColor:colors.background,borderColor:colors.line,textAlign:state.language==='ar'?'right':'left',writingDirection:state.language==='ar'?'rtl':'ltr',fontFamily:font()},props.style]}/></View>}
export function RideHero({title}:{title:string}){return <Label large>{title}</Label>}
export function SectionTitle({title,subtitle}:{title:string;subtitle?:string}){return <View style={{gap:3}}><Label large>{title}</Label>{subtitle&&<Label muted>{subtitle}</Label>}</View>}
export function EmptyIllustration({icon='car-sport-outline'}:{icon?:IconName}){const {colors}=useTheme();return <View style={{alignItems:'center',padding:20}}><Icon name={icon} size={42} color={colors.muted}/></View>}
export function DeviceStatus(){const {connection,saveError,retrySave,alertError}=useApp();const t=useText();const migrationPending=getMigrationPending();return <View style={{gap:6}}>{connection==='offline'&&<Label muted>{t('لا يوجد اتصال • العناوين والرحلة متاحة محليًا','No connection • addresses and ride are kept on this phone')}</Label>}{migrationPending&&<View accessibilityRole="alert"><Label>{t('تأخر نقل بيانات النسخة السابقة. بياناتك القديمة محفوظة؛ أعد فتح الصفحة لإكمال النقل قبل إجراء تغييرات.','Old data transfer is delayed. Your old data is safe. Reopen the page before making changes.')}</Label><Button secondary title={t('إعادة فتح الصفحة','Reopen page')} onPress={()=>{if(Platform.OS==='web')window.location.reload()}}/></View>}{saveError&&!migrationPending&&<View accessibilityRole="alert"><Label>{t('لم يُحفظ آخر تغيير. تحقق من مساحة الهاتف وأعد المحاولة.','The last change was not saved. Check phone space and try again.')}</Label><Button secondary title={t('إعادة الحفظ','Save again')} onPress={retrySave}/></View>}{alertError&&<Label muted>{t('تعذر إظهار الإشعار المحلي؛ راجع إذن الإشعارات.','Could not show a local alert. Check notification permission.')}</Label>}</View>}
export function AccountButton(){const auth=useAuth();const t=useText();const {colors}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={auth.session?t('حسابي','My account'):t('تسجيل الدخول','Sign in')} onPress={()=>router.push('/account')} style={{minHeight:44,paddingHorizontal:12,borderRadius:22,backgroundColor:colors.selected,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Icon name={auth.session?'person-circle-outline':'log-in-outline'} size={20}/><Label muted>{auth.session?t('حسابي','My account'):t('تسجيل الدخول','Sign in')}</Label></Pressable>}
export function AppMenu({onSettings}:{onSettings?:()=>void}={}){
 const auth=useAuth();const [open,setOpen]=useState(false);const {state,dispatch}=useApp();const {colors,dark}=useTheme();const t=useText();
 const shell=Platform.OS==='web'&&typeof window!=='undefined'?(window as Window&{ReactNativeWebView?:{postMessage:(value:string)=>void}}).ReactNativeWebView:undefined;
 useEffect(()=>{if(Platform.OS!=='web'||!open)return;const back=(event:Event)=>{event.preventDefault();setOpen(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[open]);
 const go=(path:'/'|'/account'|'/cloud'|'/admin'|'/settings')=>{setOpen(false);if(path==='/settings'&&onSettings)onSettings();else router.push(path)};
 return <><Pressable accessibilityRole="button" accessibilityLabel={t('فتح القائمة','Open menu')} onPress={()=>setOpen(true)} style={themedStyles(colors).circle}><Icon name="menu" size={25}/></Pressable><Modal visible={open} transparent animationType="none" onRequestClose={()=>setOpen(false)}><View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel={t('إغلاق القائمة','Close menu')} onPress={()=>setOpen(false)}/><View style={[themedStyles(colors).menu,{maxHeight:'90%'}]}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Image source={dark?require('../assets/logo-header-dark.png'):require('../assets/logo-approved.png')} resizeMode="contain" accessibilityLabel="يلا نروح" style={{width:108,height:60}}/><Pressable accessibilityRole="button" accessibilityLabel={t('إغلاق','Close')} onPress={()=>setOpen(false)} style={themedStyles(colors).circle}><Icon name="close"/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:10}}>
 <Label muted>{auth.session?.user.email??t('أهلًا بك في يلا نروح','Welcome to Yalla Nrouh')}</Label>
 {!auth.driver&&<Button icon="car-outline" title={t('حجز رحلة','Book a ride')} onPress={()=>go('/')}/>}
 <Button secondary icon="person-circle-outline" title={auth.session?(auth.driver?t('حسابي','My account'):t('حسابي وأماكني','My account and places')):t('تسجيل الدخول / حساب جديد','Sign in / New account')} onPress={()=>go('/account')}/>
 {!auth.driver&&<Button secondary icon="time-outline" title={t('رحلاتي','My rides')} onPress={()=>go('/cloud')}/>}
 <Button secondary icon="car-sport-outline" title={t('وضع السائق','Driver mode')} onPress={()=>{setOpen(false);router.push({pathname:'/cloud',params:{mode:'driver'}})}}/>
 {auth.admin&&<Button secondary icon="shield-checkmark-outline" title={t('لوحة الإدارة','Administration')} onPress={()=>go('/admin')}/>}
 <Button secondary icon="options-outline" title={t('الإعدادات والأذونات','Settings and permissions')} onPress={()=>go('/settings')}/>
 {shell&&<Button secondary icon="refresh-outline" title={t('تحديث العرض','Refresh page')} onPress={()=>{setOpen(false);shell.postMessage(JSON.stringify({type:'refresh'}))}}/>}
 <Button secondary icon="language-outline" title={t('English','العربية')} onPress={()=>dispatch({type:'language',language:state.language==='ar'?'en':'ar'})}/>
 <Label muted>{t('نسخة اختبار • الدفع نقدًا','Test version • Pay in cash')}</Label>
 </ScrollView></View></View></Modal></>;
}
export function Page({title,children,hero,footer,compact=false,backTo='/'}:{title:string;children:React.ReactNode;hero?:React.ReactNode;footer?:React.ReactNode;compact?:boolean;backTo?:'/'|'/cloud'|'/account'|'/review'}){const auth=useAuth();const {ready,loadError,retry,state}=useApp();const {colors}=useTheme();const t=useText();const themed=themedStyles(colors);return <SafeAreaView style={[styles.safe,{backgroundColor:colors.background}]}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page,compact&&styles.compactPage]}><View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',justifyContent:'space-between',gap:8}}>{compact&&auth.driver?<View style={{flexShrink:1}}><Label large>{title}</Label></View>:<Pressable accessibilityRole="button" accessibilityLabel={auth.driver?t('لوحة السائق','Driver dashboard'):t('العودة للحجز','Back to booking')} style={themed.circle} onPress={()=>auth.driver?router.replace({pathname:'/cloud',params:{mode:'driver'}}):router.replace(backTo)}><Icon name={state.language==='ar'?'arrow-forward':'arrow-back'}/></Pressable>}<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><AccountButton/><AppMenu/></View></View>{hero??(!compact||!auth.driver?<Label large>{title}</Label>:null)}{!ready?<Panel>{loadError?<><Label>{t('تعذر تحميل البيانات المحفوظة.','Could not load saved data.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={retry}/></>:<ActivityIndicator color={colors.purple}/>}</Panel>:<><DeviceStatus/>{children}</>}</ScrollView>{ready&&footer}</KeyboardAvoidingView></SafeAreaView>}
export function themedStyles(colors:Palette){return {circle:[styles.circle,{backgroundColor:colors.background,borderColor:colors.line}],menu:[styles.menu,{backgroundColor:colors.background}]};}
export const styles=StyleSheet.create({safe:{flex:1,direction:'ltr'},page:{width:'100%',maxWidth:640,alignSelf:'center',padding:22,gap:22,paddingBottom:32},text:{fontSize:16,lineHeight:28},muted:{fontSize:12,lineHeight:22},large:{fontSize:23,lineHeight:38},display:{fontSize:30,lineHeight:42},compactPage:{padding:12,gap:10,paddingBottom:22},prominentButton:{minHeight:60,paddingHorizontal:8},button:{minHeight:52,borderRadius:13,paddingHorizontal:16,paddingVertical:12,justifyContent:'center'},panel:{padding:18,borderRadius:16,gap:14},input:{borderBottomWidth:1,minHeight:52,paddingHorizontal:0,paddingVertical:8,fontSize:17,lineHeight:28},row:{flexDirection:'row',gap:8,flexWrap:'wrap'},circle:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center'},overlay:{flex:1,backgroundColor:'#00000077',justifyContent:'center',padding:22},menu:{width:'100%',maxWidth:380,alignSelf:'center',borderRadius:22,padding:22,gap:14}});
