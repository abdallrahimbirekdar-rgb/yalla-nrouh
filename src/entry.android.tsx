import React from 'react';
import {registerRootComponent} from 'expo';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import FreshAndroid from './android-fresh/App';

function AndroidApp(){
 return <SafeAreaProvider><StatusBar style="auto"/><FreshAndroid/></SafeAreaProvider>;
}

registerRootComponent(AndroidApp);
