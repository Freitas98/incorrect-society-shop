const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const skin=import(url(fs.readFileSync('assets/vto-skinning.js','utf8')));
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6));
test('rigid bone quaternion path matches its affine matrix, including uniform scale and translation',async()=>{
  const {skinTransforms,skinPoint}=await skin;
  const matrices={arm:[0,2,0,0,-2,0,0,0,0,0,2,0,10,20,30,1]};
  close(skinPoint(skinTransforms(matrices),{arm:1},[1,2,3]),[6,22,36]);
});
test('opposite bone rotations preserve cross-sectional volume at a blended shoulder',async()=>{
  const {skinTransforms,skinPoint}=await skin;
  const matrices={a:[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1],b:[0,-1,0,0,1,0,0,0,0,0,1,0,0,0,0,1]};
  const p=skinPoint(skinTransforms(matrices),{a:.5,b:.5},[1,0,0]);
  assert.ok(Math.abs(Math.hypot(...p)-1)<1e-6,'matrix blending would collapse this radius to zero');
});
