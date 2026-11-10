import {driverLoginEmail,validDriverPassword} from '../../src/driver-credentials.ts';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
const origin='https://abdallrahimbirekdar-rgb.github.io';
const headers={
 'Access-Control-Allow-Origin':origin,
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Cache-Control':'no-store',
 'Content-Type':'application/json',
};
const categories=new Set(['classic','comfort','yellow','vip','ladies-classic','ladies-comfort']);
const syrian=/^\+9639[0-9]{8}$/;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});

export async function driverPhoneAccount(request:Request){
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)return reply(403,{code:'origin_denied'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{code:'method_not_allowed'});
 const authorization=request.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return reply(401,{code:'login_required'});
 const root=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),publicKey=Deno.env.get('SUPABASE_ANON_KEY');
 if(!root||!secret||!publicKey)return reply(503,{code:'phone_driver_unavailable'});
 try{
  const userHeaders={apikey:publicKey,Authorization:authorization,'Content-Type':'application/json'};
  const signal=AbortSignal.timeout(10000);
  const requestApi=(path:string,init:RequestInit)=>fetch(root+path,{...init,signal});
  const staff=await requestApi('/rest/v1/rpc/is_staff_admin',{method:'POST',headers:userHeaders,body:'{}'});
  if(staff.status===401)return reply(401,{code:'login_required'});
  if(!staff.ok||await staff.json()!==true)return reply(403,{code:'not_admin'});

  const body=await request.json().catch(()=>null);
  if(body?.action==='capabilities')return reply(200,{mode:'admin_phone_username_v2'});
  if(!body||typeof body.phone!=='string'||!syrian.test(body.phone)||!['create','reset'].includes(body.action))
   return reply(400,{code:'invalid_phone_driver'});
  const phone:string=body.phone;
  const password=body.password;
  if(!validDriverPassword(password))
   return reply(400,{code:'invalid_driver_password'});
  const name=typeof body.name==='string'?body.name.trim():'';
  if(body.action==='create'&&(!name||name.length>80||!Number.isInteger(body.region)||body.region<0||body.region>13||!categories.has(body.category)))
   return reply(400,{code:'invalid_phone_driver'});
  let path='/auth/v1/admin/users';
  if(body.action==='reset'){
   const find=await requestApi('/rest/v1/rpc/admin_phone_driver_id',{
    method:'POST',headers:userHeaders,body:JSON.stringify({p_phone:phone}),
   });
   if(!find.ok)return reply(503,{code:'phone_driver_unavailable'});
   const id=await find.json();
   if(typeof id!=='string'||!uuid.test(id))return reply(404,{code:'phone_driver_not_found'});
   path+='/'+id;
  }
  const result=await requestApi(path,{
   method:body.action==='create'?'POST':'PUT',
   headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},
   body:JSON.stringify(body.action==='create'
    ?{email:driverLoginEmail(phone),email_confirm:true,phone,password,phone_confirm:true,app_metadata:{yalla_driver_phone:{name,region:body.region,category:body.category}}}
    :{password}),
  });
  if(!result.ok){
   const error=await result.json().catch(()=>null);
   const code=error?.error_code??error?.code;
   if(result.status===409||['phone_exists','email_exists','user_already_exists'].includes(code))
    return reply(409,{code:'phone_driver_exists'});
   if(code==='weak_password')return reply(400,{code:'invalid_driver_password'});
   return reply(503,{code:'phone_driver_unavailable'});
  }
  return reply(200,{phone});
 }catch{return reply(503,{code:'phone_driver_unavailable'})}
}

if(typeof Deno!=='undefined')Deno.serve(driverPhoneAccount);
