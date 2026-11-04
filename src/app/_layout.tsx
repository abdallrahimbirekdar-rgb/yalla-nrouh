import React from 'react';
import {ActivityIndicator,View} from 'react-native';
import {useFonts} from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider} from '../context';
import {useTheme} from '../theme';
function Screens(){const {colors,dark}=useTheme();return <><StatusBar style={dark?'light':'dark'}/><Stack screenOptions={{headerShown:false,animation:'none',contentStyle:{backgroundColor:colors.background}}}/></>;}
export default function Layout(){const [loaded,error]=useFonts({Cairo_400Regular:require('@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf'),Cairo_600SemiBold:require('@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf'),Cairo_700Bold:require('@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf'),...Ionicons.font});if(!loaded&&!error)return <View style={{flex:1,backgroundColor:'#ffffff',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#d67749"/></View>;return <AppProvider><Screens/></AppProvider>;}
