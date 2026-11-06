declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
declare const EdgeRuntime:{waitUntil:(work:Promise<unknown>)=>void};

type Point={latitude:number;longitude:number};
type Candidate=Point&{id:string};
type Work={pickup:Point;candidates:Candidate[]};
type Push={ride_id:string;token:string;remaining_seconds:number};
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
async function pushWave(generation:string,account:FcmAccount){
 const access=await fcmAccess(account);
 const offers=await rpc<Push[]>('claim_ride_push',{p_generation:generation});
 await Promise.allSettled(offers.map(async({ride_id,token,remaining_seconds})=>{
  const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(account.project_id)+'/messages:send',{
   method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
   body:JSON.stringify({message:{token,
    notification:{title:'يلا نروح',body:'طلب رحلة جديد. افتح التطبيق للتحقق من توفره.'},
    data:{rideId:ride_id,type:'driver-offer'},
    android:{priority:'high',ttl:remaining_seconds+'s',notification:{channel_id:'ride-offers',tag:'ride-'+ride_id}},
   }}),signal:AbortSignal.timeout(5000),
  });
  if(!response.ok)console.warn('driver_push_rejected',response.status);
 }));
}

async function runDispatch(generation:string,work:Work,started:number){
 let ordered:string[]=[];
 try{if(work.candidates.length)ordered=await routeOrder(work)}catch{console.warn('dispatch_matrix_unavailable')}
 await rpc('finish_ride_dispatch',{
  p_generation:generation,p_state:ordered.length?'ranked':work.candidates.length?'fallback':'no_candidates',p_candidates:ordered,
 });
 const config=Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
 if(!config)return;
 const account=JSON.parse(config) as FcmAccount;
 if(!account.project_id||!account.client_email||!account.private_key)return;
 // The database revalidates each wave. Previously claimed devices are skipped.
 for(const delay of [9000,17000,26000,51000]){
  await wait(Math.max(0,started+delay-Date.now()));
  try{await pushWave(generation,account)}catch{console.warn('driver_push_unavailable')}
 }
}
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 const started=Date.now();
 try{
  const raw=await request.text();
  if(raw.length>128)return new Response(null,{status:400});
  const generation=JSON.parse(raw)?.generation;
  if(typeof generation!=='string'||!uuid.test(generation))return new Response(null,{status:400});
  const work=await rpc<Work|null>('claim_ride_dispatch',{p_generation:generation});
  if(!work)return new Response(null,{status:204});
  EdgeRuntime.waitUntil(runDispatch(generation,work,started).catch(()=>console.warn('dispatch_job_failed')));
  return new Response(null,{status:202});
 }catch{return new Response(null,{status:503})}
});
