const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/vto-fit.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function pose(){
  const points=Array.from({length:33},()=>({x:.5,y:.1,z:0,visibility:1,presence:1}));
  for(const [i,x,y] of [[11,.65,.3],[12,.35,.3],[23,.61,.68],[24,.39,.68],[13,.85,.3],[14,.15,.3],[15,.95,.3],[16,.05,.3]])points[i]={x,y,z:0,visibility:1,presence:1};
  return points;
}
const close=(a,b,tolerance=1e-5)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${a} != ${b}`));
test('contain mapping agrees for portrait, landscape and resize',async()=>{
  const {mediaRect,mapLandmark}=await modulePromise;
  close(Object.values(mediaRect(1000,500,400,600)),[0,200,400,200]);
  close(mapLandmark({x:.5,y:.5},mediaRect(1000,500,400,600),400,600),[0,0,0]);
  close(mapLandmark({x:.2,y:.1},mediaRect(500,1000,400,600),400,600,true),[90,240,0]);
});
test('chest anchors both anatomical shoulders and lower torso follows hips',async()=>{
  const {solveFit,mediaRect,transform,REST,mapLandmark}=await modulePromise,p=pose(),r=mediaRect(1000,1000,600,600);
  const fit=solveFit(p,null,r,600,600);assert.ok(fit);
  close(transform(fit.matrices.chest,REST.shoulderL),mapLandmark(p[11],r,600,600));
  close(transform(fit.matrices.chest,REST.shoulderR),mapLandmark(p[12],r,600,600));
  close(transform(fit.matrices.spine,REST.hip),fit.hips);
});
test('arm matrices move whole sleeves through down, T, raised and forward poses',async()=>{
  const {solveFit,mediaRect,transform,REST,sub,unit,dot}=await modulePromise,r=mediaRect(1000,1000,600,600);
  for(const [x,y] of [[.67,.57],[.85,.3],[.70,.08],[.55,.35]]){
    const p=pose();p[13].x=x;p[13].y=y;
    const f=solveFit(p,null,r,600,600),m=f.matrices['upper_arm.L'];
    const origin=transform(m,REST.shoulderL),end=transform(m,REST.shoulderL.map((v,i)=>v+REST.armL[i]));
    const expected=[(x-.65)*600,(.3-y)*600,0];
    assert.ok(dot(unit(sub(end,origin)),unit(expected))>.999);
    close(origin,transform(f.matrices.chest,REST.shoulderL));
  }
  const p=pose(),world=p.map(v=>({...v,x:(v.x-.5)*1.3,y:(v.y-.5)*1.3,z:0}));world[13].z=-.25;
  const f=solveFit(p,world,r,600,600),m=f.matrices['upper_arm.L'];
  assert.ok(transform(m,REST.shoulderL.map((v,i)=>v+REST.armL[i]))[2]>30);
});
test('mirroring swaps limb assignments without reversing front of garment',async()=>{
  const {solveFit,mediaRect,transform,REST}=await modulePromise,p=pose(),r=mediaRect(1000,1000,600,600);
  const f=solveFit(p,null,r,600,600,{mirror:true});assert.ok(f.normal[2]>.99);
  assert.ok(transform(f.matrices.chest,REST.shoulderL)[0]>0);
});
test('arm pointing directly into camera preserves nonzero sleeve cross-section',async()=>{
  const {solveFit,mediaRect,cross,dot}=await modulePromise,p=pose(),r=mediaRect(1000,1000,600,600);
  p[13]={...p[11]};const world=p.map(v=>({...v,x:(v.x-.5)*1.3,y:(v.y-.5)*1.3,z:0}));world[13].z=-.3;
  const fit=solveFit(p,world,r,600,600),m=fit.matrices['upper_arm.L'];
  const determinant=dot(m.slice(0,3),cross(m.slice(4,7),m.slice(8,11)));
  assert.ok(determinant>1000);assert.ok(m.every(Number.isFinite));
});
test('a distant or side-facing valid torso is not rejected by a wide screen-shoulder threshold',async()=>{
  const {solveFit,mediaRect}=await modulePromise,p=pose(),r=mediaRect(640,360,690,765);
  p[11].x=.53;p[12].x=.47;
  assert.ok(solveFit(p,null,r,690,765));
  const world=p.map(v=>({...v,x:(v.x-.5)*2,y:(v.y-.5)*1.3,z:0}));
  p[11].x=p[12].x+.001;world[11].z=-.17;world[12].z=.17;
  assert.ok(solveFit(p,world,r,690,765));
});
test('reject missing hips/elbows/low confidence and degenerate poses',async()=>{
  const {solveFit,mediaRect}=await modulePromise,r=mediaRect(1000,1000,600,600);
  for(const i of [11,12,13,14,23,24]){const p=pose();p[i].visibility=.1;assert.equal(solveFit(p,null,r,600,600),null);}
  const p=pose();p[11].x=p[12].x;assert.equal(solveFit(p,null,r,600,600),null);
});
test('still photos bypass temporal smoothing; new sessions reset history',async()=>{
  const {PoseFilter}=await modulePromise,f=new PoseFilter(),p=pose();f.update(p,1000);
  p[11].x=.75;assert.equal(f.update(p,1050,true)[11].x,.75);
  f.reset();p[11].x=.35;assert.equal(f.update(p,1100)[11].x,.35);
});
