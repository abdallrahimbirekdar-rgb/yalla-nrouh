import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
async function channel(){if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('rides',{name:'Ride updates',importance:Notifications.AndroidImportance.DEFAULT,sound:'default'});}
export const readLocalAlerts=()=>Notifications.getPermissionsAsync();
export async function requestLocalAlerts(){await channel();return Notifications.requestPermissionsAsync();}
export async function localAlertsGranted():Promise<boolean>{return (await readLocalAlerts()).granted;}
export async function enableLocalAlerts():Promise<boolean>{return (await requestLocalAlerts()).granted;}
export async function notifyLocal(title:string,body:string){await channel();if(!(await Notifications.getPermissionsAsync()).granted)throw Error('Permission denied');await Notifications.scheduleNotificationAsync({content:{title,body,sound:'default'},trigger:Platform.OS==='android'?{channelId:'rides'}:null});}
