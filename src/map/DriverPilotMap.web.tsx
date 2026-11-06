import React,{useEffect,useRef,useState} from 'react';
import type {Coordinate} from '../geo';
import {Button,Label,useText,useTheme} from '../ui';
import type {DriverPilotMapProps} from './DriverPilotMap';

type Pair=[number,number];
type Feature={type:'Feature';properties:Record<string,never>;geometry:{type:'LineString';coordinates:Pair[]}};
type RouteData=Feature|{type:'FeatureCollection';features:[]};
interface Marker {
 setLngLat(point:Pair):Marker;
 addTo(map:PilotMap):Marker;
 remove():void;
}
interface PilotMap {
 once(event:'load',callback:()=>void):void;
 on(event:'error',callback:()=>void):void;
 addSource(id:string,source:{type:'geojson';data:RouteData}):void;
 addLayer(layer:Record<string,unknown>):void;
 getSource(id:string):{setData(data:RouteData):void}|undefined;
 addControl(control:unknown,position:string):void;
 fitBounds(bounds:[Pair,Pair],options:{padding:number;duration:number;maxZoom:number}):void;
 easeTo(options:{center:Pair;duration:number}):void;
 remove():void;
}
type MapLibre={
 Map:new(options:Record<string,unknown>)=>PilotMap;
 Marker:new(options:{color?:string;element?:HTMLElement})=>Marker;
 AttributionControl:new(options:{customAttribution:string[]})=>unknown;
 NavigationControl:new(options:{showCompass:boolean})=>unknown;
};
type Host=Window&{maplibregl?:MapLibre};
const base='https://unpkg.com/maplibre-gl@5.24.0/dist/';
const empty={type:'FeatureCollection',features:[]} satisfies RouteData;
const lonLat=(point:Coordinate):Pair=>[point.longitude,point.latitude];
let pending:Promise<MapLibre>|undefined;

function loadMapLibre(){
 if(pending)return pending;
 pending=new Promise<MapLibre>((resolve,reject)=>{
  const style=document.createElement('link');
  const script=document.createElement('script');
  let scriptReady=false,styleReady=false;
  const failure=()=>{
   clearTimeout(timer);
   script.remove();style.remove();pending=undefined;
   reject(Error('maplibre_load'));
  };
  const done=()=>{
   if(!scriptReady||!styleReady)return;
   const api=(window as Host).maplibregl;
   if(!api){failure();return}
   clearTimeout(timer);resolve(api);
  };
  const timer=setTimeout(failure,14000);
  style.rel='stylesheet';
  style.href=base+'maplibre-gl.css';
  style.integrity='sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';
  style.crossOrigin='anonymous';
  style.onload=()=>{styleReady=true;done()};
  style.onerror=failure;
  script.src=base+'maplibre-gl.js';
  script.integrity='sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
  script.crossOrigin='anonymous';
  script.onload=()=>{scriptReady=true;done()};
  script.onerror=failure;
  document.head.append(style,script);
 });
 return pending;
}

export default function DriverPilotMap({point,destination,route,follow,fresh}:DriverPilotMapProps){
 const t=useText();const {colors}=useTheme();
 const host=useRef<HTMLDivElement|null>(null),map=useRef<PilotMap|null>(null);
 const api=useRef<MapLibre|null>(null),car=useRef<Marker|null>(null),end=useRef<Marker|null>(null);
 const latest=useRef({point,destination});latest.current={point,destination};
 const displayed=useRef<Pair|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const container=host.current;if(!container)return;
  let disposed=false,loaded=false;
  setError(false);setReady(false);
  const deadline=setTimeout(()=>{if(!disposed&&!loaded)setError(true)},16000);
  void loadMapLibre().then(lib=>{
   if(disposed)return;
   api.current=lib;
   const instance=new lib.Map({
    container,style:'https://tiles.openfreemap.org/styles/liberty',
    center:lonLat(latest.current.point??latest.current.destination),zoom:16.5,pitch:0,
    maxPitch:0,dragRotate:false,renderWorldCopies:false,attributionControl:false,
   });
   map.current=instance;
   instance.addControl(new lib.AttributionControl({customAttribution:[
    'Valhalla · FOSSGIS',
    '<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Fix the map</a>',
   ]}),'bottom-right');
   instance.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
   instance.on('error',()=>{if(!disposed&&!loaded)setError(true)});
   instance.once('load',()=>{
    if(disposed)return;
    clearTimeout(deadline);loaded=true;
    instance.addSource('driver-route',{type:'geojson',data:empty});
    instance.addLayer({id:'driver-route-outline',type:'line',source:'driver-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':9}});
    instance.addLayer({id:'driver-route-line',type:'line',source:'driver-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#126de1','line-width':6}});
    setReady(true);setError(false);
   });
  }).catch(()=>{if(!disposed)setError(true)});
  return()=>{
   disposed=true;clearTimeout(deadline);
   car.current?.remove();end.current?.remove();map.current?.remove();
   car.current=null;end.current=null;map.current=null;api.current=null;displayed.current=null;
  };
 },[attempt]);
 useEffect(()=>{
  const instance=map.current,lib=api.current;if(!ready||!instance||!lib)return;
  if(!end.current)end.current=new lib.Marker({color:'#bc5d36'}).setLngLat(lonLat(destination)).addTo(instance);
  else end.current.setLngLat(lonLat(destination));
 },[ready,destination]);
 useEffect(()=>{
  const instance=map.current;if(!ready||!instance)return;
  const line=route&&route.length>1?route.map(lonLat):[];
  instance.getSource('driver-route')?.setData(line.length?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:line}}:empty);
  if(!follow&&line.length){
   const west=Math.min(...line.map(pair=>pair[0])),east=Math.max(...line.map(pair=>pair[0]));
   const south=Math.min(...line.map(pair=>pair[1])),north=Math.max(...line.map(pair=>pair[1]));
   instance.fitBounds([[west,south],[east,north]],{padding:35,duration:450,maxZoom:16.5});
  }
 },[ready,route,follow]);
 useEffect(()=>{
  const instance=map.current,lib=api.current;if(!ready||!instance||!lib||!point)return;
  const next=lonLat(point),previous=displayed.current;
  if(!car.current){
   const dot=document.createElement('div');
   dot.setAttribute('role','img');dot.setAttribute('aria-label','GPS');
   Object.assign(dot.style,{width:'21px',height:'21px',background:'#126de1',border:'3px solid white',borderRadius:'50%',boxShadow:'0 0 0 6px #126de144'});
   car.current=new lib.Marker({element:dot}).setLngLat(lonLat(point)).addTo(instance);
  }
  const marker=car.current;
  if(follow&&fresh)instance.easeTo({center:next,duration:380});
  if(!previous||!fresh){displayed.current=next;marker.setLngLat(next);return}
  const began=performance.now();
  let frame=0;
  const move=(now:number)=>{
   const fraction=Math.min(1,(now-began)/380);
   const here:Pair=[previous[0]+(next[0]-previous[0])*fraction,previous[1]+(next[1]-previous[1])*fraction];
   displayed.current=here;marker.setLngLat(here);
   if(fraction<1)frame=requestAnimationFrame(move);
  };
  frame=requestAnimationFrame(move);
  return()=>cancelAnimationFrame(frame);
 },[ready,point,follow,fresh]);
 return React.createElement('div',{style:{height:'100%',minHeight:180,width:'100%',position:'relative',background:colors.surface}},
  React.createElement('div',{ref:host,role:'region','aria-label':'MapLibre',style:{position:'absolute',inset:0}}),
  (!ready||error)&&React.createElement('div',{style:{position:'absolute',top:14,left:14,right:14,padding:12,background:colors.background}},
   <Label>{error?t('تعذّر تحميل خريطة MapLibre على هذا الجهاز.','Could not load the MapLibre map on this device.'):t('جارٍ تحميل خريطة MapLibre…','Loading MapLibre…')}</Label>,
   error&&<Button secondary title={t('إعادة تحميل الخريطة','Reload map')} onPress={()=>setAttempt(value=>value+1)}/>));
}
