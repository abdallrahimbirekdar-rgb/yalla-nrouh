import React from 'react';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
// Android owns only the WebView, native permissions and lifecycle.
// Account, settings and saved drafts have one owner: the live website.
export default function Layout(){return <SafeAreaProvider><StatusBar style="auto"/><Stack screenOptions={{headerShown:false,animation:'none'}}/></SafeAreaProvider>}
