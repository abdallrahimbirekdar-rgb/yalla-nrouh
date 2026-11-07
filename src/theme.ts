import {useColorScheme} from 'react-native';
import {useApp} from './context';

// Blue shades harmonize with the approved navy taxi logo.
const lightAccent='#1c527d';
const darkAccent='#92c6ed';
export const lightColors={
 ink:'#082648',muted:'#4c6680',soft:'#e4eef8',line:'#c4d5e7',white:'#fff',
 brandAction:'#082648',brandAccent:'#9f4028',brandTint:'#fff0e9',
 error:'#bb4343',background:'#edf3fb',surface:'#ffffff',selected:'#d6e6f5',
 green:lightAccent,purple:lightAccent,cyan:lightAccent,rose:lightAccent,gold:lightAccent,
};
export const darkColors={
 ink:'#f0f6ff',muted:'#b9cfe5',soft:'#112d4d',line:'#355674',white:'#fff',
 brandAction:'#193c60',brandAccent:'#ffaf92',brandTint:'#502d31',
 error:'#ff9e9e',background:'#081b35',surface:'#102b4b',selected:'#1a3b5b',
 green:darkAccent,purple:darkAccent,cyan:darkAccent,rose:darkAccent,gold:darkAccent,
};
export type Palette=typeof lightColors;
export function useTheme(){const {state}=useApp();const system=useColorScheme();const dark=state.preferences.theme==='dark'||state.preferences.theme==='system'&&system==='dark';return {dark,colors:dark?darkColors:lightColors};}
