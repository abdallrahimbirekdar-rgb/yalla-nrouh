import React from 'react';
import {View} from 'react-native';
import {type Coordinate} from '../geo';
import {Label,useText} from '../ui';
export default function MapCanvas({point}:{point:Coordinate|null;onChange:(point:Coordinate)=>void}){const t=useText();return <View><Label muted>{point?t('تم تحديد النقطة. يمكنك تعديلها أدناه.','Point selected. You can change it below.'):t('اختيار الموقع بالخريطة متاح في تطبيق الهاتف. في هذه المعاينة استخدم الموقع الحالي أو أدخل الإحداثيات.','Map selection is available in the phone app. In this preview, use your location or enter coordinates.')}</Label></View>}
