import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
async function channel(){if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('rides',{name:'Ride updates',importance:Notifications.AndroidImportance.DEFAULT,sound:'default'});}
export async function enableLocalAlerts():Promise<boolean>{await channel();const result=await Notifications.requestPermissionsAsync();return result.granted;}
export async function notifyLocal(title:string,body:string){await channel();if(!(await Notifications.getPermissionsAsync()).granted)throw Error('Permission denied');await Notifications.scheduleNotificationAsync({content:{title,body,sound:'default'},trigger:Platform.OS==='android'?{channelId:'rides'}:null});}
