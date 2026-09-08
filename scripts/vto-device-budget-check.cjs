// iPhone-like browser capabilities + public video as a fake camera. No real camera/cart.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:process.argv.includes('--gpu')?['--enable-webgl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[],models=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:/.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{if(/\.task|\.glb/.test(r.url()))models.push(r.url());});
  const source=fs.readFileSync('assets/virtual-try-on.js','utf8');
  await page.route('**/virtual-try-on.js',r=>r.fulfill({contentType:'text/javascript',body:source.replace('window.IncorrectTryOn = { init };','window.IncorrectTryOn = { init }; window.testInstances = instances;')}));
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'hardwareConcurrency',{value:6});
   Object.defineProperty(navigator,'deviceMemory',{value:undefined});
   window.poseFrames=[];window.delegates=[];
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker {constructor(...args){super(...args);this.addEventListener('message',({data})=>{
    if(data.kind==='ready'&&data.delegate)window.delegates.push(data.delegate);
    if(data.kind==='pose')window.poseFrames.push({ms:data.ms,time:performance.now()});
   });}};
   navigator.mediaDevices.getUserMedia=async constraints=>{
    window.cameraConstraints=constraints;
    const video=document.createElement('video');video.src='/artifacts/try-on/pose_world_landmarks.mp4';video.muted=true;video.loop=true;video.playsInline=true;await video.play();
    const stream=video.captureStream();window.testStream=stream;
    for(const track of stream.getTracks()){
     const stop=track.stop.bind(track);track.stop=()=>{video.pause();video.removeAttribute('src');video.load();stop();};
    }
    return stream;
   };
  });
  await page.goto('http://127.0.0.1:4173/?model=sinners');
  await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();
  await page.waitForFunction(()=>poseFrames.length>=35||document.querySelector('[data-vto-dialog]').dataset.state==='engineError',null,{timeout:90000});
  const report=await page.evaluate(()=>{
   const t=[...testInstances.values()][0],gl=t.engine.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {state:t.dialog.dataset.state,lowPower:t.lowPower,dpr:t.engine.renderer.getPixelRatio(),delegate:delegates,
    renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',frameInterval:t.frameInterval,
    frames:poseFrames.length,medianPoseMs:poseFrames.slice(5).map(f=>f.ms).sort((a,b)=>a-b)[15],constraints:cameraConstraints};
  });
  assert.equal(report.state,'tracking');assert.equal(report.lowPower,true);assert.equal(report.dpr,1);
  assert.ok(report.frameInterval>=83);assert.equal(report.constraints.video.width.ideal,640);
  assert.ok(report.constraints.video.frameRate.max<=30);
  assert(models.some(s=>s.includes('pose_landmarker_lite.task')));
  assert(!models.some(s=>s.includes('pose_landmarker_full.task')),'video must not download/run the Full pose model');
  assert(models.filter(s=>s.includes('.glb')).every(s=>s.includes('-lite.glb')));
  await page.screenshot({path:'artifacts/try-on/device-budget-'+(process.argv.includes('--gpu')?'gpu':'cpu')+'.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>testStream.getTracks().every(t=>t.readyState==='ended')),true);
  assert.equal(await page.evaluate(()=>{const t=[...testInstances.values()][0];return !t.worker&&!t.segWorker;}),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...report,models,errors}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
