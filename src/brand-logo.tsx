import React from 'react';
import {Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {isLoaded} from 'expo-font';
import {useTheme} from './theme';

/**
 * Shared bilingual wordmark for the website and the website-backed Android app.
 * Keep real shaped Arabic text so its two shaddas always sit on ل and و,
 * rather than asking image generation to place Arabic diacritics.
 */
export function BrandLogo({menu=false}:{menu?:boolean}){
 const {colors,dark}=useTheme();
 const arabic='يلّا نروّح';
 const titleColor=colors.ink;
 const arabicFont=isLoaded('Cairo_700Bold')?'Cairo_700Bold':undefined;
 return <View accessible accessibilityRole="image" accessibilityLabel={arabic+' — Yalla Nrouh'}
  style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'flex-start',gap:6,maxWidth:menu?202:153,minWidth:0,flexShrink:1}}>
  <View style={{width:menu?43:36,height:menu?43:36,alignItems:'center',justifyContent:'center',flexShrink:0}}>
   <Ionicons name="location" size={menu?42:36} color={colors.purple} accessible={false}/>
   <Ionicons name="car-sport" size={menu?18:15} color="#ffffff" style={{position:'absolute',top:menu?8:7,left:menu?12:10}} accessible={false}/>
  </View>
  <View style={{flexShrink:1,alignItems:'flex-end',justifyContent:'center'}}>
   <Text allowFontScaling style={{color:titleColor,fontFamily:arabicFont,fontWeight:arabicFont?undefined:'700',fontSize:menu?20:16,lineHeight:menu?33:28,textAlign:'right',writingDirection:'rtl'}}>{arabic}</Text>
   <Text style={{color:dark?'#f19b75':colors.purple,fontSize:menu?12:10,fontWeight:'700',lineHeight:menu?16:14,letterSpacing:.1,textAlign:'right',writingDirection:'ltr'}}>Yalla Nrouh</Text>
  </View>
 </View>;
}
