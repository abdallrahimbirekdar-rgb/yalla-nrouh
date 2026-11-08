const maxInputBytes=20_000_000;
const maxJpegLength=240_000;
export async function readVehiclePhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>maxInputBytes)throw Error('invalid_photo');
 const image=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context||!image.width||!image.height)throw Error('invalid_photo');
  for(const limit of [960,640,400]){
   const scale=Math.min(1,limit/Math.max(image.width,image.height));
   canvas.width=Math.max(1,Math.round(image.width*scale));
   canvas.height=Math.max(1,Math.round(image.height*scale));
   context.fillStyle='#ffffff';
   context.fillRect(0,0,canvas.width,canvas.height);
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const jpeg=canvas.toDataURL('image/jpeg',0.76);
   const prefix='data:image/jpeg;base64,';
   if(jpeg.startsWith(prefix)&&jpeg.length-prefix.length<=maxJpegLength)return jpeg.slice(prefix.length);
  }
  throw Error('photo_too_large');
 }finally{image.close()}
}
