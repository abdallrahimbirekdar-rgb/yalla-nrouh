import {useColorScheme} from 'react-native';
import {useApp} from './context';
const lightAccent='#006da5';
const darkAccent='#65c8f0';
export const lightColors={
 ink:'#102a43',muted:'#4d6578',soft:'#f0f7fc',line:'#d3e5f1',white:'#fff',
 error:'#bb4343',background:'#fff',surface:'#f3f9fd',selected:'#e2f3fc',
 green:lightAccent,purple:lightAccent,cyan:lightAccent,rose:lightAccent,gold:lightAccent,
};
export const darkColors={
 ink:'#eaf5fc',muted:'#aec5d6',soft:'#102437',line:'#28475c',white:'#fff',
 error:'#ff9e9e',background:'#0b1b2b',surface:'#142b40',selected:'#163a53',
 green:darkAccent,purple:darkAccent,cyan:darkAccent,rose:darkAccent,gold:darkAccent,
};
export type Palette=typeof lightColors;
export function useTheme(){const {state}=useApp();const system=useColorScheme();const dark=state.preferences.theme==='dark'||state.preferences.theme==='system'&&system==='dark';return {dark,colors:dark?darkColors:lightColors};}
