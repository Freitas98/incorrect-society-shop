const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const processor=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('assets/vto-pose-processor.js','utf8')).toString('base64'));
test('portrait, odd-width and landscape inference rows stay aligned without exceeding the frame budget',async()=>{
  const {poseInputSize}=await processor;
  for(const [width,height] of [[640,960],[638,1000],[1000,667],[1280,720],[4032,3024]])for(const still of [false,true]){
    const p=poseInputSize(width,height,still);
    assert.equal(p.width%4,0);assert.equal(p.height%4,0);
    assert.ok(Math.max(p.width,p.height)<=(still?1024:384));
    assert.ok(Math.abs(p.width/p.height-width/height)<.01);
  }
  assert.deepEqual(poseInputSize(640,960,false),{width:256,height:384});
  assert.deepEqual(poseInputSize(638,1000,true),{width:640,height:1000});
  assert.deepEqual(poseInputSize(640,360,false),{width:384,height:216});
});
