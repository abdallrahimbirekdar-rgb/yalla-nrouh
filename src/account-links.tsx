import {Pressable,View} from 'react-native';
import {useApp} from './context';
import {brandHeader,useTheme} from './theme';
import {Icon,Label,type IconName} from './ui';

type AccountLink={title:string;icon:IconName;onPress:()=>void;danger?:boolean;disabled?:boolean};

export function AccountLinks({title,items}:{title:string;items:AccountLink[]}){
 const {state:{language}}=useApp();
 const {colors,dark}=useTheme();
 const rtl=language==='ar';
 return <View style={{gap:7}}>
  <Label large>{title}</Label>
  <View style={{borderRadius:22,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,overflow:'hidden'}}>
   {items.map(({title,icon,onPress,danger,disabled},index)=><Pressable key={icon}
    accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>({flexDirection:rtl?'row-reverse':'row',alignItems:'center',gap:12,minHeight:60,
     paddingHorizontal:13,paddingVertical:8,borderTopWidth:index?1:0,borderColor:colors.soft,
     backgroundColor:pressed?colors.selected:colors.surface,opacity:disabled ? .55 : 1})}>
    <View style={{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:colors.soft}}>
     <Icon name={icon} color={danger?colors.error:dark?brandHeader.accent:colors.brandAction}/>
    </View>
    <View style={{flex:1,minWidth:0}}><Label>{title}</Label></View>
    <Icon name={rtl?'chevron-back':'chevron-forward'} size={18} color={colors.muted}/>
   </Pressable>)}
  </View>
 </View>;
}
