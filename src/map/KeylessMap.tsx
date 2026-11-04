import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {WebView} from 'react-native-webview';
import {type Coordinate} from '../geo';
import {Button,Label,useText} from '../ui';
import {mapHtml,readMapPoint} from './keyless-map-html';
export default function KeylessMap({point,onChange,compact=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean}) {
 const t=useText();const view=useRef<WebView>(null);const [error,setError]=useState(false);const [source]=useState(()=>({html:mapHtml(point,t('ar','en')==='ar'),baseUrl:'https://yallanrouh.local/'}));
 useEffect(()=>{if(point)view.current?.injectJavaScript(`window.updatePoint&&window.updatePoint(${JSON.stringify(point)});true;`);},[point]);
 return <View style={{height:compact?'100%':300,overflow:'hidden',borderRadius:compact?0:18}}>
 <WebView ref={view} source={source} style={{flex:1}} originWhitelist={['*']} javaScriptEnabled domStorageEnabled={false} mixedContentMode="never" setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url==='https://yallanrouh.local/'} onError={()=>setError(true)} onMessage={event=>{const next=readMapPoint(event.nativeEvent.data);if(next)onChange(next);}}/>
 {error&&<View style={{position:'absolute',left:12,right:12,top:30,backgroundColor:'white',padding:16,gap:10}}><Label>{t('تعذر تحميل الخريطة. تحقق من اتصال الإنترنت.','Could not load the map. Check your internet.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={()=>{setError(false);view.current?.reload();}}/></View>}
 </View>;
}
