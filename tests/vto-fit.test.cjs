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
test('uncalibrated garment scale is invariant to arbitrary monocular world-body metres',async()=>{
  const {solveFit,mediaRect}=await modulePromise,p=pose(),r=mediaRect(1000,1000,600,600);
  const world=p.map(v=>({...v,x:v.x-.5,y:v.y-.5,z:0}));
  const a=solveFit(p,world,r,600,600,{garment:{chest:62}});
  const tiny=world.map(v=>({...v,x:v.x*.6,y:v.y*.6,z:v.z*.6}));
  const b=solveFit(p,tiny,r,600,600,{garment:{chest:62}});
  assert.ok(Math.abs(a.scale-b.scale)<1e-8);
  assert.ok(Math.abs(a.scale-180/.42)<1e-8);
  const measured=solveFit(p,tiny,r,600,600,{garment:{chest:62},bodyShoulder:40});
  assert.equal(measured.scale,450);assert.equal(measured.calibrated,true);
});
test('phone-holding forearm bends cuff material forward but never moves torso vertices',async()=>{
  const {bendSleevePoint}=await modulePromise;
  const bends={'upper_arm.L':{elbow:[0,0,0],direction:[1,0,0],radius:.04,rotation:[0,-Math.SQRT1_2,0,Math.SQRT1_2]}};
  close(bendSleevePoint([.12,0,0],bends,{'upper_arm.L':1}),[0,0,.12]);
  close(bendSleevePoint([-.12,0,0],bends,{'upper_arm.L':1}),[-.12,0,0]);
  close(bendSleevePoint([.12,0,0],bends,{chest:1}),[.12,0,0]);
  close(bendSleevePoint([.12,0,0],{}, {'upper_arm.L':1}),[.12,0,0]);
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
test('sleeve length scales dynamically with lengthScale and size changes',async()=>{
  const {solveFit,mediaRect,transform,REST,sub,length}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  const fitSmall=solveFit(p,null,r,600,600,{lengthScale:0.95});
  const fitLarge=solveFit(p,null,r,600,600,{lengthScale:1.15});
  const mSmall=fitSmall.matrices['upper_arm.L'],mLarge=fitLarge.matrices['upper_arm.L'];
  const lenSmall=length(sub(transform(mSmall,REST.shoulderL.map((v,i)=>v+REST.armL[i])),transform(mSmall,REST.shoulderL)));
  const lenLarge=length(sub(transform(mLarge,REST.shoulderL.map((v,i)=>v+REST.armL[i])),transform(mLarge,REST.shoulderL)));
  assert.ok(lenLarge>lenSmall*1.15,'larger size produces visibly longer sleeves');
  assert.equal(fitSmall.arms[0].radius,fitSmall.scale*0.024);
});
test('Gram-Schmidt orthogonalization eliminates lateral collar shear on skewed/tilted poses',async()=>{
  const {solveFit,mediaRect,dot}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  // Simulate lateral hip displacement (e.g. leaning / photo tilt where hips are shifted)
  p[23].x+=0.15;p[24].x+=0.15;
  const fit=solveFit(p,null,r,600,600);
  const m=fit.matrices.chest;
  const colX=[m[0],m[1],m[2]],colY=[m[4],m[5],m[6]];
  assert.ok(Math.abs(dot(colX,colY))<1e-5,'chest matrix columns must be strictly orthogonal to eliminate collar shear');
});
test('high-angle / superior camera perspectives maintain stabilized torso pitch',async()=>{
  const {solveFit,mediaRect}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  // Simulate high-angle selfie (shoulders close, hips far back in depth)
  const world=p.map(v=>({...v,x:(v.x-.5)*1.3,y:(v.y-.5)*1.3,z:0}));
  world[11].z=-0.30;world[12].z=-0.30; // shoulders close
  world[23].z=0.30;world[24].z=0.30;   // hips far
  const fit=solveFit(p,world,r,600,600);
  assert.ok(Math.abs(fit.normal[1])<=0.12,'pitch is clamped to prevent collar hover/gaping on superior angle');
});
test('torso length stabilization prevents vertical exaggeration into a dress on low hip detection',async()=>{
  const {solveFit,mediaRect,transform,REST,length,sub}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  // Simulate low hip detection (e.g. boxers or low shorts where hips are detected 80% down the screen)
  p[23].y=0.92;p[24].y=0.92;
  const fit=solveFit(p,null,r,600,600);
  assert.ok(fit,'valid fit produced');
  const m=fit.matrices.spine;
  const colY=[m[4],m[5],m[6]];
  const syLen=length(colY);
  const nominalSy=fit.scale;
  assert.ok(syLen<=nominalSy*1.12,'sy is bounded to prevent dress-like vertical stretching');
});
test('collar lift is constrained below chin to prevent collar floating onto beard/chin',async()=>{
  const {solveFit,mediaRect,transform,REST}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  // Place nose close to shoulders (simulating high-angle selfie or chin tucked)
  p[0]={x:0.5,y:0.25,z:0,visibility:1,presence:1};
  p[9]={x:0.48,y:0.27,z:0,visibility:1,presence:1};
  p[10]={x:0.52,y:0.27,z:0,visibility:1,presence:1};
  const fit=solveFit(p,null,r,600,600,{shoulderLift:0.10});
  assert.ok(fit,'valid fit produced');
  // Transformed shoulder anchor must remain below chin level
  const chestPos=transform(fit.matrices.chest,REST.shoulder);
  // Chin is around y=0.27 in image coords -> in screen pixels (600/2 - 0.27*600 = 300 - 162 = 138)
  assert.ok(chestPos[1]<150,'collar is clamped below chin level');
});
test('back-facing person produces true 180° rotation with negative normal.z and positive matrix determinant',async()=>{
  const {solveFit,mediaRect,dot,cross}=await modulePromise,r=mediaRect(1000,1000,600,600);
  const p=pose();
  // Reverse shoulder order to simulate person turned around facing away from camera
  p[11].x=0.35;p[12].x=0.65;
  p[23].x=0.39;p[24].x=0.61;
  p[13].x=0.15;p[14].x=0.85;
  p[15].x=0.05;p[16].x=0.95;
  const fit=solveFit(p,null,r,600,600);
  assert.ok(fit,'valid fit produced');
  assert.ok(fit.normal[2]<-0.90,'normal.z is negative indicating back-facing view');
  const m=fit.matrices.chest;
  const det=dot(m.slice(0,3),cross(m.slice(4,7),m.slice(8,11)));
  assert.ok(det>1000,'chest matrix determinant must be strictly positive (no reflection/culling bug)');
});
