import assert from 'node:assert/strict';
import test from 'node:test';
import {directionPrompt} from '../src/driver-speech.ts';

test('driver speech gives advance notice for the next turn in the selected language',()=>{
 const turn={nextInstruction:'انعطف يمينًا',nextStepIndex:2,nextTurnMeters:163};
 assert.equal(directionPrompt(turn,'ar'),'بعد 160 متر، انعطف يمينًا');
 assert.equal(directionPrompt({...turn,nextTurnMeters:7},'ar'),'انعطف يمينًا');
 assert.equal(directionPrompt({...turn,nextInstruction:'Turn right'},'en'),'In 160 meters, Turn right');
 assert.equal(directionPrompt({...turn,nextTurnMeters:201},'ar'),null);
 assert.equal(directionPrompt({...turn,nextStepIndex:-1},'ar'),null);
 assert.equal(directionPrompt({...turn,nextInstruction:''},'ar'),null);
});
