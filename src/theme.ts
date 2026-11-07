import {useColorScheme} from 'react-native';
import {useApp} from './context';

// Blue shades harmonize with the approved navy taxi logo.
export const brandHeader={background:'#071c39',ink:'#ffffff',accent:'#53efdb',control:'#143359',line:'#325780'};
const lightAccent='#0755b3';
const darkAccent='#91c3ff';
export const lightColors={
 ink:'#082648',muted:'#385570',soft:'#e3eeff',line:'#adbfda',white:'#fff',
 brandAction:'#0053b9',brandAccent:'#006253',brandTint:'#cefff2',
 error:'#bb4343',background:'#edf3fb',surface:'#ffffff',selected:'#d5e7ff',
 green:lightAccent,purple:lightAccent,cyan:lightAccent,rose:lightAccent,gold:lightAccent,
};
export const darkColors={
 ink:'#f0f6ff',muted:'#b9cfe5',soft:'#112d4d',line:'#355674',white:'#fff',
 brandAction:'#145db7',brandAccent:'#73f0da',brandTint:'#174c49',
 error:'#ff9e9e',background:'#081b35',surface:'#102b4b',selected:'#1a3b5b',
 green:darkAccent,purple:darkAccent,cyan:darkAccent,rose:darkAccent,gold:darkAccent,
};
export type Palette=typeof lightColors;
export function useTheme(){const {state}=useApp();const system=useColorScheme();const dark=state.preferences.theme==='dark'||state.preferences.theme==='system'&&system==='dark';return {dark,colors:dark?darkColors:lightColors};}
