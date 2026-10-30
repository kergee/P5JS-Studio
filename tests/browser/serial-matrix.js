const matrix=[];
for(const preset of ['zh-light','zh-dark','en-light','en-dark']){
 await page.goto('http://127.0.0.1:1421/#'+preset); await page.reload();
 const en=preset.startsWith('en');
 await page.getByRole('button',{name:'ESP32示例',exact:true}).click();
 await page.getByRole('button',{name:en?'▶ Run':'▶ 运行',exact:true}).click();
 await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
 await page.getByRole('button',{name:en?'More tools':'更多工具',exact:true}).click();
 await page.getByRole('button',{name:'ESP32',exact:true}).click();
 await expect(page.getByRole('button',{name:en?'Connect':'连接',exact:true})).toBeEnabled();
 await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
 for(const [width,height] of [[800,600],[1280,800],[1680,1000]]){
  await page.setViewportSize({width,height});
  const metrics=await page.evaluate(()=>{const s=document.querySelector('[aria-label="ESP32 USB"]'),p=s.parentElement.parentElement,r=p.parentElement;return {overflow:document.documentElement.scrollWidth>innerWidth,panel:p.getBoundingClientRect().height,preview:r.getBoundingClientRect().height,sectionOverflow:s.scrollWidth>s.clientWidth};});
  assert.equal(metrics.overflow,false);assert.equal(metrics.sectionOverflow,false);assert.ok(metrics.panel<=metrics.preview/2+1);
  matrix.push({preset,width,height,...metrics});
 }
 await page.setViewportSize({width:800,height:600});

}
return {matrix};
