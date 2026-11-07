const {spawnSync}=require('node:child_process');
const {copyFileSync,writeFileSync,readFileSync}=require('node:fs');
const result=spawnSync(process.execPath,['node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist-pages'],{stdio:'inherit',env:{...process.env,YALLA_WEB_BASE_PATH:'/yalla-nrouh'}});
if(result.status!==0)process.exit(result.status??1);
const revision=process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
if(!/^[a-f0-9]{40}$/i.test(revision))throw Error('Cannot identify website version');
const nativeHead='<meta name="yalla-site-version" content="'+revision+'"><script>let lang="ar";try{const saved=JSON.parse(localStorage.getItem("yalla-nrouh-demo-v1")||"null");const preference=saved?.storageVersion===2?saved.state?.language:saved?.language;if(["ar","de","en"].includes(preference))lang=preference}catch{}document.documentElement.lang=lang;</script>';
const html=readFileSync('dist-pages/index.html','utf8')
 .replace(/(<meta name="viewport" content="[^"]+)"/,'$1, interactive-widget=resizes-content"')
 .replace('</head>',nativeHead+'</head>');
writeFileSync('dist-pages/version.json',JSON.stringify({version:revision}));
const recovery=readFileSync('scripts/startup-recovery.html','utf8');
writeFileSync('dist-pages/index.html',html.replace('</body>',recovery+'</body>'));
copyFileSync('dist-pages/index.html','dist-pages/404.html');
writeFileSync('dist-pages/.nojekyll','');
