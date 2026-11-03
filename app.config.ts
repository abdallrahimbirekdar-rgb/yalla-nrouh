import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
  const key=process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return {...config,name:config.name??'يلا نروح',slug:config.slug??'yalla-nrouh',extra:{...config.extra,androidMapsConfigured:Boolean(key)},plugins:[
    ...(config.plugins??[]).filter(plugin=>(Array.isArray(plugin)?plugin[0]:plugin)!=='expo-location'),
    ['expo-location',{locationWhenInUsePermission:'اسمح ليلا نروح بتحديد نقطة انطلاقك عند طلبك. Allow Yalla Nrouh to find your pickup point when you ask.',isIosBackgroundLocationEnabled:false,isAndroidBackgroundLocationEnabled:false,isAndroidForegroundServiceEnabled:false}],
    ...(key?[['react-native-maps',{androidGoogleMapsApiKey:key}] as [string,Record<string,string>]]:[]),
  ]};
};
