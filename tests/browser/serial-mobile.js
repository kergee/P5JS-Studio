// User-agent simulation only, not an Android device test.
await page.addInitScript(()=>{if(window===window.top)Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14) Mobile',configurable:true});});
await page.goto('http://127.0.0.1:1421/#mobile'); await page.reload();
await page.getByRole('button',{name:'ESP32示例',exact:true}).click();
await expect(page.getByRole('button',{name:'更多工具',exact:true})).toHaveCount(0);
await page.getByRole('button',{name:'▶ 运行',exact:true}).click();
await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
assert.equal(await page.evaluate(()=>window.__serialFixture.calls.filter(x=>x.cmd.startsWith('serial_')).length),0);
return {mobileHardwareHidden:true,offlineSketchCanvas:true,serialCalls:0};
