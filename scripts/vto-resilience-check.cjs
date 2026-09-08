// All model failures and delayed decoding are local test interception. No camera.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
    let blockSegmentation=true,blockSecrets=false;
    await page.route('**/selfie_multiclass_256x256.tflite',r=>blockSegmentation?r.abort('failed'):r.continue());
    await page.route('**/vto-secrets*.glb*',r=>blockSecrets?r.fulfill({status:503,body:'Test unavailable'}):r.continue());
    const source=fs.readFileSync('assets/virtual-try-on.js','utf8');
    assert.ok(source.includes('window.IncorrectTryOn = { init };'));
    await page.route('**/virtual-try-on.js',r=>r.fulfill({contentType:'text/javascript',body:source.replace('window.IncorrectTryOn = { init };','window.IncorrectTryOn = { init }; window.testInstances = instances;')}));
    await page.addInitScript(()=>{
      const original=createImageBitmap;
      window.createImageBitmap=async(...args)=>{
        const bitmap=await original(...args);
        if(args[0]?.name==='delayed.jpg')await new Promise(resolve=>window.releaseDecode=resolve);
        return bitmap;
      };
      navigator.mediaDevices.getUserMedia=()=>{throw Error('A real camera is forbidden in this test');};
    });
    await page.goto('http://127.0.0.1:4173/?model=sinners&lang=pt');
    const photo=path.resolve('artifacts/try-on/male_full_height_hands.jpg');
    const fitted=()=>page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking',null,{timeout:90000});
    await page.locator('[data-vto-open]').click();await page.locator('[data-vto-file]').setInputFiles(photo);await fitted();
    assert.equal(await page.locator('[data-vto-occlusion-note]').isVisible(),true);
    assert.match(await page.locator('[data-vto-occlusion-note]').textContent(),/mantém-se inteira/);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].engine.model.visible),true);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].segWorker),null);
    blockSegmentation=false;
    await page.locator('[data-vto-file]').setInputFiles(photo);await fitted();
    assert.equal(await page.locator('[data-vto-occlusion-note]').isVisible(),false);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].segReady),true);
    const qualityGeneration=await page.evaluate(()=>[...testInstances.values()][0].generation);
    await page.locator('[data-vto-quality]').selectOption('lite');
    await page.waitForFunction(()=>{const t=[...testInstances.values()][0];return t.loadedModelKey==='sinners'&&t.engine.cloth.lowPower;});
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].generation),qualityGeneration,'quality switch preserves the source session');
    await page.locator('.vto-profile summary').click();
    await page.locator('[data-vto-profile="width"]').fill('62');await page.locator('[data-vto-profile="length"]').fill('66');
    assert.match(await page.locator('[data-vto-fit-advice]').textContent(),/M/);
    await page.locator('[data-vto-profile="width"]').fill('20');
    assert.equal(await page.locator('[data-vto-use-recommendation]').isVisible(),false);
    await page.locator('[data-vto-profile="width"]').fill('62');
    await page.locator('[data-vto-fit-advice]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.resolve('artifacts/try-on/resilience-mobile-pt.png')});
    assert.ok(await page.locator('[data-vto-dialog]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal mobile overflow');
    // A failed replacement may never reveal the previous product on refit.
    blockSecrets=true;await page.locator('[data-item-id="11569665933653"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='engineError');
    await page.locator('[data-variant-id="102"]').click();
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].engine.model.visible),false);
    assert.equal(await page.locator('[data-vto-save]').isDisabled(),true);
    blockSecrets=false;await page.locator('[data-vto-file]').setInputFiles(photo);await fitted();
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].loadedModelKey),'secrets');
    // An older photo finishing decode after close/re-open cannot repaint/restart.
    await page.locator('[data-vto-file]').setInputFiles({name:'delayed.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync('artifacts/try-on/pose.jpg')});
    await page.waitForFunction(()=>typeof window.releaseDecode==='function');
    await page.keyboard.press('Escape');await page.locator('[data-vto-open]').click();
    await page.locator('[data-vto-file]').setInputFiles(photo);await fitted();
    const generation=await page.evaluate(()=>[...testInstances.values()][0].generation);
    await page.evaluate(()=>window.releaseDecode());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].generation),generation);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].loadedModelKey),'sinners');
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].lastResult.bitmap.height),await page.evaluate(async()=>{const i=new Image();i.src='/artifacts/try-on/male_full_height_hands.jpg';await i.decode();return i.naturalHeight;}));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].worker),null);
    assert.equal(await page.evaluate(()=>[...testInstances.values()][0].segWorker),null);
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log(JSON.stringify({checks:['segmentation failure keeps garment','segmentation retry','Portuguese mobile inputs','invalid measurements','failed model cannot show old product','model retry','late photo decode','cleanup','no uploads'],errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
