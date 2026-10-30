const results=[];
for(const key of ['led','def','ghi']){
 await page.goto('http://127.0.0.1:1421/#'+key);await page.reload();
 await page.getByRole('button',{name:'ESP32示例',exact:true}).click();
 await page.getByRole('button',{name:'▶ 运行',exact:true}).click();
 await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
 await page.getByRole('button',{name:'更多工具',exact:true}).click();await page.getByRole('button',{name:'ESP32',exact:true}).click();
 await expect(page.getByRole('button',{name:'连接',exact:true})).toBeEnabled();
 await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
 const f=page.frames().find(f=>f.parentFrame());
 if(key==='led'){
   assert.equal(await page.evaluate(()=>window.__serialFixture.calls.filter(x=>x.cmd==='serial_write_line'||x.cmd==='serial_connect').length),0);
   await page.getByRole('button',{name:'连接',exact:true}).click();await f.waitForFunction(()=>studioSerial.connected,{},{timeout:5000});
   await page.frameLocator('iframe').locator('canvas').click({position:{x:200,y:160}});
   await page.waitForFunction(()=>window.__serialFixture.calls.some(x=>x.cmd==='serial_write_line'));
   assert.equal(await f.evaluate(()=>acknowledged),false);
   await page.evaluate(()=>window.__serialFixture.emit(['{"ack":"LED","value":1}']));
   await f.waitForFunction(()=>acknowledged,{},{timeout:5000});
   results.push({key,ackUpdated:true,writes:await page.evaluate(()=>window.__serialFixture.calls.filter(x=>x.cmd==='serial_write_line').map(x=>x.args.text))});
 }else{
   await f.waitForFunction(()=>typeof picture!=='undefined'&&picture?.width>0&&chime?.duration()>0,{},{timeout:8000});
   results.push({key,...await f.evaluate(()=>({pictureWidth:picture.width,duration:chime.duration(),sandbox:window.origin}))});
 }
}
return results;
