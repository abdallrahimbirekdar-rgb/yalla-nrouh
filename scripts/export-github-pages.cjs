const {spawnSync}=require('node:child_process');
const {copyFileSync,writeFileSync}=require('node:fs');
const result=spawnSync(process.execPath,['node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist-pages'],{stdio:'inherit',env:{...process.env,YALLA_WEB_BASE_PATH:'/yalla-nrouh'}});
if(result.status!==0)process.exit(result.status??1);
copyFileSync('dist-pages/index.html','dist-pages/404.html');
writeFileSync('dist-pages/.nojekyll','');
