import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import OlMap from 'ol/Map.js';
import OlView from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import LayerGroup from 'ol/layer/Group.js';
import Translate from 'ol/interaction/Translate.js';
import Collection from 'ol/Collection.js';
import {defaults as controls} from 'ol/control/defaults.js';
import {defaults as interactions} from 'ol/interaction/defaults.js';
import {Circle as CircleStyle,Fill,Stroke,Style} from 'ol/style.js';
import {fromLonLat,toLonLat} from 'ol/proj.js';
import {containsCoordinate} from 'ol/extent.js';
import {apply} from 'ol-mapbox-style';
import 'ol/ol.css';
import './map.css';
import {isCoordinate,type Coordinate} from '../geo';
import {Button,Label,useText} from '../ui';

export default function MapCanvas({point,onChange}:{point:Coordinate|null;onChange:(point:Coordinate)=>void}){
  const t=useText();const host=useRef<HTMLDivElement>(null);const map=useRef<OlMap|null>(null);const feature=useRef<Feature<Point>|null>(null);
  const choose=useRef(onChange);choose.current=onChange;const current=useRef(point);current.current=point;
  const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[ready,setReady]=useState(false);
  useEffect(()=>{
    if(!host.current)return;let disposed=false;setError(false);setReady(false);
    const start=current.current??{latitude:33.5138,longitude:36.2765};
    const basemap=new LayerGroup();const pin=new Feature<Point>();feature.current=pin;
    const pins=new VectorLayer({source:new VectorSource({features:[pin]}),zIndex:1000,style:[new Style({image:new CircleStyle({radius:13,fill:new Fill({color:'#ff917c'}),stroke:new Stroke({color:'#fff9ef',width:4})})}),new Style({image:new CircleStyle({radius:4,fill:new Fill({color:'#17376c'})})})]});
    const instance=new OlMap({target:host.current,layers:[basemap,pins],view:new OlView({center:fromLonLat([start.longitude,start.latitude]),zoom:13,maxZoom:19}),controls:controls({attributionOptions:{collapsible:false}}),interactions:interactions({mouseWheelZoom:false})});map.current=instance;
    const select=(coordinate:number[])=>{const [longitude,latitude]=toLonLat(coordinate);const next={latitude,longitude};if(isCoordinate(next))choose.current(next)};
    instance.on('singleclick',event=>select(event.coordinate));
    const movePin=new Translate({features:new Collection([pin]),hitTolerance:14});movePin.on('translateend',()=>{const coordinate=pin.getGeometry()?.getCoordinates();if(coordinate)select(coordinate)});instance.addInteraction(movePin);
    apply(basemap,'https://tiles.openfreemap.org/styles/liberty').then(()=>{if(!disposed)setError(false)}).catch(()=>{if(!disposed)setError(true)});
    const resize=new ResizeObserver(()=>instance.updateSize());resize.observe(host.current);setReady(true);
    return()=>{disposed=true;resize.disconnect();instance.setTarget(undefined);instance.dispose();map.current=null;feature.current=null};
  },[attempt]);
  useEffect(()=>{
    const instance=map.current,pin=feature.current;if(!instance||!pin||!ready)return;
    if(!point){pin.setGeometry(undefined);return}
    const coordinate=fromLonLat([point.longitude,point.latitude]);pin.setGeometry(new Point(coordinate));
    if(!containsCoordinate(instance.getView().calculateExtent(instance.getSize()),coordinate))instance.getView().setCenter(coordinate);
  },[point,ready]);
  return <View style={{gap:10}}>
    <Label>{t('اضغط على الخريطة لاختيار الموقع، أو اسحب العلامة لتعديله.','Tap the map to choose a location, or drag the pin to adjust it.')}</Label>
    {React.createElement('div',{ref:host,className:'yn-location-map',role:'region',tabIndex:0,'aria-label':t('خريطة اختيار الموقع','Choose a location on the map'),style:{height:360,width:'100%',borderRadius:24,overflow:'hidden',background:'#e9e3dc',zIndex:0}})}
    <Button secondary icon="locate-outline" title={t('اختيار مركز الخريطة','Select map center')} disabled={!ready} onPress={()=>{const p=map.current?.getView().getCenter();if(p){const [longitude,latitude]=toLonLat(p);if(isCoordinate({latitude,longitude}))choose.current({latitude,longitude})}}}/>
    {error&&<View accessibilityRole="alert"><Label>{t('تعذر تحميل تفاصيل الخريطة. تحقق من الإنترنت أو استخدم الإحداثيات أدناه.','Map details could not load. Check your connection or use coordinates below.')}</Label><Button secondary title={t('إعادة تحميل الخريطة','Reload map')} onPress={()=>setAttempt(n=>n+1)}/></View>}
    <Label muted>{t('OpenFreeMap / OpenStreetMap • اسحب للتنقل واستعمل + و − للتكبير.','OpenFreeMap / OpenStreetMap • Drag to move and use + and − to zoom.')}</Label>
  </View>;
}
