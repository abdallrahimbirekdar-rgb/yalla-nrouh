import React from 'react';
import {Image,Text,View} from 'react-native';
import {isLoaded} from 'expo-font';
import {useTheme} from './theme';

/** The live website uses a bilingual lockup with real, shaped Arabic text. */
export function BrandLogo({menu=false}:{menu?:boolean}){
 const arabic='يلّا نروّح';
 const {colors,dark}=useTheme();
 const arabicFont=isLoaded('Cairo_700Bold')?'Cairo_700Bold':undefined;
 return <View accessible accessibilityRole="image" accessibilityLabel={arabic+' — Yalla Nrouh'}
  style={{direction:'ltr',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:6,
   maxWidth:menu?202:138,minWidth:0,flexShrink:1,paddingHorizontal:menu?11:5,paddingVertical:menu?6:4,borderRadius:menu?13:10,
   backgroundColor:colors.background,borderWidth:1,borderColor:colors.line}}>
  <Image source={require('../assets/brand-web-pin.webp')} resizeMode="contain" accessible={false}
   style={{width:menu?48:33,height:menu?43:32}}/>
  <View style={{flexShrink:1,alignItems:'center',justifyContent:'center'}}>
   <Text style={{color:colors.ink,fontFamily:arabicFont,fontWeight:arabicFont?undefined:'700',
    fontSize:menu?20:16,lineHeight:menu?33:27,writingDirection:'rtl'}}>{arabic}</Text>
   <Text style={{color:dark?'#f19b75':colors.purple,fontSize:menu?12:10,lineHeight:menu?17:14,letterSpacing:.2,writingDirection:'ltr'}}>Yalla Nrouh</Text>
  </View>
 </View>;
}
