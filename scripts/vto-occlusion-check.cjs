// Local reference only. Media stays in the browser; no real camera or Shopify writes.
// Optional: node scripts/vto-occlusion-check.cjs <photo> --crop x,y,width,height
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../artifacts/try-on');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|ERROR: 0:/.test(m.text()))errors.push(m.text());});
    page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
    await page.goto('http://127.0.0.1:4173/?model=secrets');
    await page.evaluate(async()=>{
      const {GarmentRenderer}=await import('@incorrect/vto-renderer'),original=GarmentRenderer.prototype.fit;
      GarmentRenderer.prototype.fit=function(...args){window.occlusionRenderer=this;window.occlusionArgs=args;return original.apply(this,args);};
    });
    await page.locator('[data-vto-open]').click();
    const file=process.argv[2]&&!process.argv[2].startsWith('--')?path.resolve(process.argv[2]):path.join(out,'male_full_height_hands.jpg');
    let bytes=fs.readFileSync(file);
    const cropAt=process.argv.indexOf('--crop');
    if(cropAt!==-1){
      const crop=process.argv[cropAt+1].split(',').map(Number);
      assert.ok(crop.length===4&&crop.every(Number.isFinite)&&crop[2]>0&&crop[3]>0);
      const base64=await page.evaluate(async({base64,crop})=>{
        const img=new Image();img.src='data:image/jpeg;base64,'+base64;await img.decode();
        const c=document.createElement('canvas');c.width=crop[2];c.height=crop[3];
        c.getContext('2d').drawImage(img,...crop,0,0,c.width,c.height);
        return c.toDataURL('image/png').split(',')[1];
      },{base64:bytes.toString('base64'),crop});
      bytes=Buffer.from(base64,'base64');
    }
    await page.locator('[data-vto-file]').setInputFiles({name:cropAt!==-1?'reference.png':path.basename(file),mimeType:cropAt!==-1||file.endsWith('.png')?'image/png':'image/jpeg',buffer:bytes});
    await page.waitForFunction(()=>document.querySelector('[data-vto-dialog]').dataset.state==='tracking',null,{timeout:90000});
    const stem=cropAt!==-1?'occlusion-user-reference':'occlusion-public-reference';
    await page.screenshot({path:path.join(out,stem+'.png')});
    const report=await page.evaluate(()=>{
      const r=window.occlusionRenderer,[data,rect,options]=window.occlusionArgs;
      const foreground=document.querySelector('[data-vto-foreground]');
      const pixels=foreground.getContext('2d').getImageData(0,0,foreground.width,foreground.height).data;
      let foregroundPixels=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>180)foregroundPixels++;
      const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
      const read=()=>{r.render();const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      const baseline=read();let changedAlpha=0;
      // Same shoulders and elbows: only forearms, hands and fingers sweep the
      // chest. They cannot subtract pixels from the underlying shirt surface.
      for(let step=0;step<6;step++){
        const moved={...data,landmarks:data.landmarks.map(p=>({...p})),world:data.world?.map(p=>({...p}))};
        for(const i of [15,16,17,18,19,20,21,22]){
          moved.landmarks[i].x=.3+step*.07;moved.landmarks[i].y=.38+(i%2)*.06;
          if(moved.world?.[i])moved.world[i].z=-.4-step*.03;
        }
        r.fit(moved,rect,{...options,still:true});const current=read();
        for(let i=3;i<baseline.length;i+=4)if(baseline[i]!==current[i])changedAlpha++;
      }
      r.fit(data,rect,options);
      return {foregroundPixels,changedAlpha,sweeps:6,hasDepthProxies:r.occluders.length+r.hands.length};
    });
    assert.equal(report.hasDepthProxies,0);assert.equal(report.changedAlpha,0,'hands must never cut the garment alpha');
    assert.ok(report.foregroundPixels>100,'observed skin must still be restored above the garment');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    fs.writeFileSync(path.join(out,stem+'.json'),JSON.stringify({...report,errors,writes},null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
