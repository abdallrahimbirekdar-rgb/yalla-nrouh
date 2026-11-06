import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
  const mapsKey=process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const webBasePath=process.env.YALLA_WEB_BASE_PATH?.trim();
  const googleServicesFile=process.env.YALLA_GOOGLE_SERVICES_FILE?.trim();
  return {...config,...(webBasePath?{experiments:{...config.experiments,baseUrl:webBasePath}}:{}),
   ...(googleServicesFile?{android:{...config.android,googleServicesFile}}:{}),
   extra:{...config.extra,googleMapsConfigured:Boolean(mapsKey),driverPushConfigured:Boolean(googleServicesFile)},name:config.name??'يلا نروح',slug:config.slug??'yalla-nrouh',plugins:[
    ...(config.plugins??[]).filter(plugin=>(Array.isArray(plugin)?plugin[0]:plugin)!=='expo-location'),
    ...(mapsKey?[['react-native-maps',{androidGoogleMapsApiKey:mapsKey}] as [string,Record<string,string>]]:[]),
    ['expo-location',{locationWhenInUsePermission:'اسمح ليلا نروح باستخدام موقعك الدقيق لتحديد الانطلاق وإظهار الطريق وتسجيل الرحلة أثناء استخدام التطبيق. Allow precise location for pickup, routes and ride recording while you use the app.',isIosBackgroundLocationEnabled:false,isAndroidBackgroundLocationEnabled:false,isAndroidForegroundServiceEnabled:false}],
  ]};
};
