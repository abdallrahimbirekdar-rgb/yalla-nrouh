import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
  const mapsKey=process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const webBasePath=process.env.YALLA_WEB_BASE_PATH?.trim();
  const firebaseFile=process.env.YALLA_FIREBASE_ANDROID_CONFIG?.trim();
  return {...config,...(firebaseFile?{android:{...config.android,googleServicesFile:firebaseFile}}:{}),...(webBasePath?{experiments:{...config.experiments,baseUrl:webBasePath}}:{}),extra:{...config.extra,googleMapsConfigured:Boolean(mapsKey),ridePushConfigured:Boolean(firebaseFile)},name:config.name??'يلا نروح',slug:config.slug??'yalla-nrouh',plugins:[
    ...(config.plugins??[]).filter(plugin=>(Array.isArray(plugin)?plugin[0]:plugin)!=='expo-location'),
    ...(mapsKey?[['react-native-maps',{androidGoogleMapsApiKey:mapsKey}] as [string,Record<string,string>]]:[]),
    ['expo-location',{locationWhenInUsePermission:'اسمح ليلا نروح باستخدام موقعك الدقيق لتحديد الانطلاق وإظهار الطريق وتسجيل الرحلة أثناء استخدام التطبيق. Allow precise location for pickup, routes and ride recording while you use the app.',isIosBackgroundLocationEnabled:false,isAndroidBackgroundLocationEnabled:false,isAndroidForegroundServiceEnabled:false}],
  ]};
};
