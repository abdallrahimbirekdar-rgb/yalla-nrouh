import {useCallback,useEffect,useRef,useState} from 'react';
import type {DriverRoutePlan} from './valhalla-route';

type Language='ar'|'en';
type SpeechWindow=Window&{__YALLA_DRIVER_SPEECH__?:boolean;__YALLA_DRIVER_VOICE_SETUP__?:boolean;__YALLA_NATIVE_ACTIVE__?:boolean;ReactNativeWebView?:{postMessage:(message:string)=>void}};
type VoiceResult='started'|'voice-unavailable'|'playback'|'unsupported';
type Turn={nextInstruction:string;nextTurnMeters:number;nextStepIndex:number};
const preference='yalla:driver-voice';
let cancelPending:(()=>void)|null=null;

function host(){return typeof window==='undefined'?null:window as SpeechWindow}

export function directionPrompt(turn:Turn,language:Language){
 if(!turn.nextInstruction.trim()||turn.nextStepIndex<0||!Number.isFinite(turn.nextTurnMeters)
    ||turn.nextTurnMeters<=0||turn.nextTurnMeters>200)return null;
 const meters=Math.round(turn.nextTurnMeters/10)*10;
 return (meters<=10?turn.nextInstruction:language==='ar'
  ?'بعد '+meters+' متر، '+turn.nextInstruction
  :'In '+meters+' meters, '+turn.nextInstruction).slice(0,240);
}

function speechAvailable(){
 const web=host();
 return Boolean(web&&(web.ReactNativeWebView?web.__YALLA_DRIVER_SPEECH__:web.speechSynthesis&&typeof SpeechSynthesisUtterance==='function'));
}

function stopSpeech(){
 cancelPending?.();
 const web=host();if(!web)return;
 try{
  if(web.ReactNativeWebView&&web.__YALLA_DRIVER_SPEECH__)web.ReactNativeWebView.postMessage(JSON.stringify({type:'driver-speech-stop'}));
  else if(!web.ReactNativeWebView)web.speechSynthesis?.cancel();
 }catch{}
}

export function requestDriverSpeech(text:string,language:Language):Promise<VoiceResult>{
 const web=host();
 if(!web||!speechAvailable())return Promise.resolve('unsupported');
 const bridge=web.ReactNativeWebView;
 cancelPending?.();
 return new Promise<VoiceResult>(resolve=>{
  const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const finish=(result:VoiceResult)=>{
   if(cancelPending!==cancel)return;
   cancelPending=null;
   clearTimeout(timer);
   web.removeEventListener('yalla:native-result',reply);
   resolve(result);
  };
  const reply=(event:Event)=>{
   const value=(event as CustomEvent).detail;
   if(value?.id!==id||typeof value.ok!=='boolean')return;
   finish(value.ok?'started':value.reason==='voice-unavailable'?'voice-unavailable':'playback');
  };
  const cancel=()=>finish('playback');
  const timer=setTimeout(stopSpeech,8000);
  cancelPending=cancel;
  try{
   if(bridge){
    web.addEventListener('yalla:native-result',reply);
    bridge.postMessage(JSON.stringify({type:'driver-speak',id,text,language}));
   }else{
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=language;
    const voices=web.speechSynthesis.getVoices();
    const voice=voices.find(item=>item.localService&&item.lang.split(/[-_]/)[0]===language)
      ??voices.find(item=>item.lang.split(/[-_]/)[0]===language);
    if(voices.length&&!voice){finish('voice-unavailable');return}
    if(voice)utterance.voice=voice;
    utterance.onstart=()=>finish('started');
    utterance.onerror=event=>finish(['language-unavailable','voice-unavailable'].includes(event.error)?'voice-unavailable':'playback');
    web.speechSynthesis.cancel();
    web.speechSynthesis.speak(utterance);
   }
  }catch{finish('playback')}
 });
}

export function useDriverSpeech(plan:DriverRoutePlan|null,turn:Turn|null,canGuide:boolean,language:Language){
 const [available,setAvailable]=useState(false);
 const [enabled,setEnabled]=useState(()=>{
  try{return host()?.localStorage.getItem(preference)==='on'}catch{return false}
 });
 const [problem,setProblem]=useState<Exclude<VoiceResult,'started'>|null>(null);
 const [testing,setTesting]=useState(false);
 const [visible,setVisible]=useState(true);
 const operation=useRef(0),switching=useRef(false);
 const stop=useCallback(()=>{operation.current++;switching.current=false;stopSpeech()},[]);
 const spoken=useRef<{route:DriverRoutePlan|null;index:number}>({route:null,index:-1});
 useEffect(()=>{
  const web=host();if(!web)return;
  let nativeActive=web.__YALLA_NATIVE_ACTIVE__!==false;
  const detect=()=>setAvailable(speechAvailable());
  const visibility=()=>setVisible(nativeActive&&document.visibilityState!=='hidden');
  const native=(event:Event)=>{nativeActive=(event as CustomEvent).detail?.active!==false;visibility()};
  detect();visibility();
  web.addEventListener('yalla:native-bootstrap',detect);
  web.addEventListener('yalla:native-visibility',native);
  document.addEventListener('visibilitychange',visibility);
  return ()=>{
   stop();
   web.removeEventListener('yalla:native-bootstrap',detect);
   web.removeEventListener('yalla:native-visibility',native);
   document.removeEventListener('visibilitychange',visibility);
  };
 },[stop]);
 const save=(next:boolean)=>{
  setEnabled(next);
  try{host()?.localStorage.setItem(preference,next?'on':'off')}catch{}
 };
 useEffect(()=>{
  if(!visible){stop();setTesting(false)}
  else if(enabled&&!canGuide)stop();
 },[canGuide,enabled,stop,visible]);
 useEffect(()=>{
  if(!enabled||!canGuide||!visible||!available||!plan||!turn)return;
  const phrase=directionPrompt(turn,language);
  if(!phrase)return;
  const previous=spoken.current;
  if(previous.route===plan&&turn.nextStepIndex<=previous.index)return;
  spoken.current={route:plan,index:turn.nextStepIndex};
  const request=++operation.current;
  void requestDriverSpeech(phrase,language).then(result=>{
   if(request===operation.current)setProblem(result==='started'?null:result);
  });
 },[available,canGuide,enabled,language,plan,turn,visible]);
 const toggle=async()=>{
  if(enabled){stop();setProblem(null);save(false);return}
  if(switching.current)return;
  if(!speechAvailable()){setProblem('unsupported');return}
  switching.current=true;
  setTesting(true);
  setProblem(null);
  const request=++operation.current;
  const result=await requestDriverSpeech(language==='ar'?'تم تشغيل التوجيه الصوتي':'Voice guidance is on',language);
  if(request!==operation.current)return;
  switching.current=false;
  setTesting(false);
  setProblem(result==='started'?null:result);
  if(result==='started')save(true);
 };
 const web=host();
 const openVoiceSetup=web?.__YALLA_DRIVER_VOICE_SETUP__&&web.ReactNativeWebView
  ?()=>web.ReactNativeWebView?.postMessage(JSON.stringify({type:'driver-voice-setup'}))
  :null;
 return {enabled,testing,problem,toggle,openVoiceSetup};
}
