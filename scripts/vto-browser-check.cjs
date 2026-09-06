const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/try-on');
(async()=>{
  const browser=await (process.argv.includes('--webkit')?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}));
  const page=await browser.newPage({viewport:process.argv.includes('--mobile')?{width:390,height:844}:{width:1100,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await page.addInitScript(()=>{
    window.workerErrors=[];const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      constructor(...args){super(...args);this.addEventListener('error',e=>window.workerErrors.push(e.message));this.addEventListener('message',e=>{if(e.data.kind==='error')window.workerErrors.push(e.data.message);});}
    };
  });
  await page.goto('http://127.0.0.1:4173/?model='+ (process.argv[2]||'secrets'));
  await page.locator('[data-vto-open]').click();
  await page.locator('[data-vto-file]').setInputFiles(path.join(out,process.argv[3]||'pose.jpg'));
  await page.waitForFunction(()=>['tracking','engineError','searching','invalidPhoto'].includes(document.querySelector('[data-vto-dialog]').dataset.state),null,{timeout:90000});
  const state=await page.locator('[data-vto-dialog]').getAttribute('data-state');
  await page.screenshot({path:path.join(out,(process.argv[2]||'secrets')+'-'+(process.argv[3]||'pose.jpg').replace('.jpg','')+(process.argv.includes('--mobile')?'-mobile':'')+(process.argv.includes('--webkit')?'-webkit':'')+'.png')});
  console.log(JSON.stringify({state,errors,workerErrors:await page.evaluate(()=>window.workerErrors),status:await page.locator('[data-vto-status]').textContent()}));
  if(state==='tracking'){
    await page.keyboard.press('Escape');await page.locator('[data-vto-open]').click();
    await page.locator('[data-vto-file]').setInputFiles(path.join(out,process.argv[3]||'pose.jpg'));
    await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking',null,{timeout:90000});
    await page.keyboard.press('Escape');console.log('Reopened and fitted the photo again.');
  }
  await browser.close();
  assert.equal(state,'tracking','the supplied person fixture must be fitted');
})().catch(e=>{console.error(e);process.exitCode=1;});
