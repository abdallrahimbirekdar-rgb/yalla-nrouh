declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
// Secret GOOGLE_ROUTES_API_KEY lives only in the function environment.
const ORIGIN='https://abdallrahimbirekdar-rgb.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
const coordinate=(p:unknown):p is {latitude:number;longitude:number}=>{const v=p as {latitude:number;longitude:number};return !!v&&Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180};
Deno.serve(async(req:Request)=>{
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'origin'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'X-Yalla-Routes-Configured':Deno.env.get('GOOGLE_ROUTES_API_KEY')?'true':'false'}});
 if(req.method!=='POST')return json({error:'method'},405);
 const root=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return json({error:'login_required'},401);
 try{
  const me=await fetch(root+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(8000)});
  if(!me.ok)return json({error:'login_required'},401);
  const user=await me.json();if(typeof user.id!=='string')return json({error:'login_required'},401);
  const raw=await req.text();if(raw.length>2000)return json({error:'invalid_input'},400);
  let input;try{input=JSON.parse(raw)}catch{return json({error:'invalid_input'},400)}
  if(!coordinate(input.origin)||!coordinate(input.destination))return json({error:'invalid_input'},400);
  const key=Deno.env.get('GOOGLE_ROUTES_API_KEY');
  if(!key)return json({error:'routes_not_configured'},503);
  const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  const quota=await fetch(root+'/rest/v1/rpc/consume_google_route_quota',{method:'POST',headers,body:JSON.stringify({p_user:user.id}),signal:AbortSignal.timeout(8000)});
  if(!quota.ok)return json({error:'service_unavailable'},503);
  if(await quota.json()!==true)return json({error:'quota'},429);
  const rates=await fetch(root+'/rest/v1/fare_settings?id=eq.true&select=base,per_km,per_minute,peak_multiplier,updated_at',{headers,signal:AbortSignal.timeout(8000)});
  if(!rates.ok)return json({error:'tariff_unavailable'},503);
  const [tariff]=await rates.json();if(!tariff)return json({error:'tariff_unavailable'},503);
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction'},body:JSON.stringify({origin:{location:{latLng:input.origin}},destination:{location:{latLng:input.destination}},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,polylineEncoding:'GEO_JSON_LINESTRING',polylineQuality:'HIGH_QUALITY',languageCode:input.languageCode==='en'?'en':'ar',units:'METRIC'}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)return json({error:response.status===403?'google_not_enabled':'route_unavailable'},502);
  const data=await response.json();if(!data.routes?.length)return json({error:'no_route'},422);
  return json({...data,tariff:{base:Number(tariff.base),perKm:Number(tariff.per_km),perMinute:Number(tariff.per_minute),peakMultiplier:Number(tariff.peak_multiplier),updatedAt:tariff.updated_at}});
 }catch{return json({error:'service_unavailable'},503)}
});
