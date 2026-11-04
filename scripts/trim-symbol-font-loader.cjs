// expo-symbols needs only useFonts here. Importing it from the Google Fonts
// barrel also packages every filled/unused Material font (about 19 MB raw).
// Keep each actual icon weight import intact, and use Expo's official hook.
const {readFileSync,writeFileSync}=require('node:fs');
const path=require('node:path').join(require('node:path').dirname(require.resolve('expo-symbols')),'SymbolView.js');
const original=readFileSync(path,'utf8');
const old="import { useFonts } from '@expo-google-fonts/material-symbols';";
const replacement="import { useFonts } from 'expo-font';";
if(original.includes(old))writeFileSync(path,original.replace(old,replacement));
else if(!original.includes(replacement))throw Error('Review expo-symbols font loader after SDK update');
