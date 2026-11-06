const {withAppBuildGradle}=require('expo/config-plugins');

module.exports=config=>withAppBuildGradle(config,mod=>{
 const gradle=mod.modResults;
 if(gradle.language!=='groovy')throw new Error('Driver navigation requires Groovy app Gradle configuration');
 // The Navigation SDK already includes Google's Maps SDK classes.
 const marker='// Driver navigation Gradle configuration';
 if(!gradle.contents.includes(marker))gradle.contents+=`
${marker}
configurations.configureEach {
    exclude group: 'com.google.android.gms', module: 'play-services-maps'
}

android.compileOptions.coreLibraryDesugaringEnabled = true
dependencies {
    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.0.3'
}
`;
 return mod;
});
