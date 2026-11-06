import React,{useState} from 'react';
import {Pressable,View} from 'react-native';
import {useApp} from './context';
import {categories,regions} from './domain';
import {Icon,Label,Panel,useText,useTheme} from './ui';
export default function RideOptions({driver=false}:{driver?:boolean}){
 const {draft,setDraft,state}=useApp();const t=useText();const {colors}=useTheme();const [open,setOpen]=useState(false);const ar=state.language==='ar';
 const car=categories.find(category=>category.id===draft.category);
 return <Panel>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityLabel={driver?t('منطقة العمل ونوع السيارة','Work region and car type'):t('خيارات الرحلة','Ride options')} onPress={()=>setOpen(value=>!value)} style={{flexDirection:ar?'row-reverse':'row',alignItems:'center',gap:10,minHeight:48}}>
   <Icon name="car-outline"/><View style={{flex:1,gap:2}}><Label>{driver?t('منطقة العمل ونوع السيارة','Work region and car type'):t('خيارات الرحلة','Ride options')}</Label><Label muted>{car?.[state.language]} · {driver?regions[draft.region]?.[ar?0:1]:t('نقدًا','Cash')}</Label></View><Icon name={open?'chevron-up':'chevron-down'} size={18}/>
  </Pressable>
  {open&&<>
   <Label muted>{t('نوع السيارة','Car type')}</Label>
   <View style={{flexDirection:ar?'row-reverse':'row',flexWrap:'wrap',gap:7}}>{categories.map(category=><Pressable key={category.id} accessibilityRole="radio" accessibilityState={{checked:draft.category===category.id}} onPress={()=>setDraft(previous=>({...previous,category:category.id}))} style={{padding:10,borderRadius:12,borderWidth:1,borderColor:draft.category===category.id?colors.purple:colors.line,backgroundColor:draft.category===category.id?colors.selected:colors.background}}><Label muted>{category[state.language]}</Label></Pressable>)}</View>
   {driver&&<>
    <Label muted>{t('محافظة العمل','Work governorate')}</Label>
    <View style={{flexDirection:ar?'row-reverse':'row',flexWrap:'wrap',gap:6}}>{regions.map((region,index)=><Pressable key={region[1]} accessibilityRole="radio" accessibilityState={{checked:draft.region===index}} onPress={()=>setDraft(previous=>({...previous,region:index}))} style={{padding:8,borderRadius:10,backgroundColor:index===draft.region?colors.selected:colors.background}}><Label muted>{region[ar?0:1]}</Label></Pressable>)}</View>
   </>}
  </>}
 </Panel>;
}
