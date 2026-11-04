import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {retainWebAssets}=createRequire(import.meta.url)('../scripts/retain-web-assets.cjs');
test('cached HTML can still load its old JS after publishing, without restoring old HTML',()=>{
 const root=mkdtempSync(join(tmpdir(),'yalla-assets-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
 try{
  git('init');git('config','user.email','test@example.invalid');git('config','user.name','Test');
  mkdirSync(join(root,'_expo'),{recursive:true});mkdirSync(join(root,'assets'),{recursive:true});
  writeFileSync(join(root,'_expo','old.js'),'old client');writeFileSync(join(root,'assets','logo.png'),'old logo');writeFileSync(join(root,'index.html'),'old html');git('add','.');git('commit','-m','old publication');
  rmSync(join(root,'_expo','old.js'));writeFileSync(join(root,'_expo','new.js'),'new client');writeFileSync(join(root,'assets','logo.png'),'latest logo');git('add','.');git('commit','-m','new publication');
  mkdirSync(join(root,'dist-pages','_expo'),{recursive:true});writeFileSync(join(root,'dist-pages','_expo','new.js'),'fresh build');writeFileSync(join(root,'dist-pages','index.html'),'latest html');
  retainWebAssets({cwd:root,fetch:false,ref:'HEAD'});
  assert.equal(readFileSync(join(root,'dist-pages','_expo','old.js'),'utf8'),'old client');
  assert.equal(readFileSync(join(root,'dist-pages','_expo','new.js'),'utf8'),'fresh build');
  assert.equal(readFileSync(join(root,'dist-pages','assets','logo.png'),'utf8'),'latest logo');
  assert.equal(readFileSync(join(root,'dist-pages','index.html'),'utf8'),'latest html');
 }finally{rmSync(root,{recursive:true,force:true})}
});
