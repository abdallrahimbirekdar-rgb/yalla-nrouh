import {isCoordinate,type Coordinate} from '../geo.ts';

// The bridge accepts only coordinates, never commands or HTML from the WebView.
export function readMapPoint(message:string):Coordinate|null {
  try {const value=JSON.parse(message);return value.type==='point'&&isCoordinate(value.point)?value.point:null;}catch{return null;}
}
export function mapHtml(point:Coordinate|null,arabic:boolean):string {
  const start=isCoordinate(point)?point:{latitude:33.5138,longitude:36.2765};
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}body{background:#eef0ec}#error{position:absolute;inset:40% 12px auto;z-index:1000;background:white;padding:16px;text-align:center;font-family:Arial;display:none}.pin{width:20px;height:20px;background:#eb765f;border:3px solid white;border-radius:50%;box-shadow:0 1px 6px #3338}</style></head><body><div id="map" aria-label="${arabic?'خريطة اختيار الموقع':'Choose a location on the map'}"></div><div id="error">${arabic?'تعذر تحميل الخريطة. تحقق من الإنترنت ثم أعد المحاولة.':'Could not load the map. Check your internet and try again.'}</div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="document.getElementById('error').style.display='block'"></script><script>
if(typeof L!=='undefined'){
 var map=L.map('map').setView([${start.latitude},${start.longitude}],14),marker=null;
 var icon=L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[26,26],iconAnchor:[13,13]});
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
 function setPoint(p,notify){if(!marker){marker=L.marker([p.latitude,p.longitude],{draggable:true,icon:icon}).addTo(map);marker.on('dragend',function(){var p=marker.getLatLng();setPoint({latitude:p.lat,longitude:p.lng},true);});}else marker.setLatLng([p.latitude,p.longitude]);if(notify&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'point',point:p}));}
 window.updatePoint=function(p){setPoint(p,false);if(!map.getBounds().contains([p.latitude,p.longitude]))map.panTo([p.latitude,p.longitude]);};
 map.on('click',function(e){setPoint({latitude:e.latlng.lat,longitude:e.latlng.lng},true);});
 ${point?'setPoint('+JSON.stringify(start)+',false);':''}
}
</script></body></html>`;
}
