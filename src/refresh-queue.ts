// Keep the newest requested account/mode refresh while an older read finishes.
// A mode change must not be dropped by a boolean "already loading" guard.
export function createRefreshQueue(){
 let pending:(()=>Promise<void>)|null=null;
 let running:Promise<void>|null=null;
 return {run(work:()=>Promise<void>):Promise<void>{
  pending=work;
  if(!running)running=Promise.resolve().then(async()=>{
   let failure:unknown;
   try{while(pending){const next=pending;pending=null;try{await next();failure=undefined}catch(error){failure=error}}if(failure)throw failure}
   finally{running=null}
  });
  return running;
 }};
}
