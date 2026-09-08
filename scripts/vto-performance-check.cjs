// Comparable local benchmark. Software WebGL + optional 4x main-thread throttle
// are stress tests, not measurements of an actual iPhone/Android GPU.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const lite=process.argv.includes('--lite'),page=await browser.newPage({viewport:lite?{width:390,height:844}:{width:1100,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(lite)await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{value:2});Object.defineProperty(navigator,'hardwareConcurrency',{value:2});});
  await page.goto('http://127.0.0.1:4173/?model=sinners');
  const cdp=await page.context().newCDPSession(page);
  if(lite)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.evaluate(async()=>{
    window.stats={frames:[],segmentation:[],ui:[]};let last=performance.now();
    const loop=now=>{window.stats.ui.push(now-last);last=now;requestAnimationFrame(loop)};requestAnimationFrame(loop);
    const WorkerClass=window.Worker;
    window.Worker=class extends WorkerClass{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.kind==='segmentation')window.stats.segmentation.push(data.ms);});}};
    navigator.mediaDevices.getUserMedia=async()=>{
      const video=document.createElement('video');video.src='/artifacts/try-on/pose_world_landmarks.mp4';video.loop=true;video.muted=true;video.playsInline=true;await video.play();
      const stream=video.captureStream();
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{video.pause();video.removeAttribute('src');video.load();stop()};}
      return stream;
    };
    const {GarmentRenderer}=await import('@incorrect/vto-renderer'),fit=GarmentRenderer.prototype.fit;
    GarmentRenderer.prototype.fit=function(...args){
      const start=performance.now(),result=fit.apply(this,args);
      if(result)window.stats.frames.push({at:performance.now(),fitMs:performance.now()-start,clothMs:this.clothMs,age:performance.now()-args[0].frameTime,displacement:this.cloth.maxDisplacement});
      return result;
    };
  });
  await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();
  await page.waitForFunction(()=>window.stats.frames.length>=15,null,{timeout:120000});
  await page.evaluate(()=>{window.stats.frames=[];window.stats.ui=[];window.stats.segmentation=[];});
  await page.waitForTimeout(12000);
  const raw=await page.evaluate(()=>window.stats);
  const percentile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
  const elapsed=(raw.frames.at(-1)?.at-raw.frames[0]?.at)/1000;
  const report={mode:lite?'lite, mobile viewport, 4x CPU throttle':'full, desktop viewport',gpu:'SwiftShader software',
    frames:raw.frames.length,fps:(raw.frames.length-1)/elapsed,medianFitMs:percentile(raw.frames.map(f=>f.fitMs),.5),
    medianClothMs:percentile(raw.frames.map(f=>f.clothMs),.5),p95FrameAgeMs:percentile(raw.frames.map(f=>f.age),.95),
    p95UIFrameMs:percentile(raw.ui,.95),medianSegmentationMs:percentile(raw.segmentation,.5),errors};
  await page.screenshot({path:path.resolve('artifacts/try-on/performance-'+(lite?'lite':'full')+'.png')});
  await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
  assert.ok(report.frames>=15,'real video must continue progressing under stress');
  fs.writeFileSync(path.resolve('artifacts/try-on/performance-'+(lite?'lite':'full')+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
