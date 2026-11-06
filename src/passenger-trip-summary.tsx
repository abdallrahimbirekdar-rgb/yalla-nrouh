import React from 'react';
import {View} from 'react-native';
import {useApp} from './context';
import {categories} from './domain';
import {Icon,Label,useText,useTheme} from './ui';

export function PassengerFare({fare}:{fare:number}){
 const t=useText();
 const {colors}=useTheme();
 return <View accessibilityLiveRegion="polite" style={{backgroundColor:colors.selected,borderRadius:12,paddingHorizontal:12,paddingVertical:7,alignItems:'center'}}>
  <Label muted>{t('الأجرة التقديرية','Estimated fare')}</Label>
  <Label display>{fare.toLocaleString('en-US')} {t('ل.س','SYP')}</Label>
 </View>;
}

export function PassengerStops({pickup,destination,category}:{pickup:string;destination:string;category:string}){
 const {state}=useApp();
 const {colors}=useTheme();
 const t=useText();
 const row={flexDirection:state.language==='ar'?'row-reverse' as const:'row' as const,alignItems:'center' as const,gap:9};
 return <View style={{gap:6}}>
  <View style={row}>
   <Icon name="radio-button-on-outline" size={18} color={colors.purple}/>
   <View style={{flex:1}}><Label muted>{t('الانطلاق','Pickup')}</Label><Label>{pickup}</Label></View>
  </View>
  <View style={row}>
   <Icon name="location-outline" size={18} color={colors.purple}/>
   <View style={{flex:1}}><Label muted>{t('الوجهة','Destination')}</Label><Label>{destination}</Label></View>
  </View>
  <Label muted>{categories.find(car=>car.id===category)?.[state.language]} · {t('الدفع نقدًا','Pay in cash')}</Label>
 </View>;
}
