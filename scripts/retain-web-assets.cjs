const {execFileSync,spawnSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {resolve}=require('node:path');
function retainWebAssets({cwd=process.cwd(),directory='dist-pages',ref='FETCH_HEAD',fetch=true}={}){
 const output=resolve(cwd,directory);mkdirSync(output,{recursive:true});
 if(fetch){const result=spawnSync('git',['fetch','--no-tags','--depth=6','origin','gh-pages'],{cwd,stdio:'inherit'});if(result.status!==0)throw Error('Cannot retain the published asset history')}
 const revisions=execFileSync('git',['rev-list','--max-count=6',ref],{cwd,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 let restored=0;
 for(const revision of revisions)for(const path of ['_expo','assets']){
  let archive;try{archive=execFileSync('git',['archive',revision,path],{cwd,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024})}catch{continue}
  const result=spawnSync('tar',['-x','--skip-old-files','-C',output],{input:archive});if(result.status!==0)throw Error('Cannot restore published assets');restored++;
 }
 return restored;
}
module.exports={retainWebAssets};
if(require.main===module)console.log('Retained asset archives:',retainWebAssets());
