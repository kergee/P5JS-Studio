import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const load = async file => {
 const source=await readFile(new URL('../src/lib/'+file+'.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2021}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
};
const {createPendingNotes}=await load('pendingNotes');
const {parseDraft,draftKey}=await load('editorDraft');
const {combineSources,locateSource,runtimeLocation}=await load('sourceLocations');
test('notes flush bypasses debounce and retains latest value after failed write',async()=>{
 const writes=[];let fail=true;
 const writer=createPendingNotes(async(path,value)=>{if(fail)throw Error('disk full');writes.push([path,value]);},()=>{},60000);
 writer.schedule('A','first');writer.schedule('A','last');
 await assert.rejects(writer.flush(),/disk full/);assert.deepEqual(writes,[]);
 fail=false;await writer.flush();assert.deepEqual(writes,[['A','last']]);writer.dispose();
});
test('notes serialize in-flight writes and flush edits arriving during save',async()=>{
 const writes=[];let release;
 const first=new Promise(resolve=>{release=resolve;});
 const writer=createPendingNotes(async(path,value)=>{writes.push([path,value]);if(value==='first')await first;},()=>{},60000);
 writer.schedule('A','first');const flush=writer.flush();writer.schedule('A','newest');release();await flush;
 assert.deepEqual(writes,[['A','first'],['A','newest']]);writer.dispose();
});
test('drafts retain formal baseline and reject broken or incompatible recovery files',()=>{
 const content={name:'A',files:[{name:'sketch.js',code:'new code'}],notes:'feedback',libraries:['lib.js'],p5Version:'2.3.4'};
 const draft={schema:1,base:'original snapshot',updatedAt:10,content};
 assert.deepEqual(parseDraft(JSON.stringify(draft)),draft);
 assert.notEqual(draftKey(null),draftKey('new'));assert.notEqual(draftKey('A'),draftKey('B'));
 for(const invalid of ['{', '{}',JSON.stringify({...draft,schema:2}),JSON.stringify({...draft,content:{...content,files:[]}})]) assert.throws(()=>parseDraft(invalid));
});
test('combined source locations account for blank lines, trailing newline and Unicode',()=>{
 const files=[{name:'一.js',code:'// 开始\n'},{name:'b.js',code:'\nthrow Error();'}];
 assert.equal(combineSources(files),'// 开始\n\n\nthrow Error();');
 assert.deepEqual(locateSource(files,4,3),{file:'b.js',line:2,column:3});
 assert.deepEqual(runtimeLocation(files,undefined,undefined,undefined,'Error\n at f (studio-sketch.js:4:3)'),{file:'b.js',line:2,column:3});
 assert.deepEqual(runtimeLocation(files,'library.js',4,3,'library.js:4:3'),{});
 assert.deepEqual(locateSource(files,100),{});
});
