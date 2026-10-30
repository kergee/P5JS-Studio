const previous=page; await usePage(await context.newPage()); await previous.close();
await page.addInitScript(({code,examples}) => {
  if(window!==window.top)return;
  localStorage.setItem('p5js-studio-language', location.hash.includes('en') ? 'en' : 'zh-CN');
  localStorage.setItem('p5js-studio-theme', location.hash.includes('dark') ? 'dark' : 'light');
  const sample=Object.entries(examples).find(([key])=>location.hash.includes(key))?.[1];
  const calls = [], callbacks = new Map(), events = new Map(); let next=0, session=null;
  window.__serialFixture={calls,requestClose() {
    for(const [id,item] of events) if(item.event==='tauri://close-requested')callbacks.get(item.handler)?.({event:item.event,id,payload:null});
  },emit(lines,error=null,connected=true) {
    if(!session) throw Error('no session');
    const payload={owner:session.owner,session:session.id,connected,lines,error};
    for(const [id,item] of events) if(item.event==='p5studio-serial')callbacks.get(item.handler)?.({event:item.event,id,payload});
    if(!connected)session=null;
  }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(event,id){events.delete(id);}};
  window.__TAURI_INTERNALS__={
    metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},
    transformCallback(fn){callbacks.set(++next,fn);return next;}, unregisterCallback(id){callbacks.delete(id);},
    async invoke(cmd,args){
      calls.push({cmd,args});
      if(cmd==='list_directory')return {folders:[],sketches:['ESP32示例']};
      if(cmd==='list_sketch_summaries')return [{path:'ESP32示例',notes:'匿名教学示例',rating:5,favorite:true}];
      if(cmd==='get_sketch_overviews')return {'ESP32示例':{notes:'匿名教学示例',thumbnail:null}};
      if(cmd==='get_folder_notes')return '';
      if(cmd==='get_sketch')return {files:[{name:'sketch.js',code:sample?.code??code}],notes:'匿名教学示例',libraries:[],p5Version:sample?.p5Version??'1.11.13',thumbnail:null};
      if(cmd==='get_sketch_assets')return sample?.assets??{};
      if(cmd==='save_project'||cmd==='save_thumbnail'||cmd==='save_folder_notes')return;
      if(cmd==='list_project_assets')return [];
      if(cmd==='serial_list_ports')return [{name:'MOCK1',label:'MOCK1 — simulated ESP32'}];
      if(cmd==='serial_connect') {if(window.__failConnect)throw 'open_failed: mock port busy'; session={id:String(++next),owner:args.owner,port:args.port,baudRate:args.baudRate}; return session;}
      if(cmd==='serial_disconnect'){if(session?.owner===args.owner)session=null;return;}
      if(cmd==='serial_write_line'){if(window.__failSend)throw 'write_failed: mock unplugged'; if(!session||session.owner!==args.owner||session.id!==args.session)throw 'not_connected'; return;}
      if(cmd==='plugin:event|listen'){const id=++next;events.set(id,args);return id;}
      if(cmd==='plugin:event|unlisten'){events.delete(args.eventId);return;}
      if(cmd.startsWith('plugin:'))return null;
      throw Error('Unhandled '+cmd);
    }
  };
}, {examples: __EXAMPLES_JSON__, code: __SENSOR_CODE_JSON__});
await page.goto('http://127.0.0.1:1421/',{waitUntil:'domcontentloaded'});
return {fixtureReady:true};
