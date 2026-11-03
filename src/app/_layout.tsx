import React from 'react';
import {ActivityIndicator,View} from 'react-native';
import {useFonts,Cairo_400Regular,Cairo_600SemiBold,Cairo_700Bold} from '@expo-google-fonts/cairo';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider} from '../context';
export default function Layout(){const [loaded,error]=useFonts({Cairo_400Regular,Cairo_600SemiBold,Cairo_700Bold,...Ionicons.font});if(!loaded&&!error)return <View style={{flex:1,backgroundColor:'#0b0e1b',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#a694ff"/></View>;return <AppProvider><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#0b0e1b'}}}/></AppProvider>}
