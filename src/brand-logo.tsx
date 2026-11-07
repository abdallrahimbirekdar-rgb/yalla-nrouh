import React from 'react';
import {Image,Text,View} from 'react-native';
import {isLoaded} from 'expo-font';
import {useTheme} from './theme';

/** The live website uses a bilingual lockup with real, shaped Arabic text. */
export function BrandLogo({menu=false,driver=false}:{menu?:boolean;driver?:boolean}){
 const arabic='يلّا نروّح';
 const {colors}=useTheme();
 const iconSize=menu?66:driver?62:54;
 const arabicFont=isLoaded('Cairo_700Bold')?'Cairo_700Bold':undefined;
 return <View accessible accessibilityRole="image" accessibilityLabel={arabic+' — Yalla Nrouh'}
  style={{direction:'ltr',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,
   maxWidth:menu?228:192,minWidth:0,flexShrink:1}}>
  <View style={{width:iconSize,height:iconSize,borderRadius:iconSize/2,backgroundColor:'#102a43',
   borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center',flexShrink:0}}>
   <Image source={require('../assets/brand-web-pin.webp')} resizeMode="contain" accessible={false}
    style={{width:iconSize-6,height:iconSize-6}}/>
  </View>
  <View style={{flexShrink:1,alignItems:'center',justifyContent:'center'}}>
   <Text numberOfLines={1} style={{color:colors.ink,fontFamily:arabicFont,fontWeight:arabicFont?undefined:'700',
    fontSize:menu?26:22,lineHeight:menu?39:32,writingDirection:'rtl'}}>{arabic}</Text>
   <Text numberOfLines={1} style={{color:colors.purple,fontSize:menu?14:12,lineHeight:menu?19:16,letterSpacing:.2,writingDirection:'ltr'}}>Yalla Nrouh</Text>
  </View>
 </View>;
}
