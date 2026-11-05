const recentWindowMs=10*60*1000;
export type HeardOffers=Record<string,number>;

export function pendingOfferChimes(
 offers:readonly {ride_id:string;expiresOnDevice?:number}[],
 heard:HeardOffers,
 monotonicNow:number,
 wallNow:number,
){
 return [...new Set(offers
  .filter(offer=>(offer.expiresOnDevice??0)>monotonicNow&&!(heard[offer.ride_id]>wallNow-recentWindowMs))
  .map(offer=>offer.ride_id))];
}

export function rememberOfferChimes(heard:HeardOffers,ids:string[],now:number):HeardOffers{
 return Object.fromEntries([
  ...ids.map(id=>[id,now] as const),
  ...Object.entries(heard).filter(([id,time])=>!ids.includes(id)&&time>now-recentWindowMs),
 ].slice(0,160));
}

export function playOfferChime(context:AudioContext):boolean{
 if(context.state!=='running')return false;
 try{
  const start=context.currentTime+0.015;
  for(const [frequency,delay] of [[740,0],[988,0.19]]){
   const note=context.createOscillator();
   const envelope=context.createGain();
   const time=start+delay;
   note.type='sine';note.frequency.value=frequency;
   envelope.gain.setValueAtTime(0,time);
   envelope.gain.linearRampToValueAtTime(0.23,time+0.025);
   envelope.gain.exponentialRampToValueAtTime(0.001,time+0.16);
   note.connect(envelope).connect(context.destination);
   note.onended=()=>{note.disconnect();envelope.disconnect()};
   note.start(time);
   note.stop(time+0.17);
  }
  return true;
 }catch{return false}
}
