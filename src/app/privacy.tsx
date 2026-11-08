import {Linking} from 'react-native';
import {router} from 'expo-router';
import policy from '../privacy-policy.json';
import {useApp} from '../context';
import {Button,Label,Page,Panel,useText} from '../ui';

export default function Privacy(){
 const {state:{language}}=useApp();
 const t=useText();
 const index=language==='ar'?0:language==='de'?2:1;
 return <Page simpleHeader title={t('سياسة خصوصية يلّا نروح','Yalla Nrouh privacy policy','Datenschutzerklärung für Yalla Nrouh')}>
  {policy.sections.map(({heading,body})=><Panel key={heading[1]}>
   <Label large>{heading[index]}</Label><Label>{body[index]}</Label>
  </Panel>)}
  <Button secondary title={policy.email} onPress={()=>void Linking.openURL('mailto:'+policy.email).catch(()=>{})}/>
  <Button secondary icon="trash-outline" title={t('حذف الحساب','Delete account','Konto löschen')} onPress={()=>router.push('/delete-account')}/>
 </Page>;
}
