import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
  const webBasePath=process.env.YALLA_WEB_BASE_PATH?.trim();
  return {...config,...(webBasePath?{experiments:{...config.experiments,baseUrl:webBasePath}}:{}),name:config.name??'يلا نروح',slug:config.slug??'yalla-nrouh',plugins:[
    ...(config.plugins??[]).filter(plugin=>(Array.isArray(plugin)?plugin[0]:plugin)!=='expo-location'),
    ['expo-location',{locationWhenInUsePermission:'اسمح ليلا نروح بتحديد نقطة انطلاقك عند طلبك. Allow Yalla Nrouh to find your pickup point when you ask.',isIosBackgroundLocationEnabled:false,isAndroidBackgroundLocationEnabled:false,isAndroidForegroundServiceEnabled:false}],
  ]};
};
