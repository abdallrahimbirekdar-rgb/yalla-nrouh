import React from 'react';
import Constants from 'expo-constants';
import {normalizeServiceUrl} from '../api';
import {Label,Page,Panel,useText} from '../ui';
export default function Services(){const t=useText();let configured=false,invalid=false;try{configured=Boolean(normalizeServiceUrl(process.env.EXPO_PUBLIC_API_URL))}catch{invalid=true}
  return <Page title={t('حالة الخدمات','Service status')}>
    <Panel><Label>{t('حجز الرحلات','Ride booking')}</Label><Label muted>{t('تجريبي محلي. لم يُربط بخادم الحجز.','Local demo. Not connected to a booking server.')}</Label></Panel>
    <Panel><Label>{t('البحث بالعناوين','Address search')}</Label><Label muted>{invalid?t('عنوان الخدمة غير صالح. يلزم عنوان HTTPS.','Invalid service address. An HTTPS address is required.'):configured?t('عنوان الخدمة مُعدّ. نجاح الاتصال يُتحقق منه عند البحث.','Service address is set. Connection is checked when you search.'):t('الخدمة لم تُربط بعد. الإدخال اليدوي متاح.','Service is not connected yet. Manual entry is available.')}</Label></Panel>
    <Panel><Label>{t('خريطة أندرويد','Android map')}</Label><Label muted>{Constants.expoConfig?.extra?.androidMapsConfigured?t('مفتاح الخرائط مُعدّ في البناء. يحتاج اختبارًا على الجهاز.','Maps key is set in the build. Device testing is still needed.'):t('تحتاج مفتاح خرائط عند بناء التطبيق.','A maps key is needed when building the app.')}</Label></Panel>
    <Panel><Label>{t('خريطة آيفون','iPhone map')}</Label><Label muted>{t('مهيأة لاستخدام خرائط Apple. لم تُختبر على جهاز فعلي بعد.','Set up to use Apple Maps. Not yet tested on a physical device.')}</Label></Panel>
    <Panel><Label>{t('تحديد الموقع','Find current location')}</Label><Label muted>{t('عند طلب المستخدم فقط، دون تتبع في الخلفية. يتطلب إذن النظام.','Only when the user asks, with no background tracking. System permission is required.')}</Label></Panel>
  </Page>
}
