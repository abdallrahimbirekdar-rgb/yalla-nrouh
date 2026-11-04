import {useColorScheme} from 'react-native';
import {useApp} from './context';
export const lightColors={ink:'#202529',muted:'#73787d',green:'#d67749',soft:'#f5f6f7',line:'#e8eaec',white:'#fff',error:'#bb4343',background:'#fff',surface:'#f7f8f9',purple:'#d67749',cyan:'#d67749',rose:'#d67749',gold:'#d67749',selected:'#fff5ef'};
export const darkColors={ink:'#f1f3f4',muted:'#aab2ba',green:'#f19b75',soft:'#20262c',line:'#353d46',white:'#fff',error:'#ff9e9e',background:'#11161b',surface:'#1c232a',purple:'#f19b75',cyan:'#f19b75',rose:'#f19b75',gold:'#f19b75',selected:'#382b25'};
export type Palette=typeof lightColors;
export function useTheme(){const {state}=useApp();const system=useColorScheme();const dark=state.preferences.theme==='dark'||state.preferences.theme==='system'&&system==='dark';return {dark,colors:dark?darkColors:lightColors};}
