const {execFileSync,spawnSync}=require('node:child_process');
const {existsSync,mkdirSync,writeFileSync}=require('node:fs');
const {dirname,resolve}=require('node:path');

// Keep recent bundles used by cached HTML, but do not copy every historical
// bundle from gh-pages: unbounded copies can stall the Pages file-sync stage.
function retainWebAssets({cwd=process.cwd(),directory='dist-pages',ref='FETCH_HEAD',fetch=true,maxRevisions=12}={}){
 const output=resolve(cwd,directory);mkdirSync(output,{recursive:true});
 if(fetch){
  const result=spawnSync('git',['fetch','--no-tags','--depth=14','origin','gh-pages'],{cwd,stdio:'inherit'});
  if(result.status!==0)throw Error('Cannot retain the published asset history');
 }
 const revisions=execFileSync('git',['rev-list','--max-count='+maxRevisions,ref],{cwd,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 let bundles=0,assetArchives=0;
 for(const revision of revisions){
  let html='';
  try{html=execFileSync('git',['show',revision+':index.html'],{cwd,encoding:'utf8'});}catch{continue}
  // Exported HTML references the entry bundle. Restore it from the revision
  // that published that HTML so cached pages keep loading after an update.
  const pattern=/(?:src|href)\s*=\s*["']\/yalla-nrouh\/(_expo\/static\/(?:js|css)\/[^"'?#\s<>]+)["']/g;
  for(const match of html.matchAll(pattern)){
   const path=match[1];
   if(!/^[A-Za-z0-9._/-]+$/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..'))continue;
   const target=resolve(output,path);
   if(existsSync(target))continue;
   let content;
   try{content=execFileSync('git',['show',revision+':'+path],{cwd,maxBuffer:8*1024*1024});}catch{continue}
   mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);bundles++;
  }
  // Historical entry bundles may need their versioned fonts and images.
  let archive;
  try{archive=execFileSync('git',['archive',revision,'assets'],{cwd,stdio:['ignore','pipe','ignore'],maxBuffer:16*1024*1024});}catch{continue}
  const result=spawnSync('tar',['-x','--skip-old-files','-C',output],{input:archive});
  if(result.status!==0)throw Error('Cannot restore published assets');
  assetArchives++;
 }
 return {versions:revisions.length,bundles,assetArchives};
}
module.exports={retainWebAssets};
if(require.main===module)console.log('Retained recent website assets:',retainWebAssets());
