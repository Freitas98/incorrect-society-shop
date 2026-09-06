const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/Baptista/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../artifacts/try-on');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/?model='+(process.argv[2]||'secrets'));
    await page.evaluate(async()=>{
      window.videoFits=[];window.videoMisses=0;window.videoMissDetails=[];
      navigator.mediaDevices.getUserMedia=async()=>{
        const video=document.createElement('video');video.src='/artifacts/try-on/pose_world_landmarks.mp4';
        video.muted=true;video.loop=true;video.playsInline=true;await video.play();
        const stream=video.captureStream();window.testSourceVideo=video;
        for(const track of stream.getTracks()){
          const stop=track.stop.bind(track);track.stop=()=>{video.pause();video.removeAttribute('src');video.load();stop();};
        }
        return stream;
      };
      const {GarmentRenderer}=await import('@incorrect/vto-renderer');
      const {Vector3}=await import('@incorrect/vto-three');
      const {transform}=await import('@incorrect/vto-fit');
      const original=GarmentRenderer.prototype.fit;
      GarmentRenderer.prototype.fit=function(...args){
        const fit=original.apply(this,args);if(!fit){
          window.videoMisses++;
          if(window.videoMissDetails.length<120)window.videoMissDetails.push({at:performance.now(),points:args[0].landmarks?[11,12,13,14,23,24].map(i=>({id:i,...args[0].landmarks[i]})):null});
          return fit;
        }
        let actual,expected;
        this.model.traverse(mesh=>{
          if(actual||!mesh.isSkinnedMesh)return;
          const positions=mesh.geometry.attributes.position;
          for(let i=0;i<positions.count;i++)if(positions.getX(i)>.48){
            const rest=[positions.getX(i),positions.getY(i),positions.getZ(i)];
            actual=mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray();
            expected=transform(fit.matrices['upper_arm.L'],rest);break;
          }
        });
        const m=fit.matrices['upper_arm.L'],a=transform(m,[.235,.57,0]),b=transform(m,[.530,.37,0]);
        window.videoFits.push({at:performance.now(),angle:Math.atan2(b[1]-a[1],b[0]-a[0]),skinError:Math.hypot(...actual.map((v,i)=>v-expected[i])),shoulders:fit.shoulders});
        return fit;
      };
    });
    await page.locator('[data-vto-open]').click();await page.locator('[data-vto-camera]').click();
    for(const frame of [20,50,80]){
      await page.waitForFunction(n=>window.videoFits.length>=n,frame,{timeout:60000});
      await page.screenshot({path:path.join(out,(process.argv[2]||'secrets')+'-video-'+frame+'.png')});
    }
    const report=await page.evaluate(()=>({fits:window.videoFits,misses:window.videoMisses,missDetails:window.videoMissDetails}));
    await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
    assert.ok(report.fits.every(f=>f.skinError<.02),'real skinned cuff follows arm deformation matrix');
    const angles=report.fits.map(f=>f.angle),range=Math.max(...angles)-Math.min(...angles);
    assert.ok(range>.5,'real video drives meaningful sleeve articulation');
    assert.ok(report.misses/(report.fits.length+report.misses)<.1,'garment must remain attached across the real movement sequence');
    report.angleRangeRadians=range;report.errors=errors;
    fs.writeFileSync(path.join(out,(process.argv[2]||'secrets')+'-video-report.json'),JSON.stringify(report,null,2));
    console.log({frames:report.fits.length,misses:report.misses,angleRangeRadians:range,maxSkinError:Math.max(...report.fits.map(f=>f.skinError)),errors});
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
