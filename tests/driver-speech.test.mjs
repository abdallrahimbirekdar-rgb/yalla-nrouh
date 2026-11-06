import assert from 'node:assert/strict';
import test from 'node:test';
import {directionPrompt,requestDriverSpeech} from '../src/driver-speech.ts';

test('driver speech gives advance notice for the next turn in the selected language',()=>{
 const turn={nextInstruction:'انعطف يمينًا',nextStepIndex:2,nextTurnMeters:163};
 assert.equal(directionPrompt(turn,'ar'),'بعد 160 متر، انعطف يمينًا');
 assert.equal(directionPrompt({...turn,nextTurnMeters:7},'ar'),'انعطف يمينًا');
 assert.equal(directionPrompt({...turn,nextInstruction:'Turn right'},'en'),'In 160 meters, Turn right');
 assert.equal(directionPrompt({...turn,nextTurnMeters:201},'ar'),null);
 assert.equal(directionPrompt({...turn,nextStepIndex:-1},'ar'),null);
 assert.equal(directionPrompt({...turn,nextInstruction:''},'ar'),null);
});

test('speech reaches Android even without bootstrap and waits for the matching playback result',async()=>{
 const web=new EventTarget();
 const messages=[];
 web.ReactNativeWebView={postMessage:message=>messages.push(JSON.parse(message))};
 globalThis.window=web;
 try{
  const result=requestDriverSpeech('تم تشغيل التوجيه الصوتي','ar');
  const request=messages[0];
  assert.equal(request.type,'driver-speak');
  assert.equal(request.language,'ar');
  web.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:'another-request',ok:true}}));
  web.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:request.id,ok:false,reason:'voice-unavailable'}}));
  assert.equal(await result,'voice-unavailable');

  const retry=requestDriverSpeech('تم تشغيل التوجيه الصوتي','ar');
  web.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:messages[1].id,ok:true,reason:'started'}}));
  assert.equal(await retry,'started');
 }finally{
  delete globalThis.window;
 }
});
