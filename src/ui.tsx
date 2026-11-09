import {useAuth} from './auth';
import React,{useCallback,useEffect,useState} from 'react';
import {Modal,ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,type TextInputProps,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {HomeBrandLogo} from './brand-logo';
import {Link,router,type Href} from 'expo-router';
import {useApp} from './context';
import {languages,translate} from './locale';
import {getMigrationPending} from './storage';
import {brandHeader,lightColors,useTheme,type Palette} from './theme';
export {useTheme} from './theme';
export const colors=lightColors;
export type IconName=React.ComponentProps<typeof Ionicons>['name'];
export function Icon({name,size=22,color}:{name:IconName;size?:number;color?:string}){const {colors}=useTheme();return <Ionicons name={name} size={size} color={color??colors.ink} accessible={false} importantForAccessibility="no"/>}
export function useText(){
 const {state:{language}}=useApp();
 return useCallback((ar:string,en:string,de?:string)=>translate(language,ar,en,de),[language]);
}
export function Label({children,muted=false,large=false,display=false}:{children:React.ReactNode;muted?:boolean;large?:boolean;display?:boolean}){const {state}=useApp();const {colors}=useTheme();return <Text style={[styles.text,{color:muted?colors.muted:colors.ink,textAlign:state.language==='ar'?'right':'left',writingDirection:state.language==='ar'?'rtl':'ltr',fontWeight:large||display?'700':'400'},muted&&styles.muted,large&&styles.large,display&&styles.display]}>{children}</Text>}
export function Button({title,onPress,secondary=false,disabled=false,icon,prominent=false,tone}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;icon?:IconName;prominent?:boolean;tone?:'positive'|'danger'}){
 const {state}=useApp();const {colors,dark}=useTheme();
 const fill=tone==='positive'?'#116443':tone==='danger'?'#9a292f':colors.ink;
 const accent=tone==='positive'?(dark?'#85dfb1':fill):tone==='danger'?(dark?'#ffb0b4':fill):colors.ink;
 const foreground=secondary?accent:tone?'#ffffff':colors.background;
 return <Pressable accessibilityLabel={title} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[
  styles.button,prominent&&styles.prominentButton,
  {backgroundColor:secondary?colors.background:fill},
  secondary&&{borderWidth:tone?2:1,borderColor:tone?accent:colors.line},
  (pressed||disabled)&&{opacity:0.45},
 ]}>
  <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',justifyContent:'center',gap:9}}>
   {icon&&<Icon name={icon} size={prominent?24:20} color={foreground}/>}
   <Text style={{fontWeight:prominent?'700':'600',fontSize:prominent?18:14,lineHeight:26,color:foreground,textAlign:'center',flexShrink:1}}>{title}</Text>
  </View>
 </Pressable>;
}
export function HelpTip({title,children}:{title:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const {state}=useApp();const {colors}=useTheme();
 return <View style={{gap:4}}>
  <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{expanded:open}}
   onPress={()=>setOpen(value=>!value)} style={({pressed})=>({
    alignSelf:state.language==='ar'?'flex-end':'flex-start',minHeight:44,paddingHorizontal:7,
    flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:7,borderRadius:10,
    backgroundColor:pressed||open?colors.selected:undefined,
   })}>
   <Icon name="help-circle-outline" color={colors.purple} size={22}/><View style={{flexShrink:1}}><Label muted>{title}</Label></View>
  </Pressable>
  {open&&<View style={{borderColor:colors.line,borderWidth:1,borderRadius:12,padding:12,gap:7,backgroundColor:colors.surface}}>{children}</View>}
 </View>;
}
export function Panel({children,outlined=false}:{children:React.ReactNode;outlined?:boolean}){const {colors}=useTheme();return <View style={[styles.panel,{backgroundColor:outlined?colors.background:colors.surface},outlined&&{borderWidth:1,borderColor:colors.line,padding:14,gap:10}]}>{children}</View>}
export function Field({label,...props}:TextInputProps&{label:string}){const {state}=useApp();const {colors,dark}=useTheme();return <View style={{gap:5}}><Label muted>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} keyboardAppearance={dark?'dark':'light'} selectionColor={colors.purple} {...props} style={[styles.input,{color:colors.ink,backgroundColor:colors.background,borderColor:colors.line,textAlign:state.language==='ar'?'right':'left',writingDirection:state.language==='ar'?'rtl':'ltr'},props.style]}/></View>}
export function RideHero({title}:{title:string}){return <Label large>{title}</Label>}
export function SectionTitle({title,subtitle}:{title:string;subtitle?:string}){return <View style={{gap:3}}><Label large>{title}</Label>{subtitle&&<Label muted>{subtitle}</Label>}</View>}
export function EmptyIllustration({icon='car-sport-outline'}:{icon?:IconName}){const {colors}=useTheme();return <View style={{alignItems:'center',padding:20}}><Icon name={icon} size={42} color={colors.muted}/></View>}
export function DeviceStatus(){const {connection,saveError,retrySave,alertError}=useApp();const t=useText();const migrationPending=getMigrationPending();return <View style={{gap:6}}>{connection==='offline'&&<Label muted>{t('لا يوجد اتصال • العناوين والرحلة متاحة محليًا','No connection • addresses and ride are kept on this phone')}</Label>}{migrationPending&&<View accessibilityRole="alert"><Label>{t('تأخر نقل بيانات النسخة السابقة. بياناتك القديمة محفوظة؛ أعد فتح الصفحة لإكمال النقل قبل إجراء تغييرات.','Old data transfer is delayed. Your old data is safe. Reopen the page before making changes.')}</Label><Button secondary title={t('إعادة فتح الصفحة','Reopen page')} onPress={()=>{if(Platform.OS==='web')window.location.reload()}}/></View>}{saveError&&!migrationPending&&<View accessibilityRole="alert"><Label>{t('لم يُحفظ آخر تغيير. تحقق من مساحة الهاتف وأعد المحاولة.','The last change was not saved. Check phone space and try again.')}</Label><Button secondary title={t('إعادة الحفظ','Save again')} onPress={retrySave}/></View>}{alertError&&<Label muted>{t('تعذر إظهار الإشعار المحلي؛ راجع إذن الإشعارات.','We couldn’t show a notification. Check your notification settings.')}</Label>}</View>}
export function AccountButton(){
 const auth=useAuth();
 const t=useText();
 const title=auth.session?t('حسابي','My account'):t('تسجيل الدخول','Sign in');
 return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={()=>router.push('/account')}
  style={({pressed})=>({minHeight:44,paddingHorizontal:12,borderRadius:22,backgroundColor:brandHeader.control,borderWidth:1,
   borderColor:brandHeader.line,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,opacity:pressed ? .8 : 1})}>
  <Icon name={auth.session?'person-circle-outline':'log-in-outline'} size={20} color={brandHeader.accent}/>
  <Text style={{fontWeight:'600',fontSize:13,color:brandHeader.ink}}>{title}</Text>
 </Pressable>;
}
export function LanguagePicker(){
 const {state:{language},dispatch}=useApp();
 const t=useText();
 return <View style={{gap:4}}>
  <Label muted>{t('اللغة','Language')}</Label>
  <View style={{flexDirection:language==='ar'?'row-reverse':'row',gap:6}}>
   {languages.map(({id,name})=><View key={id} style={{flex:1,minWidth:0}}>
    <Button secondary={id!==language} title={name} onPress={()=>dispatch({type:'language',language:id})}/>
   </View>)}
  </View>
 </View>;
}
export function DriverModeIcon(){
 if(Platform.OS!=='web')return <Icon name="car-sport-outline" size={24}/>;
 return <svg width={36} height={36} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <rect width={32} height={32} rx={10} fill={brandHeader.background}/>
  <g fill="none" stroke={brandHeader.accent} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
   <circle cx={13.5} cy={13.5} r={7.5}/>
   <circle cx={13.5} cy={13.5} r={1.65}/>
   <path d="M6.2 12.7l5.7.5m3.2 0 5.7-.5M13.5 15.2V21"/>
  </g>
  <path d="m22.6 27-2.1-1.5a5 5 0 0 1-1.3-1.5l-2.4-3.8a1.25 1.25 0 0 1 2-1.5l1.6 1.7-1.7-5.2a1.3 1.3 0 0 1 2.45-.82l1.3 3.8.35-.1a1.4 1.4 0 0 1 1.7 1l.2.45.3-.06a1.4 1.4 0 0 1 1.6 1.15l.25 1.9a5.2 5.2 0 0 1-.55 3.15l-.75 1.3Z"
   fill={brandHeader.ink} stroke={brandHeader.background} strokeWidth={1.15} strokeLinejoin="round"/>
 </svg>;
}

export function AppMenu({onSettings,inverse=false}:{onSettings?:()=>void;inverse?:boolean}={}){
 const auth=useAuth();const [open,setOpen]=useState(false);const {colors}=useTheme();const t=useText();
 const {state:{language}}=useApp();
 const shell=Platform.OS==='web'&&typeof window!=='undefined'?(window as Window&{ReactNativeWebView?:{postMessage:(value:string)=>void}}).ReactNativeWebView:undefined;
 useEffect(()=>{if(Platform.OS!=='web'||!open)return;const back=(event:Event)=>{event.preventDefault();setOpen(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[open]);
 const go=(path:'/'|'/account'|'/cloud'|'/admin'|'/settings'|'/privacy'|'/delete-account'|'/complaints')=>{setOpen(false);if(path==='/settings'&&onSettings)onSettings();else router.push(path)};
 return <><Pressable accessibilityRole="button" accessibilityLabel={t('فتح القائمة','Open menu')} onPress={()=>setOpen(true)} style={[themedStyles(colors).circle,inverse&&{backgroundColor:brandHeader.accent,borderColor:brandHeader.accent}]}><Icon name="menu" size={25} color={inverse?brandHeader.background:undefined}/></Pressable><Modal visible={open} transparent animationType="none" onRequestClose={()=>setOpen(false)}><View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel={t('إغلاق القائمة','Close menu')} onPress={()=>setOpen(false)}/><View style={[themedStyles(colors).menu,{maxHeight:'90%'}]}><View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}><HomeBrandLogo menu onNavigate={()=>setOpen(false)}/><Pressable accessibilityRole="button" accessibilityLabel={t('إغلاق','Close')} onPress={()=>setOpen(false)} style={themedStyles(colors).circle}><Icon name="close"/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:10}}>
 <Label muted>{(auth.session?.user.email||auth.session?.user.phone)||t('أهلًا بك في يلا نروح','Welcome to Yalla Nrouh')}</Label>
 {!auth.driver&&<Button icon="car-outline" title={t('حجز رحلة','Book a ride')} onPress={()=>go('/')}/>}
 <Button secondary icon="person-circle-outline" title={auth.session?(auth.driver?t('حسابي','My account'):t('حسابي وأماكني','My account and places')):t('تسجيل الدخول / حساب جديد','Sign in or create an account')} onPress={()=>go('/account')}/>
 {!auth.driver&&<Button secondary icon="time-outline" title={t('رحلاتي','My rides')} onPress={()=>go('/cloud')}/>}
 <Button secondary icon="car-sport-outline" title={t('وضع السائق','Driver mode')} onPress={()=>{setOpen(false);router.push({pathname:'/cloud',params:{mode:'driver'}})}}/>
 {auth.session&&<Button secondary icon="flag-outline" title={t('الشكاوى','Complaints','Beschwerden')} onPress={()=>go('/complaints')}/>}
 {auth.admin&&<Button secondary icon="shield-checkmark-outline" title={t('لوحة الإدارة','Administration')} onPress={()=>go('/admin')}/>}
 <Button secondary icon="options-outline" title={t('الإعدادات والأذونات','Settings and permissions')} onPress={()=>go('/settings')}/>
 {shell&&<Button secondary icon="refresh-outline" title={t('تحديث العرض','Refresh page')} onPress={()=>{setOpen(false);shell.postMessage(JSON.stringify({type:'refresh'}))}}/>}
 <Button secondary icon="shield-outline" title={t('سياسة الخصوصية','Privacy policy','Datenschutzerklärung')} onPress={()=>go('/privacy')}/>
 <Button secondary icon="trash-outline" title={t('حذف الحساب','Delete account','Konto löschen')} onPress={()=>go('/delete-account')}/>
 <LanguagePicker/>
 {Platform.OS==='web'&&!shell&&<Link
  href="https://github.com/abdallrahimbirekdar-rgb/yalla-nrouh/releases/download/android-test-unified/yalla-nrouh-test.apk" asChild>
  <Pressable accessibilityRole="link" onPress={()=>setOpen(false)}
   style={({pressed})=>[styles.button,{flexDirection:language==='ar'?'row-reverse':'row',gap:9,alignItems:'center',
    backgroundColor:colors.brandAction,opacity:pressed ? .82 : 1}]}>
   <Icon name="download-outline" size={21} color={brandHeader.accent}/>
   <Text style={{color:brandHeader.ink,fontSize:14,fontWeight:'700',textAlign:'center'}}>
    {t('تحميل تطبيق أندرويد','Download the Android app','Android-App herunterladen')}
   </Text>
  </Pressable>
 </Link>}
 <Label muted>{t('نسخة اختبار • الدفع نقدًا','Test version • Pay in cash')}</Label>
 </ScrollView></View></View></Modal></>;
}
export function Page({title,titleIcon,children,hero,footer,header,compact=false,simpleHeader=false,showBrand=false,viewportHeight,backTo='/'}:{title:string;titleIcon?:React.ReactElement;children:React.ReactNode;hero?:React.ReactNode;footer?:React.ReactNode;header?:React.ReactNode;compact?:boolean;simpleHeader?:boolean;showBrand?:boolean;viewportHeight?:number;onSettings?:()=>void;backTo?:Href}){
 const auth=useAuth();const {ready,loadError,retry,state}=useApp();const {colors}=useTheme();const t=useText();const themed=themedStyles(colors);
 const arabic=state.language==='ar';
 const driverHeader=compact&&auth.driver&&!simpleHeader;
 const brandedHeader=driverHeader||showBrand;
 const heading=titleIcon
  ? <View style={{flexDirection:arabic?'row-reverse':'row',alignItems:'center',gap:10}}>
     {titleIcon}<View style={{flexShrink:1}}><Label large>{title}</Label></View>
    </View>
  : <Label large>{title}</Label>;
 const back=<Pressable accessibilityRole="button" accessibilityLabel={auth.driver?t('لوحة السائق','Driver dashboard'):simpleHeader?t('رجوع','Back'):t('العودة للحجز','Back to booking')} style={themed.circle} onPress={()=>auth.driver?router.replace({pathname:'/cloud',params:{mode:'driver'}}):router.replace(backTo)}><Icon name={arabic?'arrow-forward':'arrow-back'}/></Pressable>;
 return <SafeAreaView style={[styles.safe,{backgroundColor:compact?colors.soft:colors.background,maxHeight:viewportHeight}]}>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page,compact&&styles.compactPage]}>
    {header??<View style={{flexDirection:arabic?'row-reverse':'row',alignItems:'center',gap:8,minHeight:44}}>
     {!brandedHeader&&back}
     {(simpleHeader||brandedHeader)&&<View style={{flex:1}}>{heading}</View>}
    </View>}
    {hero??(!header&&!simpleHeader&&!brandedHeader?heading:null)}
    {!ready?<Panel>{loadError?<><Label>{t('تعذر تحميل البيانات المحفوظة.','Could not load saved data.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={retry}/></>:<ActivityIndicator color={colors.purple}/>}</Panel>:<><DeviceStatus/>{children}</>}
   </ScrollView>
   {ready&&footer}
  </KeyboardAvoidingView>
 </SafeAreaView>;
}
export function themedStyles(colors:Palette){return {circle:[styles.circle,{backgroundColor:colors.background,borderColor:colors.line}],menu:[styles.menu,{backgroundColor:colors.background}]};}
export const styles=StyleSheet.create({safe:{flex:1,direction:'ltr'},page:{width:'100%',maxWidth:640,alignSelf:'center',padding:22,gap:22,paddingBottom:32},text:{fontSize:16,lineHeight:28},muted:{fontSize:12,lineHeight:22},large:{fontSize:23,lineHeight:38},display:{fontSize:30,lineHeight:42},compactPage:{padding:12,gap:12,paddingBottom:22},prominentButton:{minHeight:60,paddingHorizontal:8},button:{minHeight:52,borderRadius:16,paddingHorizontal:8,paddingVertical:12,justifyContent:'center'},panel:{padding:18,borderRadius:16,gap:14},input:{borderBottomWidth:1,minHeight:52,paddingHorizontal:0,paddingVertical:8,fontSize:17,lineHeight:28},row:{flexDirection:'row',gap:8,flexWrap:'wrap'},circle:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center'},overlay:{flex:1,backgroundColor:'#00000077',justifyContent:'center',padding:22},menu:{width:'100%',maxWidth:380,alignSelf:'center',borderRadius:22,padding:22,gap:14}});
