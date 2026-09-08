const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=n=>fs.readFileSync('assets/'+n+'.js','utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const fitUrl=url(source('vto-fit')),clothPromise=import(url(source('vto-cloth').replace('@incorrect/vto-fit',fitUrl).replace('@incorrect/vto-skinning',url(source('vto-skinning')))));
const fitPromise=import(fitUrl);
function cage(){
  const b=fs.readFileSync('assets/vto-secrets.glb'),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  return JSON.parse(j.nodes.find(n=>n.extras?.vto_cloth_cage).extras.vto_cloth_cage);
}
function points(){
  const p=Array.from({length:33},()=>({x:.5,y:.1,z:0,visibility:1}));
  for(const [i,x,y] of [[11,.65,.3],[12,.35,.3],[23,.61,.68],[24,.39,.68],[13,.8,.4],[14,.2,.4],[15,.9,.4],[16,.1,.4]])p[i]={x,y,z:0,visibility:1};
  return p;
}
test('Blender exported a connected bounded surface cage, not just extra render polygons',()=>{
  const c=cage();assert.ok(c.nodes.length>500&&c.nodes.length<1200);
  assert.ok(c.edges.length>c.nodes.length*2);
  for(const n of c.nodes){assert.ok(n.p.every(Number.isFinite));assert.ok(Math.abs(Object.values(n.w).reduce((a,b)=>a+b,0)-1)<.0001);}
});
test('calibrated metres are independent of garment choice and tracked hip height',async()=>{
  const {solveFit,mediaRect}=await fitPromise,p=points(),r=mediaRect(1000,1000,600,600);
  const opts={garment:{chest:62},bodyShoulder:40};
  const a=solveFit(p,null,r,600,600,opts);
  assert.equal(a.scale,450);assert.equal(a.calibrated,true);
  p[23].y=p[24].y=.95;
  const b=solveFit(p,null,r,600,600,{...opts,garment:{chest:66}});
  assert.equal(b.scale,a.scale);
  assert.equal(Math.hypot(...a.matrices.chest.slice(4,7)),Math.hypot(...b.matrices.chest.slice(4,7)));
});
test('graded hem and sleeve dimensions change, neckline remains stable',async()=>{
  const {gradePoint}=await clothPromise;
  const r={chest:66/62,length:70/66,sleeve:26/24,shoulder:69/65,opening:23/21};
  assert.ok(Math.abs(gradePoint(.2,0,.08,r)[1]+.04)<1e-8);
  assert.deepEqual(gradePoint(.05,.6,.06,r),[.05,.6,.06]);
});
test('physical sleeve rotations pivot at measured shoulder joints without crushing the source armhole',async()=>{
  const {solveFit,mediaRect,REST,transform}=await fitPromise,p=points(),r=mediaRect(1000,1000,600,600);
  // Align arms with the source rest directions. Every panel must then map by
  // the same chest transform, even for a person narrower than the source rig.
  for(const [s,e,side] of [[11,13,'L'],[12,14,'R']]){
    p[e]={...p[e],x:p[s].x+REST['arm'+side][0],y:p[s].y-REST['arm'+side][1]};
  }
  const f=solveFit(p,null,r,600,600,{garment:{chest:62},bodyShoulder:35,shoulderLift:.022});
  for(const side of ['L','R']){
    const point=[side==='L'?.32:-.32,.50,.06];
    const chest=transform(f.matrices.chest,point),arm=transform(f.matrices['upper_arm.'+side],point);
    chest.forEach((v,i)=>assert.ok(Math.abs(v-arm[i])<1e-6));
  }
});
test('physical hip tilt keeps all bone bases orthonormal for volume-preserving skinning',async()=>{
  const {solveFit,mediaRect,dot,length}=await fitPromise,p=points();
  p[23].y=.61;p[24].y=.72;
  const f=solveFit(p,null,mediaRect(1000,1000,600,600),600,600,{garment:{chest:62},bodyShoulder:42});
  for(const m of Object.values(f.matrices)){
    const axes=[m.slice(0,3),m.slice(4,7),m.slice(8,11)];
    axes.forEach(a=>assert.ok(Math.abs(length(a)-f.scale)<1e-6));
    for(const [a,b] of [[0,1],[0,2],[1,2]])assert.ok(Math.abs(dot(axes[a],axes[b]))<1e-6);
  }
});
test('cloth remains finite, pinned and bounded through abrupt poses and low quality; photo settling is deterministic',async()=>{
  const {ClothCage}=await clothPromise,{solveFit,mediaRect}=await fitPromise;
  const p=points(),r=mediaRect(1000,1000,600,600),fit=()=>solveFit(p,null,r,600,600,{garment:{chest:62},bodyShoulder:42});
  const ratios={chest:1,length:1,sleeve:1,shoulder:1,opening:1};
  for(const lowPower of [false,true]){
    const sim=new ClothCage(cage(),{lowPower});
    sim.update(fit(),ratios,{still:true,bodyChest:98});const first=sim.offsets.slice();
    sim.update(fit(),ratios,{still:true,bodyChest:98});assert.deepEqual(sim.offsets,first);
    for(let k=0;k<12;k++){
      p[13].y=.3+Math.sin(k)*.2;sim.update(fit(),ratios,{time:1000+k*50});
      assert.ok(sim.offsets.every(Number.isFinite));assert.ok(sim.maxDisplacement<=.040001);
      sim.pins.forEach((pin,i)=>{if(pin)assert.equal(Math.hypot(...sim.offsets.subarray(i*4,i*4+3)),0);});
    }
    const weights=sim.weights([.25,.4,.1]);assert.ok(Math.abs(weights.weights.reduce((a,b)=>a+b,0)-1)<1e-6);
    sim.reset();assert.ok(sim.offsets.every(v=>v===0));
  }
});
