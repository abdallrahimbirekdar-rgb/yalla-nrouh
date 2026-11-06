import React from 'react';
import {Pressable,View} from 'react-native';
import {useApp} from './context';
import {categories,regions} from './domain';
import {Button,Icon,Label,useText,useTheme} from './ui';

export function DriverShift({online,region,category,target,disabled,onToggle,soundReady,soundProblem,onEnableSound}:{online:boolean;region:number;category:string;target:boolean|null;disabled:boolean;onToggle:()=>void;soundReady:boolean;soundProblem:boolean;onEnableSound:()=>void}){
 const {state}=useApp();const t=useText();const {colors,dark}=useTheme();
 const ar=state.language==='ar';
 const accent=online?(dark?'#85dfb1':'#116443'):colors.muted;
 const area=regions[region]?.[ar?0:1];
 const service=categories.find(item=>item.id===category)?.[state.language]??category;
 return <View style={{backgroundColor:colors.background,borderColor:colors.line,borderWidth:1,borderRadius:18,padding:15,gap:12}}>
  <View style={{flexDirection:ar?'row-reverse':'row',alignItems:'center',gap:10}}>
   <View style={{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:online?(dark?'#18382b':'#e4f4eb'):colors.soft}}>
    <Icon name={online?'radio-outline':'pause-circle-outline'} size={25} color={accent}/>
   </View>
   <View style={{flex:1}}>
    <Label large>{online?t('الاستقبال مفعّل','Receiving requests'):t('خارج العمل','Off duty')}</Label>
    <Label muted>{[area,service].filter(Boolean).join(' · ')}</Label>
   </View>
  </View>
  <Button prominent tone={online?'danger':'positive'} icon={online?'stop-circle-outline':'power-outline'}
   title={target===null?(online?t('إيقاف استقبال الطلبات','Stop receiving requests'):t('تفعيل استقبال الطلبات','Start receiving requests'))
    :target?t('جارٍ تفعيل الاستقبال…','Starting requests…'):t('جارٍ إيقاف الاستقبال…','Stopping requests…')}
   disabled={disabled} onPress={onToggle}/>
  <Label muted>{t('أثناء الاستقبال والتطبيق مفتوح، يُستخدم موقعك لترتيب الطلبات القريبة.','While accepting requests with the app open, your location is used to match nearby pickups.')}</Label>
  {online&&!soundReady&&<Button secondary icon="volume-high-outline" title={t('تفعيل صوت الطلبات','Enable request sound')} onPress={onEnableSound}/>}
  {online&&soundProblem&&<Label muted>{t('تعذّر تشغيل صوت الطلبات. جرّب تفعيله مرة ثانية.','Request sound could not start. Try enabling it again.')}</Label>}
 </View>;
}

export function DriverQueueHeader({count,disabled,onRefresh}:{count:number;disabled:boolean;onRefresh:()=>void}){
 const {state}=useApp();const t=useText();const {colors}=useTheme();
 return <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:9,paddingHorizontal:2}}>
  <View style={{flex:1,minWidth:0,flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:7}}>
   <View style={{flexShrink:1}}><Label large>{t('الطلبات المتاحة','Available requests')}</Label></View>
   <View style={{minWidth:34,alignItems:'center',paddingHorizontal:8,borderRadius:10,backgroundColor:colors.selected}}><Label>{count}</Label></View>
  </View>
  <Pressable accessibilityRole="button" accessibilityLabel={t('تحديث الطلبات','Refresh requests')} accessibilityState={{disabled}}
   disabled={disabled} onPress={onRefresh} style={({pressed})=>({width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:13,borderWidth:1,borderColor:colors.line,backgroundColor:colors.background,opacity:disabled||pressed?0.5:1})}>
   <Icon name="refresh-outline" size={22}/>
  </Pressable>
 </View>;
}

export function DriverQueueEmpty(){
 const t=useText();const {colors}=useTheme();
 return <View style={{alignItems:'center',gap:7,padding:24,borderRadius:18,backgroundColor:colors.background,borderWidth:1,borderColor:colors.line}}>
  <View style={{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.selected}}><Icon name="car-outline" size={25}/></View>
  <Label large>{t('بانتظار طلب جديد','Waiting for a request')}</Label>
  <Label muted>{t('رح تظهر الطلبات المطابقة هون تلقائيًا.','Matching requests will appear here automatically.')}</Label>
 </View>;
}
