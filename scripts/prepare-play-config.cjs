const fs=require('node:fs');
const app=require('../app.json');
const android=app.expo.android;
const versionCode=Number(process.env.PLAY_VERSION_CODE);
if(!Number.isInteger(versionCode)||versionCode<=android.versionCode||versionCode>2_100_000_000){
 throw Error('Play version code must be an integer greater than the test version code.');
}
android.versionCode=versionCode;
android.blockedPermissions=[...new Set([...android.blockedPermissions,
 'android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO',
 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED','android.permission.READ_EXTERNAL_STORAGE',
 'android.permission.WRITE_EXTERNAL_STORAGE','android.permission.CAMERA',
])];
const buildProperties=app.expo.plugins.find(plugin=>Array.isArray(plugin)&&plugin[0]==='expo-build-properties');
Object.assign(buildProperties[1].android,{compileSdkVersion:36,targetSdkVersion:36});
fs.writeFileSync('app.json',JSON.stringify(app,null,2)+'\n');
