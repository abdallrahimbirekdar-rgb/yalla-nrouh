import React,{useEffect} from 'react';
import {router} from 'expo-router';
import {Page,Label,useText} from '../ui';
export default function Driver(){const t=useText();useEffect(()=>router.replace({pathname:'/cloud',params:{mode:'driver'}}),[]);return <Page title={t('وضع السائق','Driver mode')}><Label>{t('جارٍ فتح وضع السائق…','Opening driver mode…')}</Label></Page>}
