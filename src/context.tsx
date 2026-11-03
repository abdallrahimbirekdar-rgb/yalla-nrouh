import React,{createContext,useContext,useEffect,useReducer,useRef,useState} from 'react';
import {Action,AppState,initialState,reduce,restoreState,TripDraft} from './domain';
import {load,save} from './storage';
type InternalAction=Action|{type:'hydrate';state:AppState};
const Context=createContext<null|{state:AppState;dispatch:React.Dispatch<Action>;draft:TripDraft;setDraft:React.Dispatch<React.SetStateAction<TripDraft>>;ready:boolean;loadError:boolean;saveError:boolean;retry:()=>void}>(null);
export function AppProvider({children}:{children:React.ReactNode}){
  const [state,dispatchInternal]=useReducer((state:AppState,action:InternalAction)=>action.type==='hydrate'?action.state:reduce(state,action),initialState);
  const [ready,setReady]=useState(false),[loadError,setLoadError]=useState(false),[saveError,setSaveError]=useState(false),[attempt,setAttempt]=useState(0);
  const [draft,setDraft]=useState<TripDraft>({pickup:'',destination:'',region:0,intercity:false,category:'classic'});
  const writes=useRef(Promise.resolve());
  useEffect(()=>{let alive=true;setLoadError(false);load().then(raw=>{if(!alive)return;const restored=raw===null?initialState:restoreState(JSON.parse(raw));if(!restored)throw Error('Invalid saved state');dispatchInternal({type:'hydrate',state:restored});setReady(true)}).catch(()=>{if(alive)setLoadError(true)});return()=>{alive=false}},[attempt]);
  useEffect(()=>{if(!ready)return;writes.current=writes.current.catch(()=>{}).then(()=>save(JSON.stringify(state))).then(()=>setSaveError(false)).catch(()=>setSaveError(true))},[state,ready]);
  return <Context.Provider value={{state,dispatch:dispatchInternal,draft,setDraft,ready,loadError,saveError,retry:()=>setAttempt(a=>a+1)}}>{children}</Context.Provider>;
}
export function useApp(){const c=useContext(Context);if(!c)throw Error('AppProvider missing');return c}
