import {View} from 'react-native';
import {useApp} from './context';
import {Icon,Label,useTheme,type IconName} from './ui';

export function RideStatusCard({title,detail,icon,warning=false,children}:{
 title:string;detail?:string;icon:IconName;warning?:boolean;children?:React.ReactNode;
}){
 const {state:{language}}=useApp();
 const {colors}=useTheme();
 return <View style={{gap:5,paddingHorizontal:12,paddingVertical:9,borderRadius:14,
  backgroundColor:warning?colors.surface:colors.selected,borderWidth:1,borderColor:warning?colors.line:colors.selected}}>
  <View accessibilityLiveRegion="polite" style={{flexDirection:language==='ar'?'row-reverse':'row',alignItems:'center',gap:8}}>
   <Icon name={icon} color={colors.purple}/>
   <View style={{flex:1}}><Label>{title}</Label>{detail&&<Label muted>{detail}</Label>}</View>
  </View>
  {children}
 </View>;
}
