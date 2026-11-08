export interface UsageMetric {
 id:string;ar:string;en:string;cap:number;unit:string;
}
export interface AdminServiceUsage {
 database_bytes:number;storage_bytes:number;recent_sign_ins:number;
 proxy_calls_today:number;proxy_calls_30_days:number;proxy_resets_at:string;checked_at:string;
}

export const serviceMetrics:Record<'supabase'|'google'|'github',readonly UsageMetric[]>={
 supabase:[
  {id:'sb-egress',ar:'نقل البيانات غير المخزّنة مؤقتًا',en:'Uncached egress',cap:5,unit:'GB'},
  {id:'sb-cache-egress',ar:'نقل البيانات المخزّنة مؤقتًا',en:'Cached egress',cap:5,unit:'GB'},
  {id:'sb-storage',ar:'تخزين الملفات',en:'File storage',cap:1,unit:'GB'},
  {id:'sb-auth',ar:'المستخدمون النشطون شهريًا',en:'Monthly active users',cap:50000,unit:'MAU'},
  {id:'sb-edge',ar:'استدعاءات Edge Functions',en:'Edge Function invocations',cap:500000,unit:''},
  {id:'sb-realtime',ar:'رسائل Realtime',en:'Realtime messages',cap:2000000,unit:''},
  {id:'sb-peak',ar:'ذروة اتصالات Realtime',en:'Realtime peak connections',cap:200,unit:''},
 ],
 google:[
  {id:'maps-dynamic',ar:'تحميل الخرائط',en:'Dynamic Maps',cap:10000,unit:''},
  {id:'places-autocomplete',ar:'اقتراحات العناوين',en:'Autocomplete Requests',cap:10000,unit:''},
  {id:'places-details',ar:'تفاصيل المكان · Essentials',en:'Place Details Essentials',cap:10000,unit:''},
  {id:'places-search',ar:'بحث الأماكن بالنص · Pro',en:'Text Search Pro',cap:5000,unit:''},
  {id:'maps-geocode',ar:'تحويل الإحداثيات إلى عنوان',en:'Geocoding',cap:10000,unit:''},
  {id:'routes-compute',ar:'حساب الطريق · Essentials',en:'Compute Routes Essentials',cap:10000,unit:''},
  {id:'routes-matrix',ar:'ترتيب السائقين · عناصر المصفوفة',en:'Route Matrix Essentials · elements',cap:10000,unit:''},
 ],
 github:[{id:'pages-bandwidth',ar:'نقل بيانات الموقع · حد مرن شهري',en:'Site bandwidth · monthly soft limit',cap:100,unit:'GB'}],
};

export function dateInZone(date:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(key:string)=>parts.find(item=>item.type===key)!.value;
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function nextGoogleReset(date:Date){
 const current=dateInZone(date,'America/Los_Angeles');
 const [year,month]=current.split('-').map(Number);
 return new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
}
export function quotaRemaining(used:number,cap:number){
 return {remaining:Math.max(0,cap-used),ratio:Math.min(1,used/cap),state:used>=cap?'limit':used>=cap*.8?'near':'within'} as const;
}
