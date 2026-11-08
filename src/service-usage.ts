export interface UsageMetric {
 id:string;ar:string;en:string;cap:number;unit:string;reset:'google'|'manual'|'none';
}
export interface UsageSnapshot {used:number;resets_on:string|null;recorded_at:string}
export interface AdminServiceUsage {
 database_bytes:number;proxy_calls_today:number;proxy_resets_at:string;checked_at:string;
 snapshots:Record<string,UsageSnapshot|undefined>;
}

export const serviceMetrics:Record<'supabase'|'google'|'github',readonly UsageMetric[]>={
 supabase:[
  {id:'sb-egress',ar:'نقل البيانات غير المخزّنة مؤقتًا',en:'Uncached egress',cap:5,unit:'GB',reset:'manual'},
  {id:'sb-cache-egress',ar:'نقل البيانات المخزّنة مؤقتًا',en:'Cached egress',cap:5,unit:'GB',reset:'manual'},
  {id:'sb-storage',ar:'تخزين الملفات',en:'File storage',cap:1,unit:'GB',reset:'none'},
  {id:'sb-auth',ar:'المستخدمون النشطون شهريًا',en:'Monthly active users',cap:50000,unit:'MAU',reset:'manual'},
  {id:'sb-edge',ar:'استدعاءات Edge Functions',en:'Edge Function invocations',cap:500000,unit:'',reset:'manual'},
  {id:'sb-realtime',ar:'رسائل Realtime',en:'Realtime messages',cap:2000000,unit:'',reset:'manual'},
  {id:'sb-peak',ar:'ذروة اتصالات Realtime',en:'Realtime peak connections',cap:200,unit:'',reset:'manual'},
 ],
 google:[
  {id:'maps-dynamic',ar:'تحميل الخرائط',en:'Dynamic Maps',cap:10000,unit:'',reset:'google'},
  {id:'places-autocomplete',ar:'اقتراحات العناوين',en:'Autocomplete Requests',cap:10000,unit:'',reset:'google'},
  {id:'places-details',ar:'تفاصيل المكان · Essentials',en:'Place Details Essentials',cap:10000,unit:'',reset:'google'},
  {id:'places-search',ar:'بحث الأماكن بالنص · Pro',en:'Text Search Pro',cap:5000,unit:'',reset:'google'},
  {id:'maps-geocode',ar:'تحويل الإحداثيات إلى عنوان',en:'Geocoding',cap:10000,unit:'',reset:'google'},
  {id:'routes-compute',ar:'حساب الطريق · Essentials',en:'Compute Routes Essentials',cap:10000,unit:'',reset:'google'},
  {id:'routes-matrix',ar:'ترتيب السائقين · عناصر المصفوفة',en:'Route Matrix Essentials · elements',cap:10000,unit:'',reset:'google'},
 ],
 github:[{id:'pages-bandwidth',ar:'نقل بيانات الموقع · حد مرن شهري',en:'Site bandwidth · monthly soft limit',cap:100,unit:'GB',reset:'manual'}],
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
export function validUsageDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function usageSnapshotExpired(metric:UsageMetric,snapshot:UsageSnapshot,now:Date){
 if(metric.reset==='google')return snapshot.resets_on!==nextGoogleReset(now);
 return metric.reset==='manual'&&!!snapshot.resets_on&&snapshot.resets_on<=dateInZone(now,Intl.DateTimeFormat().resolvedOptions().timeZone);
}
