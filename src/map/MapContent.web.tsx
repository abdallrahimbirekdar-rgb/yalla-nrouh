import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import OlMap from 'ol/Map.js';
import OlView from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import Translate from 'ol/interaction/Translate.js';
import Collection from 'ol/Collection.js';
import {defaults as controls} from 'ol/control/defaults.js';
import {defaults as interactions} from 'ol/interaction/defaults.js';
import {Circle as CircleStyle,Fill,Stroke,Style} from 'ol/style.js';
import {fromLonLat,toLonLat} from 'ol/proj.js';
import {containsCoordinate} from 'ol/extent.js';
import 'ol/ol.css';
import './map.css';
import {isCoordinate,type Coordinate} from '../geo';
import {Button,Label,useText,useTheme} from '../ui';

export default function MapCanvas({point,onChange,compact=false,route,readOnly=false}:{point:Coordinate|null;onChange:(point:Coordinate)=>void;compact?:boolean;route?:Coordinate[];readOnly?:boolean}){
  const t=useText();const {dark}=useTheme();const host=useRef<HTMLDivElement>(null);const map=useRef<OlMap|null>(null);const feature=useRef<Feature<Point>|null>(null);
  const routeFeature=useRef<Feature<LineString>|null>(null);
  const choose=useRef(onChange);choose.current=onChange;const current=useRef(point);current.current=point;
  const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[ready,setReady]=useState(false);
  useEffect(()=>{
    if(!host.current)return;let disposed=false;setError(false);setReady(false);
    const start=current.current??{latitude:33.5138,longitude:36.2765};
    const source=new OSM({wrapX:false});const basemap=new TileLayer({source,preload:0,cacheSize:64});const pin=new Feature<Point>();feature.current=pin;
    const pins=new VectorLayer({source:new VectorSource({features:[pin]}),zIndex:1000,style:[new Style({image:new CircleStyle({radius:13,fill:new Fill({color:'#ff917c'}),stroke:new Stroke({color:'#fff9ef',width:4})})}),new Style({image:new CircleStyle({radius:4,fill:new Fill({color:'#17376c'})})})]});
    const routePin=new Feature<LineString>();routeFeature.current=routePin;const routeLayer=new VectorLayer({source:new VectorSource({features:[routePin]}),zIndex:500,style:new Style({stroke:new Stroke({color:'#2688e8',width:5})})});
    const instance=new OlMap({target:host.current,layers:[basemap,routeLayer,pins],view:new OlView({center:fromLonLat([start.longitude,start.latitude]),zoom:13,maxZoom:19,enableRotation:false}),controls:controls({attributionOptions:{collapsible:false}}),interactions:interactions({mouseWheelZoom:false})});map.current=instance;
    const select=(coordinate:number[])=>{const [longitude,latitude]=toLonLat(coordinate);const next={latitude,longitude};if(isCoordinate(next))choose.current(next)};
    if(!readOnly)instance.on('singleclick',event=>select(event.coordinate));
    const movePin=new Translate({features:new Collection([pin]),hitTolerance:14});movePin.on('translateend',()=>{const coordinate=pin.getGeometry()?.getCoordinates();if(coordinate)select(coordinate)});if(!readOnly)instance.addInteraction(movePin);
    source.on('tileloaderror',()=>{if(!disposed)setError(true)});source.on('tileloadend',()=>{if(!disposed)setError(false)});
    const resize=new ResizeObserver(()=>instance.updateSize());resize.observe(host.current);setReady(true);
    return()=>{disposed=true;resize.disconnect();instance.setTarget(undefined);instance.dispose();map.current=null;feature.current=null};
  },[attempt,readOnly]);
  useEffect(()=>{
    const instance=map.current,pin=feature.current;if(!instance||!pin||!ready)return;
    if(!point){pin.setGeometry(undefined);return}
    const coordinate=fromLonLat([point.longitude,point.latitude]);pin.setGeometry(new Point(coordinate));
    if(!containsCoordinate(instance.getView().calculateExtent(instance.getSize()),coordinate))instance.getView().setCenter(coordinate);
  },[point,ready]);
  useEffect(()=>{const instance=map.current,f=routeFeature.current;if(!instance||!f||!ready)return;if(!route||route.length<2){f.setGeometry(undefined);return;}const line=new LineString(route.map(p=>fromLonLat([p.longitude,p.latitude])));f.setGeometry(line);instance.getView().fit(line,{padding:[30,30,30,30],maxZoom:16,duration:0});},[route,ready]);
  if(route)return <View><Label>{t('افتح هذا الطريق في Google Maps باستخدام زر الملاحة.','Open this route in Google Maps with the navigation button.')}</Label></View>;
  return <View style={compact?{flex:1}:{gap:10}}>
    {!compact&&!readOnly&&<Label>{t('اضغط على الخريطة لاختيار الموقع، أو اسحب العلامة لتعديله.','Tap the map to choose a location, or drag the pin to adjust it.')}</Label>}
    {React.createElement('div',{ref:host,className:'yn-location-map'+(dark?' yn-dark-map':''),role:'region',tabIndex:0,'aria-label':t('خريطة اختيار الموقع','Choose a location on the map'),style:{height:compact?'100%':360,minHeight:compact?260:360,width:'100%',borderRadius:compact?0:16,overflow:'hidden',background:dark?'#172027':'#e9e3dc',zIndex:0}})}
    {!compact&&!readOnly&&<Button secondary icon="locate-outline" title={t('اختيار مركز الخريطة','Select map center')} disabled={!ready} onPress={()=>{const p=map.current?.getView().getCenter();if(p){const [longitude,latitude]=toLonLat(p);if(isCoordinate({latitude,longitude}))choose.current({latitude,longitude})}}}/>}
    {error&&<View accessibilityRole="alert"><Label>{t('تعذر تحميل تفاصيل الخريطة. تحقق من الإنترنت أو استخدم الإحداثيات أدناه.','Map details could not load. Check your connection or use coordinates below.')}</Label><Button secondary title={t('إعادة تحميل الخريطة','Reload map')} onPress={()=>setAttempt(n=>n+1)}/></View>}
    {!compact&&<Label muted>{t('OpenStreetMap • اسحب للتنقل واستعمل + و − للتكبير.','OpenStreetMap • Drag to move and use + and − to zoom.')}</Label>}
  </View>;
}
