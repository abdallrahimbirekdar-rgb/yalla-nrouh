import type {Language} from './domain.ts';
import {german} from './locale-de.ts';

export const languages = [
 {id:'ar',name:'العربية'},
 {id:'de',name:'Deutsch'},
 {id:'en',name:'English'},
] as const;

export function translate(language:Language,ar:string,en:string,de?:string):string{
 if(language==='ar')return ar;
 if(language==='en')return en;
 return de??(Object.hasOwn(german,en)?german[en]:en);
}
