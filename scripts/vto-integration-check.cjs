// Browser integration tests use public MediaPipe fixtures and a synthetic camera
// stream. They never access a real webcam, customer media, cart or Shopify admin.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const out=path.resolve(__dirname,'../artifacts/try-on');
let activeBrowser,activePage;
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  activeBrowser=browser;
  const page=await browser.newPage({viewport:{width:1100,height:900},acceptDownloads:true});
  activePage=page;
  const errors=[],requests=[],diagnostics=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))diagnostics.push(m.text());});
  global.testDiagnostics=diagnostics;
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  if(process.argv.includes('--no-worker'))await page.addInitScript(()=>{window.OffscreenCanvas=undefined;});
  await page.addInitScript(()=>{
    window.__vtoTest={tracks:[],fits:[],workers:0,terminated:0,inference:[]};
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      constructor(...args){super(...args);window.__vtoTest.workers++;this.addEventListener('message',({data})=>{if(data.kind==='pose'&&data.ms)window.__vtoTest.inference.push(data.ms);});}
      terminate(){window.__vtoTest.terminated++;return super.terminate();}
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      if(window.__denyCamera)throw new DOMException('Denied','NotAllowedError');
      const image=new Image();image.src='/artifacts/try-on/male_full_height_hands.jpg';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=960;
      const ctx=canvas.getContext('2d');let frame=0;
      const draw=()=>{
        frame++;const scale=.80+.045*Math.sin(frame/22),shift=55*Math.sin(frame/18);
        ctx.fillStyle='#abc';ctx.fillRect(0,0,640,960);ctx.save();
        ctx.translate(320+shift,480);ctx.scale(scale,scale);ctx.drawImage(image,-320,-480,640,960);ctx.restore();
      };draw();
      const stream=canvas.captureStream(20),timer=setInterval(draw,50);
      stream.getTracks().forEach(track=>{
        const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};window.__vtoTest.tracks.push(track);
      });
      if(window.__cameraDelay)await new Promise(r=>setTimeout(r,window.__cameraDelay));
      return stream;
    };
  });
  await page.goto('http://127.0.0.1:4173/?model=secrets');
  assert.equal(requests.filter(r=>/\.glb|vto-vision|mediapipe|vto-three/.test(r.url)).length,0,'heavy dependencies must be lazy');
  await page.evaluate(async()=>{
    const {GarmentRenderer}=await import('@incorrect/vto-renderer');const fit=GarmentRenderer.prototype.fit;
    GarmentRenderer.prototype.fit=function(...args){
      const result=fit.apply(this,args);
      if(result)window.__vtoTest.fits.push({shoulders:result.shoulders,scale:result.scale,normal:result.normal,arms:result.arms,at:performance.now(),mirror:args[2].mirror,
        personPixels:args[0].person?.alpha.filter(v=>v>215).length||0,foregroundPixels:args[0].foreground?.alpha.filter(v=>v>180).length||0});
      return result;
    };
  });
  await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();
  await page.waitForFunction(()=>window.__vtoTest.fits.length>=25||document.querySelector('[data-vto-dialog]').dataset.state==='engineError',null,{timeout:60000});
  assert.equal(await page.locator('[data-vto-dialog]').getAttribute('data-state'),'tracking');
  const camera=await page.evaluate(()=>({fits:window.__vtoTest.fits,inference:window.__vtoTest.inference,workers:window.__vtoTest.workers}));
  assert.ok(Math.max(...camera.fits.map(f=>f.shoulders[0]))-Math.min(...camera.fits.map(f=>f.shoulders[0]))>15,'garment must follow source motion');
  assert.ok(camera.fits.every(f=>f.mirror&&f.normal[2]>0),'selfie keeps front orientation');
  assert.ok(camera.fits.some(f=>f.personPixels>100),'the live pose must return current person evidence');
  assert.ok(camera.fits.some(f=>f.foregroundPixels>30),'current person gating must retain observed foreground, not merely hide all hands');
  await page.screenshot({path:path.join(out,'camera-moving.png')});
  // Switch to a photo with a different arm configuration while camera is active.
  await page.locator('[data-vto-file]').setInputFiles(path.join(out,'pose.jpg'));
  await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking'&&window.__vtoTest.fits.at(-1)?.mirror===false,null,{timeout:30000});
  assert.ok(await page.evaluate(()=>window.__vtoTest.tracks.every(t=>t.readyState==='ended')));
  const download=page.waitForEvent('download');await page.locator('[data-vto-save]').click();
  await (await download).saveAs(path.join(out,'saved-composition.jpg'));
  await page.screenshot({path:path.join(out,'camera-to-photo.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-vto-dialog]').evaluate(el=>el.open),false);
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-vto-open')),true);
  assert.equal(await page.evaluate(()=>window.__vtoTest.workers-window.__vtoTest.terminated),0);
  // Open again, then close while getUserMedia is unresolved.
  await page.evaluate(()=>window.__cameraDelay=500);
  await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(()=>window.__vtoTest.tracks.every(t=>t.readyState==='ended')),'late permission result must stop its tracks');
  // Permission rejection remains recoverable through photo upload.
  await page.evaluate(()=>{window.__cameraDelay=0;window.__denyCamera=true;});
  await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();
  await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='cameraDenied');
  await page.locator('[data-vto-file]').setInputFiles(path.join(out,'pose.jpg'));
  await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking',null,{timeout:30000});
  await page.keyboard.press('Escape');
  // No-body input must not retain a floating garment from the previous source.
  await page.locator('[data-vto-open]').click();
  const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;return c.toDataURL('image/png').split(',')[1];});
  await page.locator('[data-vto-file]').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')});
  await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='searching',null,{timeout:30000});
  assert.equal(await page.locator('[data-vto-save]').isDisabled(),true);await page.keyboard.press('Escape');
  assert.equal(requests.filter(r=>r.method!=='GET').length,0,'media must not be uploaded');
  assert.ok(requests.filter(r=>/\/vto-[^/]+\.js/.test(r.url)).every(r=>new URL(r.url).searchParams.has('v')),'all dependent assets keep the Shopify cache version');
  assert.deepEqual(errors,[]);
  const report={checks:['lazy loading','moving camera alignment','mirror orientation','camera to photo','stopped tracks','JPEG export','Escape and focus restoration','worker teardown','late permission result','denial recovery','no body state','no media uploads'],frames:camera.fits.length,inferenceMs:camera.inference,errors};
  fs.writeFileSync(path.join(out,process.argv.includes('--no-worker')?'integration-main-thread-report.json':'integration-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{
  console.error(e,global.testDiagnostics);
  if(activePage){
    console.error(await activePage.evaluate(()=>({state:document.querySelector('[data-vto-dialog]')?.dataset.state,status:document.querySelector('[data-vto-status]')?.textContent,frames:window.__vtoTest?.fits.length})));
    await activePage.screenshot({path:path.join(out,'integration-failure.png')});
  }
  await activeBrowser?.close();process.exitCode=1;
});
