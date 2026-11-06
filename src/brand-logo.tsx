import React from 'react';
import {Image,Text,View} from 'react-native';
import {isLoaded} from 'expo-font';

/** The live website uses a bilingual lockup with real, shaped Arabic text. */
export function BrandLogo({menu=false}:{menu?:boolean}){
 const arabic='يلّا نروح';
 const arabicFont=isLoaded('Cairo_700Bold')?'Cairo_700Bold':undefined;
 return <View accessible accessibilityRole="image" accessibilityLabel={arabic+' — Yalla Nrouh'}
  style={{direction:'ltr',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,
   maxWidth:menu?202:138,minWidth:0,flexShrink:1,paddingHorizontal:menu?11:8,paddingVertical:menu?6:4,borderRadius:menu?13:10,
   backgroundColor:'#0d2338',borderWidth:1,borderColor:'#1b3e52'}}>
  <Image source={require('../assets/brand-web-pin.webp')} resizeMode="contain" accessible={false}
   style={{width:menu?52:43,height:menu?43:36}}/>
  <View style={{flexShrink:1,alignItems:'center',justifyContent:'center'}}>
   <Text style={{color:'#fff',fontFamily:arabicFont,fontWeight:arabicFont?undefined:'700',
    fontSize:menu?22:18,lineHeight:menu?33:27,writingDirection:'rtl'}}>{arabic}</Text>
   <Text style={{color:'#e7f5f6',fontSize:menu?12:10,lineHeight:menu?17:14,letterSpacing:.2,writingDirection:'ltr'}}>Yalla Nrouh</Text>
  </View>
 </View>;
}
