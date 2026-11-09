// An original A–B diagram. The live Google map and road geometry are not captured.
export function createRideShareImage(title:string,from:string,to:string):Promise<Blob|null>{
 const canvas=document.createElement('canvas');
 canvas.width=800;
 canvas.height=320;
 const context=canvas.getContext('2d');
 if(!context)return Promise.resolve(null);
 context.fillStyle='#edf3fb';
 context.fillRect(0,0,800,320);
 context.textAlign='center';
 context.textBaseline='middle';
 context.fillStyle='#082648';
 context.font='bold 26px sans-serif';
 context.fillText(title,400,44,720);

 context.strokeStyle='#245ec6';
 context.lineWidth=6;
 context.lineCap='round';
 context.beginPath();
 context.moveTo(120,145);
 context.lineTo(680,145);
 context.moveTo(576,130);
 context.lineTo(596,145);
 context.lineTo(576,160);
 context.stroke();

 for(const [x,marker,label] of [[120,'A',from],[680,'B',to]] as const){
  context.beginPath();
  context.arc(x,145,26,0,Math.PI*2);
  context.fillStyle='#245ec6';
  context.fill();
  context.fillStyle='#fff';
  context.font='bold 24px sans-serif';
  context.fillText(marker,x,146);
  context.fillStyle='#082648';
  context.font='22px sans-serif';
  context.fillText(label,x===120?220:580,224,330);
 }

 return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
