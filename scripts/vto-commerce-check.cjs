// Tests only a local fixture; all cart mutations are intercepted, never Shopify.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],posts=[],assets=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:/.test(m.text()))errors.push(m.text());});
    page.on('request',r=>{if(r.url().includes('.glb'))assets.push(r.url());});
    if(process.argv.includes('--lite'))await page.addInitScript(()=>{
      Object.defineProperty(navigator,'deviceMemory',{value:2});Object.defineProperty(navigator,'hardwareConcurrency',{value:2});
    });
    let failure=false,refreshFailure=false,unknown=false;
    await page.route('**/cart/add.js',async route=>{
      posts.push(route.request().postDataJSON());
      await new Promise(r=>setTimeout(r,150));
      if(unknown){await route.abort('failed');return;}
      await route.fulfill({status:failure?422:200,contentType:'application/json',body:JSON.stringify(failure?{status:422,description:'Test: size sold out'}:{items:[{id:101,quantity:1}]})});
    });
    await page.route('**/cart.js',route=>route.fulfill({status:refreshFailure?503:200,contentType:'application/json',body:JSON.stringify({item_count:1,items:[{id:101}],total_price:3000})}));
    await page.goto('http://127.0.0.1:4173/?model=secrets');
    await page.evaluate(async()=>{
      const {GarmentRenderer}=await import('@incorrect/vto-renderer'),original=GarmentRenderer.prototype.fit;
      GarmentRenderer.prototype.fit=function(...args){window.testRenderer=this;return original.apply(this,args);};
      window.cartEvents=[];window.addEventListener('cartUpdated',e=>window.cartEvents.push(e.detail));
    });
    await page.locator('[data-vto-open]').click();
    await page.locator('.vto-profile summary').click();
    await page.locator('[data-vto-profile="width"]').fill('62');
    await page.locator('[data-vto-profile="length"]').fill('66');
    assert.match(await page.locator('[data-vto-fit-advice]').textContent(),/Closest match: M/);
    await page.locator('[data-vto-use-recommendation]').click();
    assert.equal(await page.locator('[data-variant-id="102"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-vto-profile="shoulder"]').fill('42');
    await page.locator('[data-vto-file]').setInputFiles(path.resolve('artifacts/try-on/male_full_height_hands.jpg'));
    await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking',null,{timeout:90000});
    assert.equal(await page.evaluate(()=>window.testRenderer.lastFit.calibrated),true);
    assert.equal(await page.evaluate(()=>window.testRenderer.occluders.some(o=>o.visible)||window.testRenderer.hands.some(o=>o.visible)),false);
    const sample=()=>page.evaluate(()=>{
      const r=window.testRenderer;let min=Infinity;r.surfaces.forEach(({mesh})=>{const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)min=Math.min(min,p.getY(i));});
      return {scale:r.lastFit.scale,min,clothMs:r.clothMs,displacement:r.cloth.maxDisplacement};
    });
    await page.locator('[data-variant-id="101"]').click();const small=await sample();
    await page.locator('[data-variant-id="104"]').click();const large=await sample();
    assert.equal(small.scale,large.scale);assert.ok(small.min-large.min>.059&&small.min-large.min<.063);
    assert.equal(await page.locator('[data-vto-add-cart]').isDisabled(),true);
    await page.locator('[data-variant-id="102"]').click();
    await page.screenshot({path:path.resolve('artifacts/try-on/measurements-'+(process.argv.includes('--lite')?'lite':'full')+'.png')});
    await page.locator('[data-vto-add-cart]').click();
    await page.waitForFunction(()=>window.cartEvents.length===1);
    assert.deepEqual(posts[0],{items:[{id:102,quantity:1}]});assert.equal(posts.length,1);
    assert.equal(await page.evaluate(()=>window.cartEvents[0].source),'try-on');
    failure=true;await page.locator('[data-vto-add-cart]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vto-cart-toast]').textContent.includes('Test: size sold out'));
    assert.equal(await page.evaluate(()=>window.cartEvents.length),1);
    failure=false;refreshFailure=true;
    await page.locator('[data-vto-add-cart]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vto-cart-toast]').textContent.includes('before adding again'));
    assert.equal(await page.locator('[data-vto-cart-toast] a').getAttribute('href'),'/cart');
    assert.equal(posts.length,3,'failed refresh must not repeat the confirmed add');
    assert.equal(await page.evaluate(()=>window.cartEvents.length),1,'do not emit a made-up cart');
    unknown=true;
    await page.locator('[data-vto-add-cart]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vto-cart-toast]').textContent.includes('avoid adding twice'));
    assert.equal(posts.length,4,'unknown response must not retry the POST');
    // Rapid product switches must never let a late GLB replace the active one.
    await page.locator('[data-item-id="11569666097493"]').click();
    await page.locator('[data-item-id="11569665933653"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-vto-busy]')||document.querySelector('[data-vto-busy]').hidden);
    const names=await page.evaluate(()=>window.testRenderer.surfaces.map(s=>s.mesh.name).join(' '));
    assert.ok(names.includes('Secrets')&&!names.includes('Sinners'));
    await page.locator('[data-item-id="11569666097493"]').click();
    await page.keyboard.press('Escape');await page.locator('[data-vto-open]').click();
    assert.match(await page.locator('[data-vto-product-name]').textContent(),/Secrets/);
    assert.equal(await page.locator('[data-variant-id="101"]').getAttribute('aria-pressed'),'true');
    if(process.argv.includes('--lite'))assert.ok(assets.every(s=>s.includes('-lite.glb')));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({checks:'measured sizing, fixed body scale, real grading, sold out, exact cart SKU, 422, failed refresh, unknown response, product races, re-open identity',small,large,assets,errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
