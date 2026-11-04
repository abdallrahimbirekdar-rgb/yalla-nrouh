import test from 'node:test';
import assert from 'node:assert/strict';
import makeConfig from '../app.config.ts';

const baseConfig={
  name:'يلا نروح',
  slug:'yalla-nrouh',
  plugins:['expo-router','expo-location'],
  extra:{keepExisting:true}
};
const setup={config:baseConfig};

function withMapsKey(key,work){
  const old=process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if(key===undefined)delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  else process.env.GOOGLE_MAPS_ANDROID_API_KEY=key;
  try{return work()}finally{
    if(old===undefined)delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    else process.env.GOOGLE_MAPS_ANDROID_API_KEY=old;
  }
}
function namedPlugins(config,name){
  return (config.plugins??[]).filter(plugin=>(Array.isArray(plugin)?plugin[0]:plugin)===name);
}

test('missing Google Maps Android secret leaves SDK unconfigured without inventing a key',()=>{
  withMapsKey(undefined,()=>{
    const config=makeConfig(setup);
    assert.equal(config.extra.googleMapsConfigured,false);
    assert.equal(config.extra.keepExisting,true);
    assert.equal(namedPlugins(config,'react-native-maps').length,0);
    assert.equal(namedPlugins(config,'expo-location').length,1);
  });
});

test('restricted SDK key is installed in Android config plugin without leaking into runtime metadata',()=>{
  const dummy='AIza'+'A'.repeat(35);
  withMapsKey('  '+dummy+'  ',()=>{
    const config=makeConfig(setup);
    assert.equal(config.extra.googleMapsConfigured,true);
    const maps=namedPlugins(config,'react-native-maps');
    assert.equal(maps.length,1);
    assert.equal(maps[0][1].androidGoogleMapsApiKey,dummy);
    assert.equal(JSON.stringify(config.extra).includes(dummy),false);
    assert.equal(namedPlugins(config,'expo-location').length,1);
  });
});
