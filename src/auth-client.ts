import {createClient,type SupabaseClient,type SupportedStorage} from '@supabase/supabase-js';
import {timedFetch} from './fetch-timeout.ts';
const ROOT='https://gokosprcqpdvqgahvquk.supabase.co';
const KEY='sb_publishable_0l-T6t_dTDt1OedSTIpLNA_uruCvJ8C';
export function createAppAuthClient(options:{storage?:SupportedStorage;fetcher?:typeof fetch;persistSession?:boolean;autoRefreshToken?:boolean;detectSessionInUrl?:boolean}={}){
 return createClient(ROOT,KEY,{auth:{storageKey:'yalla-nrouh-auth-v1',persistSession:options.persistSession??typeof window!=='undefined',autoRefreshToken:options.autoRefreshToken??true,detectSessionInUrl:options.detectSessionInUrl??typeof window!=='undefined',...(options.storage?{storage:options.storage}:{})},global:{fetch:options.fetcher??timedFetch}});
}
let client:SupabaseClient|undefined;
export function authClient(){return client??(client=createAppAuthClient())}
