// AbortSignal.timeout is not available in older Android WebViews.
export async function timedFetch(input:RequestInfo|URL,init?:RequestInit,timeoutMs=12000):Promise<Response>{
 const controller=new AbortController();const cancel=()=>controller.abort();
 if(init?.signal?.aborted)controller.abort();else init?.signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,timeoutMs);
 try{return await fetch(input,{...init,signal:controller.signal})}
 finally{clearTimeout(timer);init?.signal?.removeEventListener('abort',cancel)}
}
