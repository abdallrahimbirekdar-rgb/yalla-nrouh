export const reasons={
 passenger:[
  ['changed_plans','غيّرت خططي','My plans changed','Meine Pläne haben sich geändert'],
  ['wait_too_long','الانتظار طويل','The wait is too long','Die Wartezeit ist zu lang'],
  ['wrong_pickup','نقطة الانطلاق غير صحيحة','Wrong pickup point','Falscher Abholort'],
  ['driver_not_found','لم أجد السائق','I couldn’t find the driver','Ich habe den Fahrer nicht gefunden'],
  ['other_transport','وجدت وسيلة نقل أخرى','I found another way to get there','Ich habe eine andere Fahrtmöglichkeit gefunden'],
  ['other','سبب آخر','Another reason','Anderer Grund'],
 ],
 driver:[
  ['passenger_not_found','لم أجد الزبون','I couldn’t find the passenger','Ich habe den Fahrgast nicht gefunden'],
  ['pickup_unreachable','تعذّر الوصول إلى نقطة الركوب','I couldn’t reach the pickup point','Ich konnte den Abholort nicht erreichen'],
  ['vehicle_problem','مشكلة في السيارة','Vehicle problem','Fahrzeugproblem'],
  ['emergency','ظرف طارئ','Emergency','Notfall'],
  ['other','سبب آخر','Another reason','Anderer Grund'],
 ],
} as const;
export type CancellationActor=keyof typeof reasons;
export type CancellationReason=typeof reasons[CancellationActor][number][0];

/** Keep driver and passenger reasons consistent across native and web dialogs. */
export function cancellationReasonOptions(actor:CancellationActor,arrived:boolean){
 return reasons[actor].filter(([id])=>id!=='passenger_not_found'||arrived);
}
