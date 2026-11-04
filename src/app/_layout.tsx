import PermissionsIntro from '../permissions-intro';
import React from 'react';
import {ActivityIndicator,View} from 'react-native';
import {useFonts} from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider,useApp} from '../context';
import {Button,Label,useText} from '../ui';
import {useTheme} from '../theme';
function Screens(){const {ready,loadError,retry,recoveryNotice}=useApp();const t=useText();const {colors,dark}=useTheme();if(!ready)return <View style={{flex:1,backgroundColor:colors.background,justifyContent:'center',padding:24,gap:16}}>{loadError?<><Label>{t('تعذر استعادة البيانات المحفوظة.','Could not restore saved data.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={retry}/></>:<ActivityIndicator color={colors.purple}/>}</View>;return <>{recoveryNotice&&<View accessibilityRole="alert" style={{padding:12,backgroundColor:colors.background}}><Label>{t('تم فتح التطبيق بإعدادات آمنة. احتفظنا بنسخة احتياطية من البيانات القديمة التي تعذرت قراءتها.','The app opened with safe settings. A backup of unreadable old data was kept.')}</Label></View>}<StatusBar style={dark?'light':'dark'}/><Stack screenOptions={{headerShown:false,animation:'none',contentStyle:{backgroundColor:colors.background}}}/><PermissionsIntro/></>;}
export default function Layout(){const [loaded,error]=useFonts({Cairo_400Regular:require('@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf'),Cairo_600SemiBold:require('@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf'),Cairo_700Bold:require('@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf'),...Ionicons.font});if(!loaded&&!error)return <View style={{flex:1,backgroundColor:'#ffffff',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#d67749"/></View>;return <AppProvider><Screens/></AppProvider>;}
