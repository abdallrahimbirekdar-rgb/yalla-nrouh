import React from 'react';
import {ActivityIndicator,Image,Text,useWindowDimensions,View} from 'react-native';

export default function LaunchScreen({loadingLabel,detail}:{loadingLabel:string;detail:string}){
 const {width,height}=useWindowDimensions();
 const mapSize=Math.min(width,Math.max(135,height*.42),290);
 return <View pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel={loadingLabel}
  style={{position:'absolute',inset:0,backgroundColor:'#071c39',justifyContent:'center',alignItems:'center'}}>
  <View style={{width:mapSize,height:mapSize,alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
   {[1,.78,.56].map((scale,index)=><View key={scale} style={{position:'absolute',width:mapSize*scale,
    height:mapSize*scale,borderRadius:mapSize*scale/2,borderWidth:1,borderColor:index===2?'#438dbd':'#255482',
    backgroundColor:index===0?'#0a2b52':index===1?'#0e3766':'#124476'}}/>)}
   <View style={{position:'absolute',width:mapSize*.85,height:2,backgroundColor:'#3f92b4',transform:[{rotate:'-32deg'}]}}/>
   <View style={{position:'absolute',width:mapSize*.9,height:1,backgroundColor:'#347499',transform:[{rotate:'28deg'}]}}/>
   <View style={{position:'absolute',left:mapSize*.16,bottom:mapSize*.28,width:8,height:8,borderRadius:4,backgroundColor:'#53efdb'}}/>
   <View style={{position:'absolute',right:mapSize*.17,top:mapSize*.28,width:8,height:8,borderRadius:4,backgroundColor:'#53efdb'}}/>
   <View style={{width:76,height:76,borderRadius:38,backgroundColor:'#082648',borderWidth:1,
    borderColor:'#53efdb',alignItems:'center',justifyContent:'center'}}>
    <Image source={require('../../assets/brand-web-pin.webp')} resizeMode="contain"
     accessible={false} style={{width:68,height:68}}/>
   </View>
  </View>
  <View style={{marginTop:12,padding:16,borderRadius:24,
   backgroundColor:'#edf3fb',alignItems:'center',gap:7,maxWidth:390,width:'90%',alignSelf:'center'}}>
   <Text style={{color:'#082648',fontSize:24,fontWeight:'700',textAlign:'center'}}>يلّا نروح</Text>
   <Text style={{color:'#082648',fontSize:17,fontWeight:'600',textAlign:'center'}}>{loadingLabel}</Text>
   <Text style={{color:'#385570',fontSize:13,textAlign:'center'}}>{detail}</Text>
   <ActivityIndicator size="small" color="#0053b9" style={{marginTop:5}}/>
  </View>
 </View>;
}
