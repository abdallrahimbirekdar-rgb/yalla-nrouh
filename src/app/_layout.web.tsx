import SiteShellSync from '../site-shell-sync';
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
function Screens(){const {ready,loadError,retry}=useApp();const t=useText();const {colors,dark}=useTheme();if(!ready)return <View style={{flex:1,backgroundColor:colors.background,justifyContent:'center',padding:24,gap:16}}>{loadError?<><Label>{t('تعذر استعادة البيانات المحفوظة.','Could not restore saved data.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={retry}/></>:<ActivityIndicator color={colors.purple}/>}</View>;return <><StatusBar style={dark?'light':'dark'}/><Stack screenOptions={{headerShown:false,animation:'none',contentStyle:{backgroundColor:colors.background}}}/><SiteShellSync/><PermissionsIntro/></>;}
export default function Layout(){const [loaded,error]=useFonts({Cairo_400Regular:require('@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf'),Cairo_600SemiBold:require('@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf'),Cairo_700Bold:require('@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf'),...Ionicons.font});if(!loaded&&!error)return <View style={{flex:1,backgroundColor:'#ffffff',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#d67749"/></View>;return <AppProvider><Screens/></AppProvider>;}
