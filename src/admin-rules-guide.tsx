import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {cloudAdminRuleHistory,cloudAdminRuleRevision,cloudCurrentToken,cloudReviseAdminRule,CloudError,type AdminRuleRevision,type AdminRuleRevisionInfo} from './cloud-api';
import {Button,Field,Label,Panel,useText,useTheme} from './ui';

export default function AdminRulesGuide(){
 const t=useText();const {colors}=useTheme();
 const [current,setCurrent]=useState<AdminRuleRevision|null>(null);
 const [previous,setPrevious]=useState<AdminRuleRevision|null>(null);
 const [history,setHistory]=useState<AdminRuleRevisionInfo[]>([]);
 const [hasMore,setHasMore]=useState(false),[busy,setBusy]=useState(true);
 const [section,setSection]=useState<string|null>(null),[body,setBody]=useState(''),[summary,setSummary]=useState('');
 const [notice,setNotice]=useState('');
 const [conflict,setConflict]=useState<'reload'|'compare'|null>(null);
 const alive=useRef(true);
 const doc=previous??current;

 async function load(){
  setBusy(true);setNotice('');
  try{
   const token=await cloudCurrentToken();
   const [latest,entries]=await Promise.all([cloudAdminRuleRevision(token),cloudAdminRuleHistory(token,0)]);
   if(!alive.current)return;
   setCurrent(latest);setHistory(entries);setConflict(value=>latest&&value==='reload'?'compare':value);setHasMore(entries.length===15);
   if(!latest)setNotice(t('تعذر الوصول إلى الدليل. تحقق من صلاحية الإدارة.','The guide could not be opened. Check admin access.'));
  }catch{if(alive.current)setNotice(t('تعذر تحميل دليل التطبيق.','Could not load the app guide.'))}
  finally{if(alive.current)setBusy(false)}
 }
 const initialLoad=useRef(load);initialLoad.current=load;
 useEffect(()=>{alive.current=true;void initialLoad.current();return()=>{alive.current=false}},[]);

 async function save(){
  if(busy||conflict==='reload'||!current||!section||!body.trim()||!summary.trim())return;
  setBusy(true);setNotice('');
  try{
   const token=await cloudCurrentToken();
   const id=await cloudReviseAdminRule(token,current.id,section,body,summary);
   if(!alive.current)return;
   setSection(null);setConflict(null);
   if(id===current.id){
    setNotice(t('نص القسم مطابق للنسخة الحالية.','The section matches the current revision.'));
    return;
   }
   await load();
  }catch(error){
   if(!alive.current)return;
   const changed=error instanceof CloudError&&error.kind==='YR001';
   if(changed)setConflict('reload');
   setNotice(changed
    ? t('حُفظت نسخة أحدث. حمّلها وقارنها بمسودتك قبل الحفظ.','A newer revision was saved. Load it and compare it with your draft before saving.')
    : t('تعذر حفظ التعديل. النص اللي كتبته ما زال في النموذج.','Could not save. Your draft is still in the form.'));
  }finally{if(alive.current)setBusy(false)}
 }
 async function showRevision(id:number){
  if(busy||section)return;
  setBusy(true);setNotice('');
  try{
   const revision=await cloudAdminRuleRevision(await cloudCurrentToken(),id);
   if(!alive.current)return;
   if(revision)setPrevious(revision);
   else setNotice(t('تعذر فتح هذه النسخة.','Could not open this revision.'));
  }catch{if(alive.current)setNotice(t('تعذر فتح هذه النسخة.','Could not open this revision.'))}
  finally{if(alive.current)setBusy(false)}
 }
 async function more(){
  if(busy)return;
  setBusy(true);setNotice('');
  try{
   const entries=await cloudAdminRuleHistory(await cloudCurrentToken(),history.length);
   if(alive.current){setHistory(old=>[...old,...entries.filter(entry=>!old.some(item=>item.id===entry.id))]);setHasMore(entries.length===15)}
  }catch{if(alive.current)setNotice(t('تعذر تحميل بقية السجل.','Could not load more revisions.'))}
  finally{if(alive.current)setBusy(false)}
 }
 const formatDate=(value:string)=>new Date(value).toLocaleString(t('ar','en','de'));
 return <>
  <Panel>
   <Label large>{t('كيف يعمل التطبيق','How the app works')}</Label>
   <Label>{t('مرجع الإدارة لقواعد الحجز والتسعير وتوزيع الطلبات والملاحة.','The admin reference for booking, pricing, offers, and navigation.')}</Label>
   <Label muted>{t('تعديل الشرح يضيف نسخة إلى السجل. لتغيير سلوك التطبيق نفسه يلزم نشر تعديل على التطبيق.','Editing the guide adds a revision. Changing how the app works requires a software update.')}</Label>
   {doc&&<Label>{t('النسخة','Revision')} {doc.id} · {formatDate(doc.published_at)}</Label>}
   {previous&&<Button secondary title={t('العودة للنسخة الحالية','Back to current revision')} onPress={()=>setPrevious(null)}/>}
   {!doc&&!busy&&<Button secondary title={t('إعادة المحاولة','Retry')} onPress={()=>void load()}/>}
  </Panel>
  {busy&&<ActivityIndicator color={colors.purple}/>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {doc&&Object.keys(doc.sections).sort().map(key=>{
   const rule=doc.sections[key];
   return <Panel key={key}>
    <Label large>{rule.title}</Label>
    {section===key?<>
     <Field label={t('شرح القاعدة','Rule explanation')} value={body} onChangeText={setBody} multiline maxLength={6000} editable={!busy} style={{minHeight:150,textAlignVertical:'top'}}/>
     <Field label={t('شو تغيّر؟ سيظهر في السجل','What changed? Shown in history')} value={summary} onChangeText={setSummary} maxLength={400} editable={!busy}/>
     {conflict==='compare'&&<View style={{gap:4}}><Label>{t('النص المنشور حاليًا للمقارنة','Current published text for comparison')}</Label><Label muted>{rule.body}</Label></View>}
     <Button icon="save-outline" title={t('حفظ نسخة جديدة','Save new revision')} onPress={()=>void save()} disabled={busy||conflict==='reload'||!body.trim()||!summary.trim()}/>
     <Button secondary title={t('إلغاء التحرير','Cancel editing')} disabled={busy} onPress={()=>{setSection(null);setNotice('');setConflict(null)}}/>
     {conflict==='reload'&&<Button secondary title={t('تحميل النسخة الحالية مع إبقاء المسودة','Load current revision and keep draft')} disabled={busy} onPress={()=>void load()}/>}
    </>:<>
     {rule.body.split('\n').filter(line=>line.trim()).map((line,index)=><Label key={index}>• {line}</Label>)}
     {!previous&&!section&&<Button secondary icon="create-outline" title={t('تعديل الشرح','Edit explanation')} disabled={busy} onPress={()=>{setSection(key);setBody(rule.body);setSummary('');setNotice('')}}/>}
    </>}
   </Panel>;
  })}
  {current&&<Panel>
   <Label large>{t('سجل تغييرات الدليل','Guide revision history')}</Label>
   {history.map(entry=><View key={entry.id} style={{borderTopWidth:1,borderColor:colors.line,paddingTop:10,gap:6}}>
    <Label>{t('النسخة','Revision')} {entry.id} · {entry.summary}</Label>
    <Label muted>{formatDate(entry.published_at)}{entry.changed_section&&current.sections[entry.changed_section]?' · '+current.sections[entry.changed_section].title:''}</Label>
    {entry.id!==current.id&&entry.id!==previous?.id&&<Button secondary title={t('عرض هذه النسخة','View this revision')} disabled={busy||!!section} onPress={()=>void showRevision(entry.id)}/>}
   </View>)}
   {hasMore&&<Button secondary title={t('عرض نسخ أقدم','Show older revisions')} disabled={busy} onPress={()=>void more()}/>}
  </Panel>}
 </>;
}
