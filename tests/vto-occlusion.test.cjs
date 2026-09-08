const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const mod=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('assets/vto-occlusion.js','utf8')).toString('base64'));
const fixture=()=>{
  const width=100,height=100,points=Array.from({length:33},()=>({x:.5,y:.1,visibility:1}));
  points[11]={x:.7,y:.3};points[12]={x:.3,y:.3};
  points[13]={x:.7,y:.5};points[15]={x:.5,y:.45};points[19]={x:.45,y:.43};
  points[14]={x:.3,y:.5};points[16]={x:.1,y:.5};points[20]={x:.08,y:.5};
  return {width,height,points,masks:Array.from({length:6},()=>new Float32Array(width*height))};
};
test('arm/hand landmarks alone NEVER cut fabric or reveal background',async()=>{
  const {foregroundAlpha}=await mod,f=fixture();
  f.masks[0].fill(1);
  assert.equal(foregroundAlpha(f.masks,f.width,f.height,f.points).some(v=>v>0),false);
  f.masks[0].fill(0);f.masks[4].fill(1);
  assert.equal(foregroundAlpha(f.masks,f.width,f.height,f.points).some(v=>v>0),false);
});
test('confident hand pixels are restored without enlarging the observed silhouette',async()=>{
  const {foregroundAlpha}=await mod,f=fixture();
  for(let y=40;y<48;y++)for(let x=43;x<53;x++)f.masks[2][y*100+x]=.99;
  const alpha=foregroundAlpha(f.masks,100,100,f.points);
  assert.ok(alpha[4400+48]>0);
  for(let i=0;i<alpha.length;i++)if(alpha[i])assert.ok(f.masks[2][i]>.9);
  assert.equal(alpha[4000+43],0,'conservative edge does not leak background');
});
test('uncertain classification and missing pose preserve the entire garment',async()=>{
  const {foregroundAlpha}=await mod,f=fixture();f.masks[2].fill(.65);
  assert.equal(foregroundAlpha(f.masks,100,100,f.points).some(v=>v>0),false);
  assert.equal(foregroundAlpha(f.masks,100,100,null).some(v=>v>0),false);
});
