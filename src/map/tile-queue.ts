// Limit visible-area requests; never prefetch neighbouring map regions.
export class TileQueue {
 private active=0;
 private pending:((done:()=>void)=>void)[]=[];
 private disposed=false;
 private limit:number;
 constructor(limit:number){this.limit=limit}
 setLimit(limit:number){this.limit=limit;this.drain()}
 add(start:(done:()=>void)=>void){if(!this.disposed){this.pending.push(start);this.drain()}}
 dispose(){this.disposed=true;this.pending=[]}
 private drain(){
  while(!this.disposed&&this.active<this.limit&&this.pending.length){
   const start=this.pending.shift()!;this.active++;let finished=false;
   start(()=>{if(finished)return;finished=true;this.active--;this.drain()});
  }
 }
}
