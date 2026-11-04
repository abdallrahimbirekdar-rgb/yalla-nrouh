import React,{createContext,useContext,useEffect,useReducer,useRef,useState} from 'react';
import {AppState as DeviceState} from 'react-native';
import * as Location from 'expo-location';
import {type Action,type AppState,initialState,reduce,type TripDraft} from './domain';
import {load,save} from './storage';
import {createLatestWriter,emptyDraft,readSaved} from './persistence';
import {GPS_DISTANCE_M,GPS_INTERVAL_MS} from './meter';
import {useConnection,type Connection} from './connectivity';
import {notifyLocal} from './alerts';
type InternalAction=Action|{type:'hydrate';state:AppState};
type AppContext={state:AppState;dispatch:React.Dispatch<Action>;draft:TripDraft;setDraft:React.Dispatch<React.SetStateAction<TripDraft>>;ready:boolean;loadError:boolean;saveError:boolean;alertError:boolean;retry:()=>void;retrySave:()=>void;connection:Connection;trackingId:string|null;trackingError:boolean;startTracking:(id:string)=>Promise<void>;stopTracking:()=>void;foreground:boolean};
const Context=createContext<AppContext|null>(null);
export function AppProvider({children}:{children:React.ReactNode}){
 const [state,dispatch]=useReducer((s:AppState,a:InternalAction)=>a.type==='hydrate'?a.state:reduce(s,a),initialState);
 const [ready,setReady]=useState(false),[loadError,setLoadError]=useState(false),[saveError,setSaveError]=useState(false),[alertError,setAlertError]=useState(false),[attempt,setAttempt]=useState(0);
 const [draft,setDraft]=useState<TripDraft>({...emptyDraft});
 const [trackingId,setTrackingId]=useState<string|null>(null),[trackingError,setTrackingError]=useState(false),[foreground,setForeground]=useState(DeviceState.currentState==='active'||DeviceState.currentState===null);
 const connection=useConnection();const latest=useRef({state,draft});latest.current={state,draft};
 const mounted=useRef(true),writer=useRef<ReturnType<typeof createLatestWriter>|null>(null);
 if(!writer.current)writer.current=createLatestWriter(save,ok=>{if(mounted.current)setSaveError(!ok)});
 const startGeneration=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;}},[]);
 useEffect(()=>{let alive=true;setLoadError(false);load().then(raw=>{if(!alive)return;const saved=readSaved(raw);dispatch({type:'hydrate',state:saved.state});setDraft(saved.draft);setReady(true);}).catch(()=>{if(alive)setLoadError(true)});return()=>{alive=false}},[attempt]);
 useEffect(()=>{if(ready)void writer.current?.enqueue(JSON.stringify({storageVersion:2,state,draft}));},[state,draft,ready]);
 useEffect(()=>{const listener=DeviceState.addEventListener('change',value=>{setForeground(value==='active');if(value!=='active'&&ready){void writer.current?.enqueue(JSON.stringify({storageVersion:2,...latest.current}));}});return()=>listener.remove();},[ready]);
 const ride=state.trips.find(t=>t.id===trackingId);const trackingAllowed=ride?.status==='riding'&&state.driver.approved;
 useEffect(()=>{
  if(!trackingId||!trackingAllowed)return;
  if(!foreground){dispatch({type:'pauseTracking',id:trackingId});return;}
  let alive=true,subscription:Location.LocationSubscription|undefined;
  Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:GPS_INTERVAL_MS,distanceInterval:GPS_DISTANCE_M,mayShowUserSettingsDialog:false},position=>{if(alive)dispatch({type:'fix',id:trackingId,fix:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy??Infinity,time:position.timestamp},now:Date.now()});},()=>{if(alive){setTrackingError(true);setTrackingId(null);dispatch({type:'pauseTracking',id:trackingId});}}).then(result=>{if(alive)subscription=result;else result.remove();}).catch(()=>{if(alive){setTrackingError(true);setTrackingId(null);dispatch({type:'pauseTracking',id:trackingId});}});
  return()=>{alive=false;subscription?.remove();};
 },[trackingId,trackingAllowed,foreground]);
 useEffect(()=>{if(trackingId&&!trackingAllowed)setTrackingId(null);},[trackingId,trackingAllowed]);
 async function startTracking(id:string){const generation=++startGeneration.current;setTrackingError(false);try{if(!latest.current.state.driver.approved||!latest.current.state.trips.some(t=>t.id===id&&t.status==='riding'))return;const permission=await Location.requestForegroundPermissionsAsync();if(generation!==startGeneration.current||!mounted.current)return;if(!permission.granted||!await Location.hasServicesEnabledAsync())throw Error();if(generation===startGeneration.current&&mounted.current)setTrackingId(id);}catch{if(generation===startGeneration.current&&mounted.current)setTrackingError(true);}}
 function stopTracking(){startGeneration.current++;if(trackingId)dispatch({type:'pauseTracking',id:trackingId});setTrackingId(null);}
 const previousStatuses=useRef<Record<string,string>|null>(null);
 useEffect(()=>{if(!ready)return;const next=Object.fromEntries(state.trips.map(t=>[t.id,t.status]));const previous=previousStatuses.current;previousStatuses.current=next;if(!previous||!state.preferences.notifications)return;
  const messages={accepted:['السائق في طريقه إليك','Driver is on the way'],arrived:['وصلت السيارة','Car has arrived'],completed:['اكتملت الرحلة','Ride completed'],cancelled:['أُلغيت الرحلة','Ride cancelled']} as const;
  for(const trip of state.trips){if(previous[trip.id]&&previous[trip.id]!==trip.status&&trip.status in messages){const message=messages[trip.status as keyof typeof messages][state.language==='ar'?0:1];void notifyLocal(state.language==='ar'?'يلا نروح — تجربة محلية':'Yalla Nrouh — local demo',message).then(()=>setAlertError(false)).catch(()=>setAlertError(true));}}
 },[state.trips,state.preferences.notifications,state.language,ready]);
 return <Context.Provider value={{state,dispatch,draft,setDraft,ready,loadError,saveError,alertError,retry:()=>setAttempt(a=>a+1),retrySave:()=>{void writer.current?.retry()},connection,trackingId,trackingError,startTracking,stopTracking,foreground}}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw Error('AppProvider missing');return value;}
