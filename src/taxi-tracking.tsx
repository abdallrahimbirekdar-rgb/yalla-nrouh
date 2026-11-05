import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Platform,View} from 'react-native';
import {authClient} from './auth-client';
import {useApp} from './context';
import {isCoordinate,type Coordinate} from './geo';
import MapCanvas from './map/MapCanvas';
import {navigationPosition} from './navigation-position';
import {positionDeadline} from './position-deadline';
import {Label,Panel,useText,useTheme} from './ui';

const foregroundTab=()=>Platform.OS==='web'&&document.visibilityState!=='hidden';
const freshForMs=30000;

export function useShareTaxiPosition(rideId:string|undefined,foreground:boolean){
 useEffect(()=>{
  if(!rideId||!foreground||Platform.OS!=='web')return;
  let active=true,lastSent=0,running=false;
  let timer:ReturnType<typeof setTimeout>;
  let request:AbortController|undefined;
  async function update(){
   if(!active||running)return;
   running=true;
   const controller=new AbortController();
   request=controller;
   try{
    if(!foregroundTab())return;
    const fix=await positionDeadline(signal=>navigationPosition(false,signal),controller,18000);
    if(!active||!foregroundTab()||controller.signal.aborted||fix.time<=lastSent)return;
    const {data,error}=await authClient().rpc('share_taxi_position',{
     p_ride_id:rideId,p_latitude:fix.latitude,p_longitude:fix.longitude,p_measured_at:new Date(fix.time).toISOString(),
    }).abortSignal(controller.signal);
    if(!error&&data===true)lastSent=fix.time;
   }catch{
    // GPS and connectivity can recover while the driver remains on this ride.
   }finally{
    running=false;
    if(active)timer=setTimeout(()=>void update(),8000);
   }
  }
  void update();
  return()=>{active=false;clearTimeout(timer);request?.abort()};
 },[rideId,foreground]);
}

export function RideSearchTimer({startedAt}:{startedAt:string}){
 const t=useText();const {colors}=useTheme();
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(timer);
 },[]);
 const start=Date.parse(startedAt);
 const seconds=Number.isFinite(start)?Math.max(0,Math.floor((now-start)/1000)):0;
 return <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
  <ActivityIndicator color={colors.purple}/>
  <Label large>{t('جارٍ البحث عن تاكسي…','Looking for a taxi…')} {seconds} {t('ثانية','s')}</Label>
 </View>;
}

export function PassengerTaxiMap({rideId,pickup}:{rideId:string;pickup:Coordinate}){
 const {foreground}=useApp();const t=useText();
 const [fix,setFix]=useState<{point:Coordinate;time:number}|null>(null);
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!foreground||Platform.OS!=='web')return;
  const client=authClient(),controller=new AbortController();
  let subscribed=false,reading=false;
  function receive(row:unknown){
   if(controller.signal.aborted||!row||typeof row!=='object')return;
   const {ride_id,latitude,longitude,measured_at}=row as Record<string,unknown>;
   const point={latitude,longitude};
   const time=typeof measured_at==='string'?Date.parse(measured_at):NaN;
   if(ride_id!==rideId||!isCoordinate(point)||!Number.isFinite(time))return;
   setFix(previous=>previous&&previous.time>=time?previous:{point,time});
  }
  async function snapshot(){
   if(reading||!foregroundTab()||controller.signal.aborted)return;
   reading=true;
   try{
    const {data}=await client.from('ride_taxi_positions').select('ride_id,latitude,longitude,measured_at')
     .eq('ride_id',rideId).abortSignal(controller.signal).maybeSingle();
    receive(data);
   }catch{
    // The live channel or the next fallback read will supply the latest fix.
   }finally{reading=false}
  }
  const filter={schema:'public',table:'ride_taxi_positions',filter:'ride_id=eq.'+rideId};
  const channel=client.channel('taxi-position:'+rideId)
   .on('postgres_changes',{...filter,event:'INSERT'},event=>receive(event.new))
   .on('postgres_changes',{...filter,event:'UPDATE'},event=>receive(event.new))
   .subscribe(status=>{
    subscribed=status==='SUBSCRIBED';
    if(subscribed)void snapshot();
   });
  const fallback=setInterval(()=>{if(!subscribed)void snapshot()},12000);
  const resume=()=>void snapshot();
  document.addEventListener('visibilitychange',resume);
  void snapshot();
  return()=>{
   controller.abort();clearInterval(fallback);
   document.removeEventListener('visibilitychange',resume);
   void client.removeChannel(channel);
  };
 },[foreground,rideId]);
 useEffect(()=>{
  if(!fix)return;
  setNow(Date.now());
  if(!foreground)return;
  const interval=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(interval);
 },[fix,foreground]);
 const age=fix?Math.max(0,Math.floor((now-fix.time)/1000)):0;
 const stale=age>=freshForMs/1000;
 const number=new Intl.NumberFormat(t('ar','en')).format(age);
 return <Panel>
  <Label large>{t('تابع وصول التاكسي','Track your taxi')}</Label>
  <View style={{height:300,borderRadius:14,overflow:'hidden'}}>
   <MapCanvas compact readOnly minMapHeight={300} point={pickup} taxiPoint={fix?.point} onChange={()=>{}}/>
  </View>
  <Label muted>{fix?t('آخر تحديث قبل '+number+' ثانية','Last updated '+number+' s ago'):t('بانتظار أول تحديث لموقع التاكسي…','Waiting for the taxi’s first location update…')}</Label>
  {fix&&stale&&<Label muted>{t('نعرض آخر موقع معروف للتاكسي · بانتظار تحديث الموقع','Showing the last known taxi location · waiting for an update')}</Label>}
 </Panel>;
}
