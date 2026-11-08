import {setRideOwner} from './cloud-ride-state';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {authClient} from './auth-client';
import {syrianMobile} from './syrian-phone';
import {Platform} from 'react-native';
import {type Session} from '@supabase/supabase-js';
import {cloudIsAdmin,cloudMyDriver,cloudSetSessionBridge,CloudError} from './cloud-api';
const SITE='https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/';
type AuthValue={session:Session|null;ready:boolean;admin:boolean;checkingAdmin:boolean;driver:boolean;rolesReady:boolean;recovery:boolean;problem:string;signIn:(identifier:string,password:string)=>Promise<void>;signUp:(email:string,password:string)=>Promise<boolean>;signOut:(expectedUserId?:string)=>Promise<void>;reset:(email:string)=>Promise<void>;updatePassword:(password:string,currentPassword?:string)=>Promise<void>;retry:()=>Promise<void>};
const noAuth=async()=>{throw Error('login_required')};
const AuthContext=createContext<AuthValue>({session:null,ready:false,admin:false,checkingAdmin:false,driver:false,rolesReady:false,recovery:false,problem:'',signIn:noAuth,signUp:async()=>{throw Error('login_required')},signOut:noAuth,reset:noAuth,updatePassword:noAuth,retry:noAuth});
export function AuthProvider({children}:{children:React.ReactNode}){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[admin,setAdmin]=useState(false),[checkingAdmin,setCheckingAdmin]=useState(false),[recovery,setRecovery]=useState(false),[problem,setProblem]=useState(''),[roleAttempt,setRoleAttempt]=useState(0);
 const [driver,setDriver]=useState(false),[rolesReady,setRolesReady]=useState(false);
 const userId=session?.user.id;const accessToken=session?.access_token;
 const current=useRef<Session|null>(null),alive=useRef(true);
 const accept=useCallback((next:Session|null)=>{setRideOwner(next?.user.id??null);current.current=next;setSession(next);setReady(true);setProblem('')},[]);
 const retry=useCallback(async()=>{
  try{const {data,error}=await authClient().auth.getSession();if(error)throw error;if(alive.current){accept(data.session);setRoleAttempt(value=>value+1)}}
  catch{if(alive.current){setReady(true);setProblem('session_unavailable')}}
 },[accept]);
 useEffect(()=>{
  alive.current=true;if(Platform.OS!=='web'){setReady(true);return()=>{alive.current=false}}
  const supabase=authClient();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{if(!alive.current)return;accept(next);if(event==='PASSWORD_RECOVERY')setRecovery(true)});
  cloudSetSessionBridge(()=>current.current?.access_token??null,async()=>{
   const expected=current.current?.user.id;
   const {data,error}=await supabase.auth.getSession();
   if(error||!data.session||!expected||data.session.user.id!==expected||current.current?.user.id!==expected)throw new CloudError(401,'login_required');
   return data.session.access_token;
  });
  const deadline=setTimeout(()=>{if(alive.current){setReady(true);if(!current.current)setProblem('session_unavailable')}},15000);
  void retry().finally(()=>clearTimeout(deadline));
  const changed=(event:StorageEvent)=>{if(event.key==='yalla-nrouh-auth-v1')void retry()};window.addEventListener('storage',changed);
  return()=>{alive.current=false;clearTimeout(deadline);subscription.unsubscribe();window.removeEventListener('storage',changed);cloudSetSessionBridge(null,null)};
 },[accept,retry]);
 useEffect(()=>{
  setAdmin(false);setDriver(false);setRolesReady(false);if(!accessToken){setCheckingAdmin(false);setRolesReady(true);return}let active=true;setCheckingAdmin(true);
  void Promise.all([cloudIsAdmin(accessToken),cloudMyDriver(accessToken)]).then(([staff,account])=>{if(active){setAdmin(staff);setDriver(!staff&&account?.approved===true);setRolesReady(true)}}).catch(()=>{if(active)setProblem('admin_unavailable')}).finally(()=>{if(active)setCheckingAdmin(false)});
  return()=>{active=false};
 },[accessToken,userId,roleAttempt]);
 const value=useMemo<AuthValue>(()=>({session,ready,admin,checkingAdmin,driver,rolesReady,recovery,problem,retry,
  signIn:async(identifier,password)=>{
   const email=identifier.trim();
   const phone=email.includes('@')?null:syrianMobile(identifier);
   if(!phone&&!email.includes('@'))throw new CloudError(400,'invalid_syrian_phone');
   const {data,error}=await authClient().auth.signInWithPassword(phone?{phone,password}:{email,password});
   if(error)throw error;accept(data.session);
  },
  signUp:async(email,password)=>{const {data,error}=await authClient().auth.signUp({email:email.trim(),password,options:{emailRedirectTo:SITE}});if(error)throw error;if(data.session)accept(data.session);return Boolean(data.session)},
  signOut:async(expectedUserId)=>{if(expectedUserId&&current.current?.user.id!==expectedUserId)return;const {error}=await authClient().auth.signOut({scope:'local'});if(error)throw error;setAdmin(false);setRecovery(false);accept(null)},
  reset:async(email)=>{const {error}=await authClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:SITE});if(error)throw error},
  updatePassword:async(password,currentPassword)=>{const {error}=await authClient().auth.updateUser({password,...(currentPassword?{current_password:currentPassword}:{})});if(error)throw error;setRecovery(false)},
 }),[session,ready,admin,checkingAdmin,driver,rolesReady,recovery,problem,retry,accept]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
