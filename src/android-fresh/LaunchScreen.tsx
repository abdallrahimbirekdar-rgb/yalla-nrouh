import React from 'react';
import {ActivityIndicator,Image,Text,View} from 'react-native';

/**
 * A small, native copy of the CURRENT website header identity.
 * Keep its artwork and spelling aligned with src/brand-logo.tsx.
 * Do not import the website's router, auth or context into the Android host.
 */
export default function LaunchScreen({loadingLabel}:{loadingLabel:string}){
 return <View pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel={loadingLabel}
  style={{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:'#071c39',
   alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
  <View style={{alignItems:'center',gap:24}}>
   <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:9}}>
    <View style={{height:60,width:60,borderRadius:30,backgroundColor:'#082648',
     borderWidth:1,borderColor:'#53efdb',alignItems:'center',justifyContent:'center'}}>
     <Image source={require('../../assets/brand-web-pin.webp')} resizeMode="contain"
      accessible={false} style={{height:54,width:54}}/>
    </View>
    <View style={{alignItems:'center',justifyContent:'center'}}>
     <Text numberOfLines={1} style={{color:'#ffffff',fontSize:24,lineHeight:34,fontWeight:'700',writingDirection:'rtl'}}>يلّا نروح</Text>
     <Text numberOfLines={1} style={{color:'#53efdb',fontSize:13,lineHeight:19,letterSpacing:0.2,writingDirection:'ltr'}}>Yalla Nrouh</Text>
    </View>
   </View>
   <ActivityIndicator size="small" color="#53efdb"/>
  </View>
 </View>;
}
