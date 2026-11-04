import {nativeAction} from './site-bridge.web';
export async function enableLocalAlerts():Promise<boolean>{return nativeAction('alerts-enable')}
export async function notifyLocal(title:string,body:string):Promise<void>{if(typeof window!=='undefined'&&'ReactNativeWebView' in window&&!await nativeAction('notify',{title,body}))throw Error('Local alert was not shown')}
