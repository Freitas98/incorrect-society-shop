const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('assets/vto-foreground.js','utf8')).toString('base64'));
const person={width:100,height:100,alpha:new Uint8ClampedArray(10000).fill(255)};
function fixture(){
  const landmarks=Array.from({length:33},()=>({x:.5,y:.1,visibility:0}));
  for(const [i,x,y] of [[11,.7,.3],[12,.3,.3],[13,.7,.5],[15,.5,.45],[19,.45,.43]])landmarks[i]={x,y,visibility:1};
  const pixels=new Uint8ClampedArray(100*100*4),alpha=new Uint8ClampedArray(10000);
  for(let y=40;y<48;y++)for(let x=43;x<53;x++){const i=y*100+x;alpha[i]=255;pixels.set([190,125,100,255],i*4);}
  return {width:100,height:100,landmarks,pixels,alpha,frameTime:1000};
}
test('translated semantic hand follows current pose and current image, not old pixel positions',async()=>{
  const {warpForeground}=await modulePromise,r=fixture(),points=r.landmarks.map(p=>({...p,x:p.x+.1}));
  const pixels=new Uint8ClampedArray(40000);
  for(let y=40;y<48;y++)for(let x=53;x<63;x++)pixels.set([190,125,100,255],(y*100+x)*4);
  const a=warpForeground(r,points,pixels,1100,person);
  assert.ok(a[4458]>200);assert.equal(a[4448],0);
});
test('a new background/clothing appearance cannot be exposed using a previous hand mask',async()=>{
  const {warpForeground}=await modulePromise,r=fixture(),pixels=new Uint8ClampedArray(40000);
  for(let i=0;i<10000;i++)pixels.set([30,40,110,255],i*4);
  assert.ok(warpForeground(r,r.landmarks,pixels,1100,person).every(v=>v===0));
});
test('expired/future semantic frames and missing tracking do not produce floating cutouts',async()=>{
  const {warpForeground}=await modulePromise,r=fixture();
  for(const time of [999,2201])assert.ok(warpForeground(r,r.landmarks,r.pixels,time,person).every(v=>v===0));
  assert.ok(warpForeground(r,null,r.pixels,1100,person).every(v=>v===0));
});
test('current-frame background is rejected even when it has exactly the old hand colour',async()=>{
  const {warpForeground}=await modulePromise,r=fixture();
  const background={...person,alpha:new Uint8ClampedArray(10000)};
  assert.ok(warpForeground(r,r.landmarks,r.pixels,1100,background).every(v=>v===0));
  assert.ok(warpForeground(r,r.landmarks,r.pixels,1100,null).every(v=>v===0));
});
