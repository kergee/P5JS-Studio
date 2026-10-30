import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
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
  const fixture = window.__fixture = { projects, calls: [], noteFail: false, noteDelay: 0, closed: false, requestClose() {
    for (const [id, item] of events) if (item.event === 'tauri://close-requested') callbacks.get(item.handler)?.({event:item.event,id,payload:null});
  }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(_event,id) { events.delete(id); } };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: {label:'main'}, currentWebview: {label:'main'} },
    transformCallback(fn) { callbacks.set(++next, fn); return next; }, unregisterCallback(id) {callbacks.delete(id);},
    async invoke(cmd,args={}) {
      fixture.calls.push({cmd,args});
      if(cmd==='list_directory')return {folders:args.path===''?['Class']:[],sketches:args.path==='Class'?['Class/A']:[]};
      if(cmd==='list_sketch_summaries')return Array.from({length:35},(_,i)=>({path:i?'Class/Example'+i:'Class/A',notes:'blue',rating:5,favorite:true}));
      if(cmd==='get_sketch_overviews')return Object.fromEntries(args.names.map(name=>[name,{notes:'blue',thumbnail:null}]));
      if(cmd==='get_folder_notes')return localStorage.getItem('fixture:note:'+args.path)||'';
      if(cmd==='save_folder_notes') {await new Promise(r=>setTimeout(r,fixture.noteDelay));if(fixture.noteFail)throw 'simulated note write failure';localStorage.setItem('fixture:note:'+args.path,args.notes);return;}
      if(cmd==='get_sketch')return structuredClone(projects[args.name]||seed);
      if(cmd==='get_sketch_assets')return {};
      if(cmd==='save_project'){projects[args.project.name]={...structuredClone(args.project),thumbnail:null};localStorage.setItem('fixture:projects',JSON.stringify(projects));return;}
      if(cmd==='save_thumbnail'||cmd==='serial_disconnect')return;
      if(cmd==='list_project_assets')return [];
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
    await matrix.getByPlaceholder(lang==='zh'?'搜索项目名、目录或笔记...':'Search name, folder or notes...').fill('Class/A');
    await matrix.getByRole('button',{name:lang==='zh'?'编辑: A':'Edit: A',exact:true}).click();
    await matrix.locator('.cm-content').waitFor();
    await matrix.getByRole('button',{name:lang==='zh'?'资源':'Resources',exact:true}).click();
    assert.ok(await matrix.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await matrix.getByRole('button',{name:lang==='zh'?'全屏预览':'Fullscreen preview',exact:true}).click();
    assert.ok(await matrix.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await matrix.getByRole('button',{name:lang==='zh'?'退出全屏':'Exit fullscreen',exact:true}).click();
    await matrix.getByRole('combobox',{name:lang==='zh'?'p5.js 版本':'p5.js version',exact:true}).selectOption('2.3.4');
    await matrix.getByRole('button',{name:lang==='zh'?'▶ 运行':'▶ Run',exact:true}).click();
    await matrix.frameLocator('iframe').locator('canvas').waitFor();
    await matrix.getByRole('button',{name:lang==='zh'?'停止':'Stop',exact:true}).click();
    assert.equal(await matrix.locator('iframe').count(),0);
    await matrix.close();
  }
  check('12 headless layouts: two languages, two themes, three sizes; p5.js 2.x run and stop');
  success = true;
} catch(error) {
  console.error((await page.locator('body').innerText()).slice(0,3000));
  throw error;
} finally {
  await mkdir('artifacts/validation/pc-workflow', {recursive:true});
  await writeFile('artifacts/validation/pc-workflow/headless-results.json',JSON.stringify({success,passed:receipts,date:new Date().toISOString()},null,2));
  await browser.close();
}
