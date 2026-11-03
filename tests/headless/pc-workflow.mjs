import { createRequire } from 'node:module';
import { writeFile, mkdir, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.HEADLESS_CHROMIUM ? { executablePath: process.env.HEADLESS_CHROMIUM } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const receipts = [];
let success = false;
const check = (name) => { receipts.push(name); console.log('PASS', name); };
await context.addInitScript(() => {
  if (window !== window.top) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { parent.__trackStopped = (parent.__trackStopped || 0) + 1; } }] }) } });
    return;
  }
  localStorage.setItem('p5js-studio-language', location.hash.includes('zh') ? 'zh-CN' : 'en');
  localStorage.setItem('p5js-studio-theme', location.hash.includes('dark') ? 'dark' : 'light');
  const seed = { files: [{ name: 'sketch.js', code: 'function setup() { createCanvas(200, 160); }\nfunction draw() { background(20); }' }, { name: 'helper.js', code: '// helper\nvar helper = 1;' }], notes: '', libraries: [], p5Version: '1.11.13', thumbnail: null };
  const projects = JSON.parse(localStorage.getItem('fixture:projects') || 'null') || { 'Class/A': seed };
  const events = new Map(), callbacks = new Map(); let next = 0;
  const fixture = window.__fixture = { projects, calls: [], noteFail: false, noteDelay: 0, holdDirectory: false, pendingDirectories: [], closed: false, requestClose() {
    for (const [id, item] of events) if (item.event === 'tauri://close-requested') callbacks.get(item.handler)?.({event:item.event,id,payload:null});
  }, dropFiles(paths) {
    for (const [id, item] of events) if (item.event === 'tauri://drag-drop') callbacks.get(item.handler)?.({event:item.event,id,payload:{paths,position:{x:20,y:150}}});
  }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(_event,id) { events.delete(id); } };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: {label:'main'}, currentWebview: {label:'main'} },
    transformCallback(fn) { callbacks.set(++next, fn); return next; }, unregisterCallback(id) {callbacks.delete(id);},
    async invoke(cmd,args={}) {
      fixture.calls.push({cmd,args});
      if(cmd==='list_directory') {
        if(fixture.holdDirectory && args.path) await new Promise((resolve,reject)=>fixture.pendingDirectories.push({path:args.path,resolve,reject}));
        return {folders:args.path===''?['Class']:args.path==='Class'?['Nested']:[],sketches:args.path==='Class'?['Class/A']:[]};
      }
      if(cmd==='list_sketch_summaries')return [
        ...Array.from({length:35},(_,i)=>({path:i?'Class/Example'+i:'Class/A',notes:'blue',rating:5,favorite:true})),
        ...Object.keys(projects).filter(path=>path.startsWith('Class/Share-')).map(path=>({path,notes:'',rating:0,favorite:false})),
      ];
      if(cmd==='list_folders')return ['', 'Class'];
      if(cmd==='get_sketch_overviews')return Object.fromEntries(args.names.map(name=>[name,{notes:'blue',thumbnail:null}]));
      if(cmd==='get_folder_notes')return localStorage.getItem('fixture:note:'+args.path)||'';
      if(cmd==='save_folder_notes') {await new Promise(r=>setTimeout(r,fixture.noteDelay));if(fixture.noteFail)throw 'simulated note write failure';localStorage.setItem('fixture:note:'+args.path,args.notes);return;}
      if(cmd==='get_sketch')return structuredClone(projects[args.name]||seed);
      if(cmd==='get_sketch_assets')return fixture.htmlAssets || {};
      if(cmd==='save_project'){projects[args.project.name]={...structuredClone(args.project),thumbnail:null};localStorage.setItem('fixture:projects',JSON.stringify(projects));return;}
      if(cmd==='save_thumbnail'||cmd==='serial_disconnect')return;
      if(cmd==='list_project_assets')return structuredClone(fixture.resourceEntries || []);
      if(cmd==='add_project_assets'){
        if(fixture.holdAssetWrite) await new Promise(resolve=>{fixture.releaseAssetWrite=resolve;});
        const added=args.paths.map(path=>[args.folder,path.split('/').at(-1)].filter(Boolean).join('/'));
        fixture.resourceEntries.push(...added.map(path=>({path,size:1024})));
        return added;
      }
      if(cmd==='remove_project_asset'){
        fixture.resourceEntries=fixture.resourceEntries.filter(entry=>entry.path!==args.path);
        return;
      }
      if(cmd==='plugin:dialog|open' && fixture.resourcePick)return fixture.resourcePick;
      if(cmd==='plugin:dialog|save'||cmd==='plugin:dialog|open')return fixture.htmlPath || null;
      if(cmd==='prepare_html_export'){
        const {files,libraries,p5Version}=projects[args.name];
        return {files,libraries,p5Version,assets:fixture.htmlAssets,payload:'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=='};
      }
      if(cmd==='write_project_html'){fixture.writtenHtml=args;return;}
      if(cmd==='import_project_html'){
        const filename=args.htmlPath.split('/').at(-1).replace(/\.html$/,'');
        const imported=args.targetFolder+'/'+filename;
        projects[imported]={...structuredClone(projects['Class/A']),notes:'',thumbnail:null};
        return imported;
      }
      if(cmd==='import_p5_web_zip'){
        const path=args.targetFolder+'/Share-web';
        projects[path]={...structuredClone(projects['Class/A']),notes:'',thumbnail:null};
        return {path,sourceVersion:'2.2.1',p5Version:'2.3.4'};
      }
      if(cmd==='export_project')return;
      if(cmd==='plugin:event|listen'){events.set(++next,args);return next;}
      if(cmd==='plugin:event|unlisten'){events.delete(args.eventId);return;}
      if(cmd==='plugin:window|destroy'){fixture.closed=true;return;}
      if(cmd.startsWith('plugin:'))return null;
      throw new Error('Unhandled fixture command '+cmd);
    }
  };
});
const gallery = () => page.getByPlaceholder('Search name, folder or notes...');
const openA = async () => { await gallery().fill('Class/A'); await page.getByRole('button',{name:'Edit: A',exact:true}).click(); await page.locator('.cm-content').waitFor(); };
const tab = name => page.getByRole('tab',{name,exact:true});
const code = () => page.locator('.cm-content');
const text = () => code().innerText();
try {
  await page.goto(process.env.PC_WORKFLOW_URL || 'http://127.0.0.1:1424/');
  await page.getByRole('button',{name:/Folder Notes$/}).click();
  const notes = page.getByPlaceholder('Add notes, goals, or reminders for this folder...');
  await notes.fill('latest folder note');
  await page.evaluate(()=>{window.__fixture.noteFail=true;});
  await gallery().fill('Class/A');
  await page.getByRole('button',{name:'Edit: A',exact:true}).click();
  await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
  assert.equal(await code().count(),0);
  await page.evaluate(()=>{window.__fixture.noteFail=false; window.__fixture.noteDelay=80;});
  await page.getByRole('button',{name:'Edit: A',exact:true}).click();
  await code().waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('fixture:note:')),'latest folder note');
  check('folder-note flush before open, failure blocks navigation and retry preserves text');

  const original = await text();
  await code().focus();
  await code().press('Control+End');
  await page.keyboard.insertText('\n// retained cursor');
  await code().press('Control+End');
  const selection = await page.evaluate(()=>window.getSelection()?.anchorOffset);
  await tab('helper.js').click();
  await code().fill('var second = 20;');
  await tab('sketch.js').click();
  assert.equal(await text(),original+'\n// retained cursor');
  await code().focus();
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>window.getSelection()?.anchorOffset),selection);
  await code().press('Control+z');
  assert.equal(await text(),original);
  await tab('helper.js').click();
  assert.equal(await text(),'var second = 20;');
  check('independent file contents, cursor and undo history across tab switches');

  await page.reload();
  await openA();
  await page.getByRole('button',{name:'Restore draft',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__fixture.calls.filter(c=>c.cmd==='save_project').length),0);
  await page.getByRole('button',{name:'Restore draft',exact:true}).click();
  await tab('helper.js').click();
  assert.equal(await text(),'var second = 20;');
  check('reload recovery prompts before replacing code and never writes formal project automatically');
  await code().fill(Array.from({length:250},(_,i)=>'// line '+i).join('\n'));
  await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop=500;});
  await tab('sketch.js').click(); await tab('helper.js').click();
  await page.waitForFunction(()=>document.querySelector('.cm-scroller')?.scrollTop===500);
  check('per-file editor scroll position survives remount');

  await code().fill('function explode() {\n  throw new Error("from helper");\n}');
  await tab('sketch.js').click();
  await code().fill('function setup() { createCanvas(200, 160); }\nfunction draw() { explode(); }');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await page.getByRole('button').filter({hasText:/helper\.js:2/}).first().waitFor();
  await page.getByRole('button').filter({hasText:/helper\.js:2/}).first().click();
  assert.ok((await text()).includes('from helper'));
  check('runtime exception maps to helper.js line 2 and console click switches editor');

  await code().fill('async function explode() {\n  throw new Error("async helper");\n}');
  await tab('sketch.js').click();
  await code().fill('function setup() { createCanvas(200,160); explode(); }');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await page.getByRole('button').filter({hasText:/helper\.js:2/}).first().waitFor();
  check('unhandled async error maps to its original file');
  await tab('helper.js').click();
  await code().fill('function explode( {');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await page.getByRole('button').filter({hasText:/helper\.js:/}).first().waitFor();
  check('combined syntax diagnostics retain file locations');

  await code().fill('// helper');
  await tab('sketch.js').click();
  await code().fill('function setup() { createCanvas(200,160); parent.__audio = new AudioContext(); navigator.mediaDevices.getUserMedia({audio:true}); setInterval(() => parent.__timerTicks=(parent.__timerTicks||0)+1, 10); }\nfunction draw() { parent.__ticks=(parent.__ticks||0)+1; background(frameCount%255); }');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await page.waitForFunction(()=>window.__ticks>3);
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.equal(await page.locator('iframe').count(),0);
  await page.waitForFunction(()=>window.__audio.state === 'closed' && window.__trackStopped > 0);
  const timers = await page.evaluate(()=>window.__timerTicks);
  const ticks=await page.evaluate(()=>window.__ticks); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__timerTicks),timers);
  assert.equal(await page.evaluate(()=>window.__ticks),ticks);
  await page.getByRole('button',{name:'Fullscreen preview',exact:true}).click();
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).waitFor();
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await page.waitForFunction(old=>window.__ticks>old,ticks);
  check('Stop removes animation/timers, closes real Web Audio and mocked media tracks; fullscreen toggles; Run restarts');

  await page.getByRole('button',{name:'← Gallery',exact:true}).click();
  await gallery().waitFor();
  assert.equal(await gallery().inputValue(),'Class/A');
  await gallery().fill('blue');
  await page.getByLabel('Favorites only', {exact:true}).check();
  await page.getByRole('combobox',{name:'Rating (optional)',exact:true}).selectOption('5');
  await page.locator('div.overflow-auto.p-6').evaluate(el=>el.scrollTop=250);
  await page.getByRole('button',{name:'Edit: Example8',exact:true}).click();
  await code().waitFor();
  await page.getByRole('button',{name:'← Gallery',exact:true}).click();
  await gallery().waitFor();
  assert.equal(await gallery().inputValue(),'blue');
  assert.equal(await page.getByLabel('Favorites only',{exact:true}).isChecked(),true);
  assert.equal(await page.getByRole('combobox',{name:'Rating (optional)',exact:true}).inputValue(),'5');
  await page.waitForFunction(()=>document.querySelector('div.overflow-auto.p-6')?.scrollTop===250);
  check('gallery query, favorites, rating, original directory and scroll survive editor roundtrip');

  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByRole('button',{name:/Folder Notes$/}).click();
  await notes.fill('saved at close');
  await page.evaluate(()=>window.__fixture.requestClose());
  await page.waitForFunction(()=>window.__fixture.closed);
  assert.equal(await page.evaluate(()=>localStorage.getItem('fixture:note:')),'saved at close');
  check('window close waits for latest folder note before destroy');

  await openA();
  await code().focus(); await code().press('Control+End'); await page.keyboard.insertText('\n// discard this draft');
  await page.getByRole('button',{name:'← Gallery',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.ok((await text()).includes('discard this draft'));
  await page.getByRole('button',{name:'← Gallery',exact:true}).click();
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await openA();
  assert.equal(await page.getByRole('button',{name:'Restore draft',exact:true}).count(),0);
  assert.ok(!(await text()).includes('discard this draft'));
  check('cancel navigation keeps edits; explicit discard clears the recovery draft');

  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key.startsWith('p5studio-draft')) throw new DOMException('full','QuotaExceededError'); return set.call(this,key,value); }; });
  await code().focus(); await code().press('Control+End'); await page.keyboard.insertText('\n// survives quota error');
  await page.getByRole('alert').filter({hasText:'Draft backup failed'}).waitFor();
  assert.ok((await text()).includes('survives quota error'));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>window.__fixture.projects['Class/A'].files[0].code.includes('survives quota error'));
  check('draft quota failure is visible and formal Save still preserves edits');

  for (const lang of ['en','zh']) for (const theme of ['light','dark']) for (const [width,height] of [[800,600],[1280,800],[1600,1000]]) {
    const matrix=await context.newPage();
    await matrix.setViewportSize({width,height});
    await matrix.goto((process.env.PC_WORKFLOW_URL || 'http://127.0.0.1:1424/')+'#'+lang+'-'+theme);
    await matrix.evaluate(()=>localStorage.removeItem('p5js-studio-editor-preview-split'));
    await matrix.getByPlaceholder(lang==='zh'?'搜索项目名、目录或笔记...':'Search name, folder or notes...').fill('Class/A');
    await matrix.getByRole('button',{name:lang==='zh'?'编辑: A':'Edit: A',exact:true}).click();
    await matrix.locator('.cm-content').waitFor();
    const resourceButton=matrix.getByRole('button',{name:lang==='zh'?'资源':'Resources',exact:true});
    const sidebar=matrix.locator('#project-resources');
    assert.equal(await sidebar.count(),0);
    const before=(await matrix.locator('.cm-editor').boundingBox()).height;
    await resourceButton.click();
    await sidebar.waitFor();
    const sidebarWidth=(await sidebar.boundingBox()).width;
    assert.ok(sidebarWidth>=200 && sidebarWidth<=280);
    assert.equal((await matrix.locator('.cm-editor').boundingBox()).height,before);
    assert.ok(await matrix.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const divider=matrix.getByRole('separator',{name:lang==='zh'?'调整代码区和预览区宽度':'Resize editor and preview'});
    const dividerBox=await divider.boundingBox();
    const startX=dividerBox.x+dividerBox.width/2;
    const startY=dividerBox.y+Math.min(25,dividerBox.height/2);
    await matrix.mouse.move(startX,startY);
    await matrix.mouse.down();
    await matrix.mouse.move(startX+25,startY,{steps:4});
    await matrix.mouse.up();
    assert.ok((await divider.boundingBox()).x>dividerBox.x+10,`Split drag did not move at ${lang}/${theme}/${width}×${height}`);
    await matrix.getByRole('button',{name:lang==='zh'?'全屏预览':'Fullscreen preview',exact:true}).click();
    assert.ok(await matrix.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await matrix.getByRole('button',{name:lang==='zh'?'退出全屏':'Exit fullscreen',exact:true}).click();
    await matrix.getByRole('combobox',{name:lang==='zh'?'p5.js 版本':'p5.js version',exact:true}).selectOption('2.3.4');
    await matrix.getByRole('button',{name:lang==='zh'?'▶ 运行':'▶ Run',exact:true}).click();
    await matrix.frameLocator('iframe').locator('canvas').waitFor();
    const frame=await matrix.locator('iframe').elementHandle();
    await resourceButton.click();
    await sidebar.waitFor({state:'detached'});
    assert.equal(await matrix.locator('iframe').evaluate((node,before)=>node===before,frame),true);
    await matrix.getByRole('button',{name:lang==='zh'?'停止':'Stop',exact:true}).click();
    assert.equal(await matrix.locator('iframe').count(),0);
    await matrix.close();
  }
  check('12 headless layouts: resource sidebar, unchanged editor height, split dragging, fullscreen, p5.js run and stop');

  const resourcePage=await context.newPage();
  await resourcePage.setViewportSize({width:800,height:600});
  await resourcePage.goto(process.env.PC_WORKFLOW_URL || 'http://127.0.0.1:1424/');
  const longPath='assets/'+('long-directory/'.repeat(8))+'detail.png';
  await resourcePage.evaluate(path=>{
    const fixture=window.__fixture;
    fixture.resourceEntries=[
      {path:'bg.png',size:512*1024},
      {path:'character.png',size:191*1024},
      {path:'fg.png',size:86*1024},
      {path,size:1024},
      ...Array.from({length:45},(_,index)=>({path:'assets/image-'+index+'.png',size:1024})),
    ];
    fixture.htmlAssets={
      'lib/a.js':'data:text/javascript;base64,'+btoa('const a = 1;'),
      'lib/b.js':'data:text/javascript;base64,'+btoa('const b = 2;'),
    };
    fixture.projects['Class/A']={
      files:[{name:'sketch.js',code:'function setup(){createCanvas(100,100)} function draw(){parent.__resourceFrames=(parent.__resourceFrames||0)+1;}'},
        {name:'helper.js',code:'// keep this selection\nconst helper = 9;'}],
      notes:'',libraries:['lib/a.js','missing.js'],p5Version:'1.11.13',thumbnail:null,
    };
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{fixture.copiedResource=value;}}});
  },longPath);
  await resourcePage.getByPlaceholder('Search name, folder or notes...').fill('Class/A');
  await resourcePage.getByRole('button',{name:'Edit: A',exact:true}).click();
  const toggleResources=resourcePage.getByRole('button',{name:'Resources',exact:true});
  await toggleResources.click();
  const resources=resourcePage.locator('#project-resources');
  const filesTab=resources.getByRole('tab',{name:/^Files/});
  const depsTab=resources.getByRole('tab',{name:/^Dependencies/});
  const body=resources.getByRole('tabpanel');
  await resources.getByText('character.png',{exact:true}).waitFor();
  assert.equal(await filesTab.getAttribute('aria-selected'),'true');
  assert.equal(await depsTab.locator('[aria-label="Unavailable dependencies: 1"]').count(),1);
  await resourcePage.screenshot({path:'artifacts/validation/pc-workflow/resources-sidebar.png'});
  const headerTop=(await resources.locator('header').boundingBox()).y;
  assert.ok(await body.evaluate(node=>node.scrollHeight>node.clientHeight && node.scrollWidth<=node.clientWidth));
  await body.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  assert.equal((await resources.locator('header').boundingBox()).y,headerTop);
  assert.equal(await resourcePage.evaluate(()=>window.scrollY),0);
  await body.evaluate(node=>{node.scrollTop=0;});
  await resources.getByRole('button',{name:'File actions: '+longPath,exact:true}).click();
  await resources.locator('code').filter({hasText:longPath}).waitFor();
  await resources.getByRole('button',{name:'Copy path',exact:true}).click();
  assert.equal(await resourcePage.evaluate(()=>window.__fixture.copiedResource),longPath);
  const remove=resources.getByRole('button',{name:'Remove',exact:true});
  resourcePage.once('dialog',dialog=>dialog.dismiss());
  await remove.click();
  assert.equal(await resourcePage.evaluate(()=>window.__fixture.calls.filter(call=>call.cmd==='remove_project_asset').length),0);
  resourcePage.once('dialog',dialog=>dialog.accept());
  await remove.click();
  await resources.getByText('detail.png',{exact:true}).waitFor({state:'detached'});
  check('Resource sidebar scroll, full paths, copy and confirmed removal');

  await resourcePage.evaluate(()=>{window.__fixture.resourcePick=['C:/fixtures/new.png'];window.__fixture.holdAssetWrite=true;});
  await resources.getByRole('button',{name:'Add files',exact:true}).click();
  await resourcePage.waitForFunction(()=>window.__fixture.releaseAssetWrite);
  assert.equal(await toggleResources.isDisabled(),true);
  assert.equal(await resources.getByRole('button',{name:'Close resources'}).isDisabled(),true);
  await resourcePage.evaluate(()=>{window.__fixture.holdAssetWrite=false;window.__fixture.releaseAssetWrite();});
  await resources.getByText('new.png',{exact:true}).waitFor();
  const addArgs=await resourcePage.evaluate(()=>window.__fixture.calls.find(call=>call.cmd==='add_project_assets').args);
  assert.deepEqual(addArgs,{name:'Class/A',paths:['C:/fixtures/new.png'],folder:'assets',overwrite:false});
  await resources.getByText('Add options',{exact:true}).click();
  await resources.getByLabel('Resource subfolder').fill('nested');
  await resourcePage.evaluate(()=>window.__fixture.dropFiles(['C:/fixtures/dropped.png']));
  await resources.getByText('dropped.png',{exact:true}).waitFor();
  assert.equal(await resourcePage.evaluate(()=>window.__fixture.calls.filter(call=>call.cmd==='add_project_assets').at(-1).args.folder),'nested');
  check('Resource sidebar adds and drops files with the selected destination and locks closing during writes');

  await filesTab.focus();
  await filesTab.press('ArrowRight');
  assert.equal(await depsTab.getAttribute('aria-selected'),'true');
  const missing=resources.locator('li').filter({hasText:'missing.js'});
  await missing.getByRole('button',{name:'Remove entry'}).click();
  assert.equal(await depsTab.locator('[aria-label="Unavailable dependencies: 1"]').count(),0);
  await resources.getByRole('combobox',{name:'Choose local JS'}).selectOption('lib/b.js');
  await resources.getByRole('button',{name:'Add dependency'}).click();
  await resources.getByRole('button',{name:'Move up: 2'}).click();
  assert.deepEqual(await resources.locator('ol code').allTextContents(),['1. lib/b.js','2. lib/a.js']);
  await resourcePage.getByRole('tab',{name:'helper.js',exact:true}).click();
  await resourcePage.getByRole('button',{name:'▶ Run',exact:true}).click();
  await resourcePage.waitForFunction(()=>window.__resourceFrames>1);
  await resourcePage.locator('.cm-content').press('Control+End');
  const workspace=await resourcePage.evaluate(()=>{
    const content=document.querySelector('.cm-content');
    const preview=document.querySelector('iframe');
    window.__resourceEditor=content;
    window.__resourcePreview=preview;
    const selection=window.getSelection();
    return {frames:window.__resourceFrames,offset:selection.anchorOffset,text:selection.anchorNode?.textContent};
  });
  await filesTab.click();
  await resources.getByRole('button',{name:'Close resources'}).click();
  assert.equal(await toggleResources.getAttribute('aria-expanded'),'false');
  assert.equal(await resourcePage.getByRole('tab',{name:'helper.js',exact:true}).getAttribute('aria-selected'),'true');
  assert.ok(await resourcePage.evaluate(()=>document.querySelector('.cm-content')===window.__resourceEditor && document.querySelector('iframe')===window.__resourcePreview));
  await resourcePage.locator('.cm-content').focus();
  assert.deepEqual(await resourcePage.evaluate(()=>{
    const selection=window.getSelection();
    return [selection.anchorOffset,selection.anchorNode?.textContent];
  }),[workspace.offset,workspace.text]);
  await resourcePage.waitForFunction(before=>window.__resourceFrames>before,workspace.frames);
  await resourcePage.close();
  check('Resource dependency status and order, keyboard tabs, and editor/preview continuity');

  const navigation = await context.newPage();
  await navigation.goto(process.env.PC_WORKFLOW_URL || 'http://127.0.0.1:1424/');
  const folder = name => navigation.getByRole('button',{name:'Open folder: '+name,exact:true});
  await folder('Class').waitFor();
  await navigation.evaluate(()=>{window.__fixture.holdDirectory=true;});
  await folder('Class').click();
  await navigation.waitForFunction(()=>window.__fixture.pendingDirectories.length===1);
  assert.equal(await folder('Class').count(),0,'old directory cards must disappear while loading');
  assert.equal(await navigation.getByRole('button',{name:'Edit: A',exact:true}).count(),0);
  await navigation.getByRole('status').filter({hasText:'Loading folder'}).waitFor();
  await navigation.getByRole('button',{name:'Home',exact:true}).click();
  await folder('Class').waitFor();
  await navigation.evaluate(()=>window.__fixture.pendingDirectories.shift().reject('late old request failure'));
  // Round-trip through the event loop so a late rejection has time to reach React.
  await navigation.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await navigation.getByRole('alert').count(),0,'old rejected request cannot contaminate the new directory');
  assert.equal(await folder('Class').count(),1);
  check('directory switch hides old cards immediately; returning Home ignores a late failed request');

  await folder('Class').click();
  await navigation.waitForFunction(()=>window.__fixture.pendingDirectories.length===1);
  await navigation.evaluate(()=>window.__fixture.pendingDirectories.shift().reject('simulated missing folder (os error 3)'));
  await navigation.getByRole('alert').filter({hasText:'simulated missing folder'}).waitFor();
  assert.equal(await folder('Class').count(),0,'failed directory cannot leave the previous cards clickable');
  assert.equal(await navigation.getByRole('button',{name:'Edit: A',exact:true}).count(),0);
  await navigation.getByRole('button',{name:'Reload folder',exact:true}).click();
  await navigation.waitForFunction(()=>window.__fixture.pendingDirectories.length===1);
  await navigation.evaluate(()=>window.__fixture.pendingDirectories.shift().resolve());
  await folder('Nested').waitFor();
  assert.equal(await navigation.getByRole('alert').count(),0,'successful retry clears the directory error');
  await navigation.getByRole('button',{name:'Edit: A',exact:true}).waitFor();
  check('failed directory is empty with retry; successful retry restores its own cards and clears the error');

  await folder('Nested').click();
  await navigation.waitForFunction(()=>window.__fixture.pendingDirectories.length===1);
  assert.equal(await navigation.getByRole('button',{name:'Edit: A',exact:true}).count(),0,'previous project cards are hidden too');
  await navigation.getByRole('button',{name:'Home',exact:true}).click();
  await folder('Class').waitFor();
  await navigation.evaluate(()=>window.__fixture.pendingDirectories.shift().resolve());
  await navigation.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await folder('Class').count(),1,'late success cannot replace the current Home listing');
  assert.equal(await folder('Nested').count(),0);
  assert.equal(await navigation.evaluate(()=>window.__fixture.calls.some(call=>call.cmd==='list_directory'&&call.args.path==='Class/Class')),false);

  await folder('Class').click();
  await navigation.waitForFunction(()=>window.__fixture.pendingDirectories.length===1);
  await navigation.evaluate(()=>window.__fixture.pendingDirectories.shift().reject('second missing folder'));
  await navigation.getByRole('alert').waitFor();
  await navigation.getByRole('button',{name:'Home',exact:true}).click();
  await folder('Class').waitFor();
  assert.equal(await navigation.getByRole('alert').count(),0,'opening Home after an error clears the old alert');
  await navigation.close();
  check('late success cannot replace the current folder; opening Home clears an earlier directory error');

  const shareDirectory = await mkdtemp(resolve(tmpdir(),'p5studio-html-'));
  const sharePaths = [];
  const offline = await browser.newContext({offline:true});
  const share = await context.newPage();
  try {
    for (const version of ['1.11.13','2.3.4']) {
      const htmlPath=resolve(shareDirectory,`Share-${version}.html`).replaceAll('\\','/');
      sharePaths.push(htmlPath);
      await share.goto(process.env.PC_WORKFLOW_URL || 'http://127.0.0.1:1424/');
      const original=await share.evaluate(({version,htmlPath})=>{
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=2;
        const pixels=canvas.getContext('2d');
        pixels.fillStyle='#f00000';
        pixels.fillRect(0,0,2,2);
        window.__fixture.htmlPath=htmlPath;
        window.__fixture.htmlAssets={
          'assets/图.png':canvas.toDataURL(),
          'assets/config.json':'data:application/json;base64,'+btoa('{"value":12}'),
          'lib/a.js':'data:text/javascript;base64,'+btoa('const shareA=7;'),
          'lib/b.js':'data:text/javascript;base64,'+btoa('const shareB=shareA+1;'),
        };
        const drawCode=`
          createCanvas(64,48); noLoop(); background(0); image(picture,0,0,32,32);
          if (value.value===12 && shareB===8 && helper===9 && !studioSerial.connected)
            document.body.dataset.shareReady='yes';
        `;
        const code=version.startsWith('1.')
          ? `let picture,value; function preload(){ picture=loadImage('assets/图.png'); value=loadJSON('assets/config.json'); }
            function setup(){${drawCode}}`
          : `async function setup(){ const picture=await loadImage('assets/图.png'); const value=await loadJSON('assets/config.json'); ${drawCode}}`;
        const project={files:[{name:'helper.js',code:'const helper=9; // 中文 </script>'},{name:'sketch.js',code}],
          p5Version:version,libraries:['lib/a.js','lib/b.js'],notes:'private notes',thumbnail:null};
        window.__fixture.projects['Class/A']=project;
        return project;
      }, {version,htmlPath});
      const query=share.getByPlaceholder('Search name, folder or notes...');
      await query.fill('Class/A');
      await share.getByRole('button',{name:'Edit: A',exact:true}).click();
      await share.getByRole('tab',{name:'helper.js',exact:true}).click();
      await share.locator('.cm-content').fill(original.files[0].code+'\n// unsaved share edit');
      await share.getByRole('button',{name:'Export Project',exact:true}).click();
      await share.getByRole('button',{name:'Export HTML',exact:true}).click();
      await share.getByText(`Completed: ${htmlPath}`,{exact:true}).waitFor();
      const written=await share.evaluate(()=>window.__fixture.writtenHtml);
      assert.equal(written.destPath,htmlPath);
      assert.ok(written.page.includes('unsaved%20share%20edit'),'HTML uses the saved current editor contents');
      assert.ok(!written.page.includes('private notes'));
      await writeFile(htmlPath,written.page+'\n<!-- P5JS-STUDIO-PROJECT:1\n'+written.payload+'\n-->\n');

      const standalone=await offline.newPage();
      const remoteRequests=[];
      standalone.on('request',request=>{if (/^https?:/.test(request.url())) remoteRequests.push(request.url());});
      await standalone.goto(pathToFileURL(htmlPath).href);
      const shareFrame=standalone.frameLocator('#p5studio-stage iframe');
      await shareFrame.locator('body[data-share-ready=yes]').waitFor();
      const rendered=await shareFrame.locator('canvas').evaluate(canvas=>({
        width:canvas.width,height:canvas.height,red:canvas.getContext('2d').getImageData(8,8,1,1).data[0],origin:window.origin,
      }));
      assert.deepEqual(rendered,{width:64,height:48,red:240,origin:'null'});
      assert.deepEqual(remoteRequests,[]);
      await standalone.close();
      check(`HTML export opens offline via file URL with p5.js ${version}, ordered scripts, image, JSON and isolated canvas`);

      await share.getByRole('button',{name:'← Gallery',exact:true}).click();
      await share.getByRole('button',{name:'↑ Import Project',exact:true}).click();
      const dialog=share.getByRole('dialog',{name:'Import student projects'});
      await dialog.getByLabel('Project format').selectOption('html');
      await dialog.getByLabel('Target folder').selectOption('Class');
      await dialog.getByRole('button',{name:'Choose a Studio HTML file'}).click();
      await dialog.getByRole('button',{name:'Import',exact:true}).click();
      await dialog.getByText(`Imported: Class/Share-${version}`,{exact:true}).waitFor();
      const importArgs=await share.evaluate(()=>window.__fixture.calls.find(call=>call.cmd==='import_project_html').args);
      assert.deepEqual(importArgs,{htmlPath,targetFolder:'Class'});
      await dialog.getByRole('button',{name:'Close',exact:true}).click();
      await query.fill(`Share-${version}`);
      await share.getByRole('button',{name:`Edit: Share-${version}`,exact:true}).click();
      await share.getByRole('tab',{name:'helper.js',exact:true}).click();
      assert.ok((await share.locator('.cm-content').innerText()).includes('unsaved share edit'));
      assert.equal(await share.getByRole('combobox',{name:'p5.js version',exact:true}).inputValue(),version);
      await share.getByRole('button',{name:'▶ Run',exact:true}).click();
      await share.frameLocator('iframe').locator('body[data-share-ready=yes]').waitFor();
    }
    check('HTML import uses selected category and opens editable multi-file sketches; imported previews run on both p5.js versions');
    await share.getByRole('button',{name:'Export Project',exact:true}).click();
    await share.getByRole('button',{name:'Export Project ZIP',exact:true}).click();
    await share.waitForFunction(()=>window.__fixture.calls.some(call=>call.cmd==='export_project'));
    check('Project ZIP remains available through the export dialog');

    await share.getByRole('button',{name:'← Gallery',exact:true}).click();
    await share.evaluate(()=>{window.__fixture.htmlPath='C:/fixtures/Share-web.zip';});
    await share.getByRole('button',{name:'↑ Import Project',exact:true}).click();
    const webDialog=share.getByRole('dialog',{name:'Import student projects'});
    await webDialog.getByLabel('Project format').selectOption('web-zip');
    await webDialog.getByLabel('Target folder').selectOption('Class');
    await webDialog.getByRole('button',{name:'Choose p5.js web ZIP files'}).click();
    await webDialog.getByRole('button',{name:'Import',exact:true}).click();
    await webDialog.getByText('Imported: Class/Share-web (p5.js 2.2.1 → 2.3.4)',{exact:true}).waitFor();
    const webImport=await share.evaluate(()=>window.__fixture.calls.find(call=>call.cmd==='import_p5_web_zip').args);
    assert.deepEqual(webImport,{zipPath:'C:/fixtures/Share-web.zip',targetFolder:'Class'});
    await webDialog.getByRole('button',{name:'Close',exact:true}).click();
    await share.getByPlaceholder('Search name, folder or notes...').fill('Share-web');
    await share.getByRole('button',{name:'Edit: Share-web',exact:true}).click();
    await share.getByRole('tab',{name:'helper.js',exact:true}).waitFor();
    await share.getByRole('button',{name:'▶ Run',exact:true}).click();
    await share.frameLocator('iframe').locator('body[data-share-ready=yes]').waitFor();
    check('p5.js Web ZIP uses its own import command and opens as an editable sketch');
  } finally {
    await share.close();
    await offline.close();
    for (const path of sharePaths) {
      await unlink(path).catch(error=>{ if (error.code!=='ENOENT') throw error; });
    }
    await rmdir(shareDirectory);
  }
  success = true;
} catch(error) {
  console.error((await page.locator('body').innerText()).slice(0,3000));
  throw error;
} finally {
  await mkdir('artifacts/validation/pc-workflow', {recursive:true});
  await writeFile('artifacts/validation/pc-workflow/headless-results.json',JSON.stringify({success,passed:receipts,date:new Date().toISOString()},null,2));
  await browser.close();
}
