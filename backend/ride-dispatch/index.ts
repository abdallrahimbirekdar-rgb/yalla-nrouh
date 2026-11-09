declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
declare const EdgeRuntime:{waitUntil:(work:Promise<unknown>)=>void};

type Point={latitude:number;longitude:number};
type Candidate=Point&{id:string};
type Work={pickup:Point;candidates:Candidate[]};
type Push={ride_id:string;token:string;remaining_seconds:number};
type PassengerPush={ride_id:string;stage:'accepted'|'arrived';token:string};
type FcmAccount={project_id:string;client_email:string;private_key:string};

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function rpc<T>(name:string,body:unknown):Promise<T>{
 const root=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!root||!secret)throw Error('missing_runtime_config');
 const response=await fetch(root+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(4000),
 });
 if(!response.ok)throw Error('dispatch_rpc_failed');
 return await response.json() as T;
}
async function routeOrder({pickup,candidates}:Work):Promise<string[]>{
 const key=Deno.env.get('GOOGLE_ROUTES_API_KEY');
 if(!key)return [];
 const waypoint=(point:Point)=>({waypoint:{location:{latLng:{latitude:point.latitude,longitude:point.longitude}}}});
 const response=await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{
  method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'originIndex,destinationIndex,status,condition,duration'},
  body:JSON.stringify({origins:candidates.slice(0,8).map(waypoint),destinations:[waypoint(pickup)],travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'}),
  signal:AbortSignal.timeout(4500),
 });
 if(!response.ok)return [];
 const rows=await response.json() as {originIndex?:number;destinationIndex?:number;status?:{code?:number};condition?:string;duration?:string}[];
 if(!Array.isArray(rows))return [];
 return rows.flatMap(row=>{
  const id=candidates[row.originIndex??0]?.id;
  const seconds=typeof row.duration==='string'&&/^\d+(?:\.\d+)?s$/.test(row.duration)?Number(row.duration.slice(0,-1)):NaN;
  return id&&(row.destinationIndex??0)===0&&!row.status?.code&&row.condition==='ROUTE_EXISTS'&&Number.isFinite(seconds)?[{id,seconds}]:[];
 }).sort((a,b)=>a.seconds-b.seconds).map(row=>row.id).filter((id,i,all)=>all.indexOf(id)===i);
}
const b64url=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const encoder=new TextEncoder();
let cached:{token:string;expires:number}|undefined;
async function fcmAccess(account:FcmAccount){
 if(cached&&cached.expires>Date.now()+60000)return cached.token;
 const issued=Math.floor(Date.now()/1000);
 const encode=(value:unknown)=>b64url(encoder.encode(JSON.stringify(value)));
 const jwt=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600});
 const keyData=Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',keyData,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(jwt))));
 const response=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt+'.'+signature}),
  signal:AbortSignal.timeout(5000),
 });
 if(!response.ok)throw Error('push_auth_failed');
 const result=await response.json();
 if(typeof result.access_token!=='string'||typeof result.expires_in!=='number')throw Error('push_auth_failed');
 cached={token:result.access_token,expires:Date.now()+result.expires_in*1000};
 return cached.token;
}
function fcmConfig():FcmAccount|null{
 const config=Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
 if(!config)return null;
 try{
  const account=JSON.parse(config) as FcmAccount;
  return account.project_id&&account.client_email&&account.private_key?account:null;
 }catch{return null}
}
async function sendPush(account:FcmAccount,access:string,token:string,rideId:string,type:string,body:string,ttl:number,channel:string){
 const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(account.project_id)+'/messages:send',{
  method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
  body:JSON.stringify({message:{token,notification:{title:'يلّا نروح',body},
   data:{rideId,type},android:{priority:'high',ttl:ttl+'s',notification:{channel_id:channel,tag:'ride-'+rideId}},
  }}),signal:AbortSignal.timeout(5000),
 });
 if(!response.ok)console.warn('ride_push_rejected',response.status);
}
async function pushWave(generation:string,account:FcmAccount){
 const access=await fcmAccess(account);
 const offers=await rpc<Push[]>('claim_ride_push',{p_generation:generation});
 await Promise.allSettled(offers.filter(offer=>offer.remaining_seconds>0).map(({ride_id,token,remaining_seconds})=>
  sendPush(account,access,token,ride_id,'driver-offer','طلب رحلة جديد. افتح التطبيق للتحقق من توفره.',remaining_seconds,'ride-offers')));
}
async function pushPassenger(event:string,account:FcmAccount){
 const events=await rpc<PassengerPush[]>('claim_passenger_ride_push',{p_event:event});
 if(!events.length)return;
 const access=await fcmAccess(account);
 await Promise.allSettled(events.map(({ride_id,stage,token})=>
  sendPush(account,access,token,ride_id,stage==='arrived'?'passenger-arrived':'passenger-accepted',
   stage==='arrived'?'وصل السائق إلى نقطة الالتقاء.':'قبل السائق طلبك وهو في الطريق.',90,'rides')));
}

async function runDispatch(generation:string,work:Work,started:number){
 let ordered:string[]=[];
 try{if(work.candidates.length)ordered=await routeOrder(work)}catch{console.warn('dispatch_matrix_unavailable')}
 await rpc('finish_ride_dispatch',{
  p_generation:generation,p_state:ordered.length?'ranked':work.candidates.length?'fallback':'no_candidates',p_candidates:ordered,
 });
 const account=fcmConfig();
 if(!account)return;
 // The database revalidates each wave. Previously claimed devices are skipped.
 for(const delay of [9000,17000,26000,51000]){
  await wait(Math.max(0,started+delay-Date.now()));
  try{await pushWave(generation,account)}catch{console.warn('driver_push_unavailable')}
 }
}
Deno.serve(async request=>{
 if(request.method==='GET'&&new URL(request.url).searchParams.get('capability')==='ride-push'){
  const ready=Boolean(fcmConfig());
  return Response.json({ready},{headers:{'Access-Control-Allow-Origin':'https://abdallrahimbirekdar-rgb.github.io','Cache-Control':'no-store'}});
 }
 if(request.method!=='POST')return new Response(null,{status:405});
 const started=Date.now();
 try{
  const raw=await request.text();
  if(raw.length>128)return new Response(null,{status:400});
  const {event,generation}=JSON.parse(raw)??{};
  if(typeof event==='string'&&uuid.test(event)){
   const account=fcmConfig();
   if(!account)return new Response(null,{status:204});
   await pushPassenger(event,account);
   return new Response(null,{status:204});
  }
  if(typeof generation!=='string'||!uuid.test(generation))return new Response(null,{status:400});
  const work=await rpc<Work|null>('claim_ride_dispatch',{p_generation:generation});
  if(!work)return new Response(null,{status:204});
  EdgeRuntime.waitUntil(runDispatch(generation,work,started).catch(()=>console.warn('dispatch_job_failed')));
  return new Response(null,{status:202});
 }catch{return new Response(null,{status:503})}
});
