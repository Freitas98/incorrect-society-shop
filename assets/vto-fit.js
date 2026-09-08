/** Camera/image coordinates and garment deformation, independent of rendering.
 * Rest anchors are in the generated GLB's metres (+Y up, +Z front).
 * Output matrices map bind-space points into orthographic viewport pixels.
 */
export const REST = Object.freeze({
  shoulderL: [.235, .57, 0], shoulderR: [-.235, .57, 0],
  hip: [0, .08, 0], shoulder: [0, .57, 0],
  armL: [.295, -.20, 0], armR: [-.295, -.20, 0],
});
export const add = (a,b) => a.map((v,i) => v+b[i]);
export const sub = (a,b) => a.map((v,i) => v-b[i]);
export const mul = (a,s) => a.map(v => v*s);
export const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const unit = a => mul(a,1/Math.max(1e-8,length(a)));
export const mix = (a,b,t) => a.map((v,i) => v+(b[i]-v)*t);
export const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
const mid = (a,b) => mul(add(a,b),.5);
const visible = p => p && [p.x,p.y,p.z || 0].every(Number.isFinite) && (p.visibility ?? 1)>=.5 && (p.presence ?? 1)>=.5;

export function mediaRect(sw,sh,vw,vh) {
  const scale=Math.min(vw/sw,vh/sh);
  return {x:(vw-sw*scale)/2,y:(vh-sh*scale)/2,width:sw*scale,height:sh*scale};
}
export function mapLandmark(p,rect,vw,vh,mirror=false) {
  return [rect.x+(mirror?1-p.x:p.x)*rect.width-vw/2, vh/2-rect.y-p.y*rect.height,0];
}
function matrix(x,y,z,rest,target) {
  const offset=sub(target,add(add(mul(x,rest[0]),mul(y,rest[1])),mul(z,rest[2])));
  return [...x,0,...y,0,...z,0,...offset,1];
}
export function transform(m,p) {
  return [0,1,2].map(i => m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
}

export function solveFit(landmarks,world,rect,vw,vh,{mirror=false,ease=1,lengthScale=1,shoulderLift=0,garment=null,bodyShoulder=null}={}) {
  if (![11,12,23,24].every(i=>visible(landmarks?.[i]))) return null;
  // Mirror the person AND swap anatomical assignments. Reflecting X alone
  // reverses the body basis and incorrectly displays the back of the shirt.
  const ids=mirror?{l:12,r:11,el:14,er:13,wl:16,wr:15,hl:24,hr:23}:{l:11,r:12,el:13,er:14,wl:15,wr:16,hl:23,hr:24};
  const screen=i=>mapLandmark(landmarks[i],rect,vw,vh,mirror);
  const shoulderPixels=length(sub(screen(ids.l),screen(ids.r)));
  const wLeft=world?.[ids.l],wRight=world?.[ids.r];
  const worldSpan=wLeft&&wRight?Math.hypot(wLeft.x-wRight.x,wLeft.y-wRight.y):0;
  const torsoPixels=length(sub(mid(screen(ids.l),screen(ids.r)),mid(screen(ids.hl),screen(ids.hr))));
  const wHipL=world?.[ids.hl],wHipR=world?.[ids.hr];
  const worldHeight=wLeft&&wRight&&wHipL&&wHipR?Math.hypot((wLeft.x+wRight.x-wHipL.x-wHipR.x)/2,(wLeft.y+wRight.y-wHipL.y-wHipR.y)/2):0;
  // Combine torso and shoulder projection. Shoulder-only depth calibration
  // becomes unstable as a person turns side-on to the camera.
  const pxPerM=worldHeight>.12?(shoulderPixels*worldSpan+torsoPixels*worldHeight)/(worldSpan*worldSpan+worldHeight*worldHeight):
    worldSpan>.08?shoulderPixels/worldSpan:shoulderPixels/.38;
  const centerZ=wLeft&&wRight?(wLeft.z+wRight.z)/2:0;
  const point=i=>{
    const p=screen(i),w=world?.[i];
    // World depth avoids aspect-ratio errors and permits forward/back arm motion.
    const depthLimit=Math.max(shoulderPixels*2,torsoPixels*1.2);
    p[2]=w?clamp(-(w.z-centerZ)*pxPerM,-depthLimit,depthLimit):0;
    return p;
  };
  const ls=point(ids.l),rs=point(ids.r),lh=point(ids.hl),rh=point(ids.hr);
  const shoulders=mid(ls,rs),hips=mid(lh,rh),up=sub(shoulders,hips);
  if (length(sub(ls,rs))<rect.width*.025 || length(up)<rect.height*.10) return null;
  const sx=mul(sub(ls,rs),1/.47),up_raw=sub(shoulders,hips);
  // Orthogonalize up vector against shoulder axis (sx) to eliminate shear distortion:
  // Non-orthogonal sx/sy causes slanted collars, trapezius hole cutting, and crooked necklines on photos/tilted postures.
  const u_sx=unit(sx);
  const up_ortho=sub(up_raw,mul(u_sx,dot(up_raw,u_sx)));
  const physical=!!garment;
  const measuredShoulder=Number.isFinite(bodyShoulder)&&bodyShoulder>=28&&bodyShoulder<=65 ? bodyShoulder/100 : null;
  const scale=physical ? measuredShoulder ? length(sub(ls,rs))/measuredShoulder : pxPerM : length(sx);
  // Garment torso length stabilization:
  // In the 3D model, the Boxy tee has nominal torso length (shoulder-to-hip) of scale * 0.49.
  // Bounding vertical torso stretch prevents the t-shirt from extending down to mid-thigh like a dress.
  const nominalTorso=scale*.49;
  const boundedTorso=clamp(length(up_raw),nominalTorso*.85,nominalTorso*1.08);
  const sy=mul(unit(up_ortho),physical ? scale : boundedTorso/.49);
  const rawNormal=unit(cross(sx,sy));
  if (length(rawNormal)<.9) return null;
  // Torso pitch stabilization for elevated / superior camera perspective:
  // Clamping vertical pitch prevents camera downward angle from projecting the collar forward into the chin/air.
  // Preserving the sign of Z from cross(sx,sy) ensures 180° back-view has a positive determinant (no inverted geometry/culling).
  const pitch=clamp(rawNormal[1],-.12,.12);
  const nx=rawNormal[0],signZ=rawNormal[2]<0?-1:1,nz=signZ*Math.sqrt(Math.max(.1,1-nx*nx-pitch*pitch));
  const normal=physical ? rawNormal : unit([nx,pitch,nz]);
  const depth=mul(normal,scale*(physical ? 1 : .90));
  // Elevate shoulder anchor along torso axis so collar covers trapezius on athletic builds,
  // while strictly clamping elevation below the chin/jaw to prevent collar hover onto beard/chin.
  let liftAmount=scale*shoulderLift;
  if (visible(landmarks?.[0])) {
    const nose=point(0);
    const mouthL=visible(landmarks?.[9])?point(9):null;
    const mouthR=visible(landmarks?.[10])?point(10):null;
    const chinY=(mouthL&&mouthR)?(mouthL[1]+mouthR[1])/2-scale*.025:nose[1]-scale*.075;
    const maxCollarLift=Math.max(0,chinY-shoulders[1]-scale*.095);
    liftAmount=Math.min(liftAmount,maxCollarLift);
  }
  const liftOffset=mul(unit(up_ortho),liftAmount);
  const chestAnchor=add(shoulders,liftOffset);
  const chest=matrix(physical ? mul(unit(sx),scale) : mul(sx,ease),sy,depth,REST.shoulder,chestAnchor);
  const hipWidth=length(sub(lh,rh));
  // Preserve oversized ease; taper the lower mesh towards the tracked hips.
  const hx=mul(unit(sub(lh,rh)),physical ? scale : clamp(hipWidth/.33,scale*.82,scale*1.22)*ease);
  // A garment has its own length. Moving the detected hips cannot stretch it.
  // Lateral hip motion still bends the lower panel, with a bounded waist shear.
  const lateral=sub(up_raw,up_ortho);
  const lowerTarget=physical ? sub(sub(chestAnchor,mul(unit(up_ortho),scale*.49)),mul(lateral,.35)) : sub(chestAnchor,mul(up_ortho,lengthScale));
  const hipUp=physical ? mul(unit(sub(unit(sy),mul(unit(hx),dot(unit(sy),unit(hx))))),scale) : mul(sy,lengthScale);
  const hipDepth=physical ? mul(unit(cross(hx,hipUp)),scale) : depth;
  const spine=matrix(hx,hipUp,hipDepth,REST.hip,lowerTarget);
  const matrices={root:spine,spine,chest,neck:chest};
  const arms=[];
  for(const side of ['L','R']) {
    const left=side==='L',s=left?ls:rs,ei=left?ids.el:ids.er,wi=left?ids.wl:ids.wr;
    if(!visible(landmarks[ei])) return null; // Don't invent a sleeve pose.
    const e=point(ei),dir=sub(e,s),rest=REST['arm'+side],ru=unit(rest);
    if(length(dir)<scale*.06)return null;
    const u=unit(dir),sideways=cross(normal,u);
    // A forearm pointing directly into the camera must retain sleeve volume.
    const v=unit(length(sideways)>.05?sideways:cross(unit(sx),u)),z=unit(cross(u,v));
    const rv=[-ru[1],ru[0],0],rz=[0,0,1];
    const longitudinal=physical ? scale : clamp(length(dir)*.90/length(rest)*lengthScale,scale*.55,scale*1.8);
    const transverse=physical ? scale : scale*ease;
    const cols=[0,1,2].map(i=>add(add(mul(u,longitudinal*ru[i]),mul(v,transverse*rv[i])),mul(z,transverse*rz[i])));
    // In measured mode the wearer's shoulder span can differ from the source
    // rig's 47 cm. Rotate around that person's joint in garment bind space;
    // translating the old 23.5 cm pivot inward would crush the oversized armhole.
    const fromChest=sub(s,chestAnchor);
    const pivot=physical ? add(REST.shoulder,[dot(fromChest,unit(sx))/scale,
      dot(fromChest,unit(up_ortho))/scale,dot(fromChest,normal)/scale]) : REST['shoulder'+side];
    matrices['upper_arm.'+side]=matrix(...cols,pivot,s);
    if(visible(landmarks[wi])) arms.push({elbow:e,wrist:point(wi),radius:scale*.024});
  }
  return {matrices,shoulders,hips,normal,scale,arms,physical,calibrated:physical&&!!measuredShoulder,landmarks:landmarks.map((p,i)=>visible(p)?point(i):null)};
}

/** Time-based adaptive smoothing; reset after source changes or tracking loss. */
export class PoseFilter {
  constructor(){this.reset();}
  reset(){this.previous=null;this.time=0;}
  update(points,time,still=false){
    if(!this.previous||still){this.previous=points.map(p=>({...p}));this.time=time;return this.previous;}
    const dt=clamp((time-this.time)/1000,.001,.25);this.time=time;
    this.previous=points.map((p,i)=>{
      const old=this.previous[i]||p;
      const speed=Math.hypot(p.x-old.x,p.y-old.y)/dt;
      const alpha=1-Math.exp(-2*Math.PI*(2.5+speed*9)*dt);
      return {...p,x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha,z:(old.z||0)+((p.z||0)-(old.z||0))*alpha};
    });return this.previous;
  }
}
