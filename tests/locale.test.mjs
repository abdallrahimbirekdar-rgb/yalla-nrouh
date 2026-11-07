import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduce} from '../src/domain.ts';
import {translate} from '../src/locale.ts';
import {emptyDraft,readSaved} from '../src/persistence.ts';

test('German selection survives reopening without replacing the existing draft',()=>{
 const state=reduce(initialState,{type:'language',language:'de'});
 const draft={...emptyDraft,destination:'Damascus'};
 assert.deepEqual(readSaved(JSON.stringify({storageVersion:2,state,draft})),{state,draft});
 assert.equal(translate(state.language,'العناوين المحفوظة','Saved addresses'),'Gespeicherte Adressen');
 assert.equal(translate(state.language,'الرحلات الأخيرة','Recent rides'),'Letzte Fahrten');
});

test('previous Arabic and English preferences still restore',()=>{
 for(const language of ['ar','en']){
  assert.equal(readSaved(JSON.stringify({...initialState,language})).state.language,language);
 }
});
