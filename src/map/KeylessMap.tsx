import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View} from 'react-native';
import {WebView} from 'react-native-webview';
import {type Coordinate} from '../geo';
import {Button,Label,useText,useTheme} from '../ui';
import {mapHtml,readMapPoint} from './keyless-map-html';
export default function KeylessMap({point,onChange,compact=false,route,readOnly=false,lean=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean;lean?:boolean}) {
 const t=useText();const {colors,dark}=useTheme();const view=useRef<WebView>(null);const [error,setError]=useState(false);const initialPoint=useRef(point);const arabic=t('ar','en')==='ar';const initialLean=useRef(lean);const source=useMemo(()=>({html:mapHtml(initialPoint.current,arabic,dark,readOnly,initialLean.current),baseUrl:'https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/'}),[arabic,dark,readOnly]);
 useEffect(()=>{view.current?.injectJavaScript(`window.setLean&&window.setLean(${JSON.stringify(lean)});true;`);},[lean]);
 useEffect(()=>{if(point)view.current?.injectJavaScript(`window.updatePoint&&window.updatePoint(${JSON.stringify(point)});true;`);},[point]);
 useEffect(()=>{view.current?.injectJavaScript(`window.updateRoute&&window.updateRoute(${JSON.stringify(route??[])});true;`);},[route]);
 return <View key={dark?'dark':'light'} style={{height:compact?'100%':300,overflow:'hidden',borderRadius:compact?0:18}}>
 <WebView ref={view} source={source} style={{flex:1}} originWhitelist={['*']} javaScriptEnabled cacheEnabled cacheMode="LOAD_DEFAULT" domStorageEnabled={false} mixedContentMode="never" setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url==='https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/'} onLoadEnd={()=>{view.current?.injectJavaScript(`window.setLean&&window.setLean(${JSON.stringify(lean)});true;`);view.current?.injectJavaScript(`window.updateRoute&&window.updateRoute(${JSON.stringify(route??[])});true;`);if(point)view.current?.injectJavaScript(`window.updatePoint&&window.updatePoint(${JSON.stringify(point)});true;`);}} onError={()=>setError(true)} onMessage={event=>{const next=readMapPoint(event.nativeEvent.data);if(next)onChange(next);}}/>
 {error&&<View style={{position:'absolute',left:12,right:12,top:30,backgroundColor:colors.background,padding:16,gap:10}}><Label>{t('تعذر تحميل الخريطة. تحقق من اتصال الإنترنت.','Could not load the map. Check your internet.')}</Label><Button title={t('إعادة المحاولة','Try again')} onPress={()=>{setError(false);view.current?.reload();}}/></View>}
 </View>;
}
