import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {retainWebAssets}=createRequire(import.meta.url)('../scripts/retain-web-assets.cjs');

test('recent cached HTML retains its referenced bundle without retaining unrelated old files or HTML',()=>{
 const root=mkdtempSync(join(tmpdir(),'yalla-assets-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
 const bundle=(name)=>join(root,'_expo','static','js','web',name+'.js');
 const html=(name)=>'<html><script src="/yalla-nrouh/_expo/static/js/web/'+name+'.js"></script></html>';
 try{
  git('init');git('config','user.email','test@example.invalid');git('config','user.name','Test');
  mkdirSync(join(root,'_expo','static','js','web'),{recursive:true});mkdirSync(join(root,'assets'),{recursive:true});
  writeFileSync(bundle('entry-old'),'old client');
  writeFileSync(bundle('unreferenced'),'unneeded client');
  writeFileSync(join(root,'assets','logo.png'),'old logo');
  writeFileSync(join(root,'index.html'),html('entry-old'));
  git('add','.');git('commit','-m','old publication');
  rmSync(bundle('entry-old'));rmSync(bundle('unreferenced'));
  writeFileSync(bundle('entry-new'),'new client');
  writeFileSync(join(root,'assets','logo.png'),'latest logo');
  writeFileSync(join(root,'index.html'),html('entry-new'));
  git('add','-A');git('commit','-m','new publication');
  mkdirSync(join(root,'dist-pages','_expo','static','js','web'),{recursive:true});
  writeFileSync(join(root,'dist-pages','_expo','static','js','web','entry-current.js'),'fresh build');
  writeFileSync(join(root,'dist-pages','index.html'),'latest html');
  const result=retainWebAssets({cwd:root,fetch:false,ref:'HEAD'});
  assert.equal(result.versions,2);
  assert.equal(readFileSync(join(root,'dist-pages','_expo','static','js','web','entry-old.js'),'utf8'),'old client');
  assert.equal(readFileSync(join(root,'dist-pages','_expo','static','js','web','entry-new.js'),'utf8'),'new client');
  assert.equal(readFileSync(join(root,'dist-pages','_expo','static','js','web','entry-current.js'),'utf8'),'fresh build');
  assert.equal(existsSync(join(root,'dist-pages','_expo','static','js','web','unreferenced.js')),false);
  assert.equal(readFileSync(join(root,'dist-pages','assets','logo.png'),'utf8'),'latest logo');
  assert.equal(readFileSync(join(root,'dist-pages','index.html'),'utf8'),'latest html');
 }finally{rmSync(root,{recursive:true,force:true})}
});
