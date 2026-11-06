import React,{useEffect,useState} from 'react';
import {Platform} from 'react-native';
import {cloudCurrentToken,cloudRegisterDriverPush} from './cloud-api';
import {Button,Label,Panel,useText} from './ui';
import type {SiteWindow} from './site-bridge.web';

import {driverPushKey,removeDriverPush,savedDriverPushToken} from './driver-push-registration';

function askNativeToken():Promise<string>{
 const bridge=(window as SiteWindow).ReactNativeWebView;
 if(!bridge)return Promise.reject(Error('push_unavailable'));
 const id=crypto.randomUUID?.()??Date.now().toString(36);
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('yalla:driver-push-token',receive)};
  const receive=(event:Event)=>{
   const response=(event as CustomEvent).detail;
   if(response?.id!==id)return;
   cleanup();
   if(typeof response.token==='string'&&response.token.length>=40)resolve(response.token);
   else reject(Error('push_unavailable'));
  };
  const timer=setTimeout(()=>{cleanup();reject(Error('push_timeout'))},30000);
  window.addEventListener('yalla:driver-push-token',receive);
  try{bridge.postMessage(JSON.stringify({type:'driver-push-enable',id}))}
  catch(error){cleanup();reject(error)}
 });
}
export default function DriverPush({owner}:{owner:string}){
 const t=useText();
 const [supported,setSupported]=useState(false),[enabled,setEnabled]=useState(()=>!!savedDriverPushToken(owner)),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const host=window as SiteWindow;
  const read=()=>setSupported(host.__YALLA_DRIVER_PUSH__===true&&!!host.ReactNativeWebView);
  read();window.addEventListener('yalla:driver-push-capability',read);
  return()=>window.removeEventListener('yalla:driver-push-capability',read);
 },[]);
 if(!supported)return null;
 async function toggle(){
  if(busy)return;
  setBusy(true);setFailed(false);
  try{
   if(enabled){await removeDriverPush(owner);setEnabled(false);return}
   const token=await askNativeToken();
   localStorage.setItem(driverPushKey(owner),token);
   try{
    if(!await cloudRegisterDriverPush(await cloudCurrentToken(),token))throw Error('push_unavailable');
   }catch(error){localStorage.removeItem(driverPushKey(owner));throw error}
   setEnabled(true);
  }catch{setFailed(true)}
  finally{setBusy(false)}
 }
 return <Panel outlined>
  <Button secondary icon="notifications-outline" title={enabled?t('إيقاف إشعارات الطلبات','Turn off request notifications'):t('تفعيل إشعارات الطلبات','Turn on request notifications')} onPress={()=>void toggle()} disabled={busy}/>
  {!!failed&&<Label muted>{t('تعذر تحديث الإشعارات. تحقق من إذن الإشعارات والاتصال.','Could not update notifications. Check permission and connection.')}</Label>}
 </Panel>;
}
