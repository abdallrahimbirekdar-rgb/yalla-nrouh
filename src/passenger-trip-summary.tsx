import React from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import {useApp} from './context';
import {categories} from './domain';
import {Icon,Label,useText,useTheme} from './ui';

export function RideFooter({children}:{children:React.ReactNode}){
 const {colors}=useTheme();
 return <View style={{backgroundColor:colors.background,borderTopWidth:1,borderColor:colors.line,paddingHorizontal:14,paddingVertical:8}}>
  <View style={{width:'100%',maxWidth:616,alignSelf:'center',gap:8}}>{children}</View>
 </View>;
}

export function PassengerFare({fare,pending=false}:{fare:number|null;pending?:boolean}){
 const t=useText();
 const {colors}=useTheme();
 return <View accessibilityLiveRegion="polite" style={{backgroundColor:colors.selected,borderRadius:12,paddingHorizontal:12,paddingVertical:7,alignItems:'center',justifyContent:'center',minHeight:82}}>
  <Label muted>{t('الأجرة التقديرية','Estimated fare')}</Label>
  {fare!==null?<Label display>{fare.toLocaleString('en-US')} {t('ل.س','SYP')}</Label>:pending
   ?<View style={{flexDirection:'row',alignItems:'center',gap:8}}><ActivityIndicator color={colors.purple}/><Label>{t('جارٍ حساب الأجرة…','Calculating fare…')}</Label></View>
   :<Label muted>{t('الأجرة غير متاحة حاليًا','Fare currently unavailable')}</Label>}
 </View>;
}

export function PassengerStops({pickup,destination,category,onEditPickup,onEditDestination}:{pickup:string;destination:string;category?:string;onEditPickup?:()=>void;onEditDestination?:()=>void}){
 const {state}=useApp();
 const {colors}=useTheme();
 const t=useText();
 const row={flexDirection:state.language==='ar'?'row-reverse' as const:'row' as const,alignItems:'center' as const,gap:9};
 const edit=(name:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
  style={({pressed})=>({minHeight:44,justifyContent:'center',paddingHorizontal:10,borderRadius:10,backgroundColor:pressed?colors.selected:colors.soft})}>
  <Label>{t('تعديل','Edit')}</Label>
 </Pressable>;
 return <View style={{gap:6}}>
  <View style={row}>
   <Icon name="radio-button-on-outline" size={18} color={colors.purple}/>
   <View style={{flex:1}}><Label muted>{t('الانطلاق','Pickup')}</Label><Label>{pickup}</Label></View>
   {onEditPickup&&edit(t('تعديل نقطة الانطلاق','Change pickup point'),onEditPickup)}
  </View>
  <View style={row}>
   <Icon name="location-outline" size={18} color={colors.purple}/>
   <View style={{flex:1}}><Label muted>{t('الوجهة','Destination')}</Label><Label>{destination}</Label></View>
   {onEditDestination&&edit(t('تعديل الوجهة','Change destination'),onEditDestination)}
  </View>
  {category&&<Label muted>{categories.find(car=>car.id===category)?.[state.language]} · {t('الدفع نقدًا','Pay in cash')}</Label>}
 </View>;
}
