import {leafletJS,leafletCSS} from './leaflet-bundle.generated.ts';
import {isCoordinate,type Coordinate} from '../geo.ts';

// The bridge accepts only coordinates, never commands or HTML from the WebView.
export function readMapPoint(message:string):Coordinate|null {
  try {const value=JSON.parse(message);return value.type==='point'&&isCoordinate(value.point)?value.point:null;}catch{return null;}
}
export function mapHtml(point:Coordinate|null,arabic:boolean,dark=false,readOnly=false):string {
  const start=isCoordinate(point)?point:{latitude:33.5138,longitude:36.2765};
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>${leafletCSS}
html,body,#map{height:100%;margin:0}body{background:${dark?'#172027':'#eef0ec'}}.leaflet-tile-pane{${dark?'filter:brightness(.65) saturate(.7);':''}}#error{position:absolute;inset:40% 12px auto;z-index:1000;background:white;padding:16px;text-align:center;font-family:Arial;display:none}.pin{width:20px;height:20px;background:#eb765f;border:3px solid white;border-radius:50%;box-shadow:0 1px 6px #3338}</style></head><body><div id="map" aria-label="${arabic?'خريطة اختيار الموقع':'Choose a location on the map'}"></div><div id="error">${arabic?'تعذر تحميل الخريطة. تحقق من الإنترنت ثم أعد المحاولة.':'Could not load the map. Check your internet and try again.'}</div><script>${leafletJS}</script><script>
if(typeof L!=='undefined'){
 var map=L.map('map',{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([${start.latitude},${start.longitude}],14),marker=null;
 var icon=L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[26,26],iconAnchor:[13,13]});
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:0,updateWhenIdle:true,updateWhenZooming:false,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
 function setPoint(p,notify){if(!marker){marker=L.marker([p.latitude,p.longitude],{draggable:${!readOnly},icon:icon}).addTo(map);marker.on('dragend',function(){var p=marker.getLatLng().wrap();setPoint({latitude:p.lat,longitude:p.lng},true);});}else marker.setLatLng([p.latitude,p.longitude]);if(notify&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'point',point:p}));}
 window.updatePoint=function(p){setPoint(p,false);if(!map.getBounds().contains([p.latitude,p.longitude]))map.panTo([p.latitude,p.longitude]);};
 if(${!readOnly})map.on('click',function(e){var p=e.latlng.wrap();setPoint({latitude:p.lat,longitude:p.lng},true);});
 var routeLayer=null;window.updateRoute=function(points){if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}if(!Array.isArray(points)||points.length<2)return;routeLayer=L.polyline(points.map(function(p){return [p.latitude,p.longitude];}),{color:'#2688e8',weight:5}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[24,24],maxZoom:16,animate:false});};
 ${point?'setPoint('+JSON.stringify(start)+',false);':''}
}
</script></body></html>`;
}
