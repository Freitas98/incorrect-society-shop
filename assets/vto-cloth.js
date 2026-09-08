import {transform,sub,dot,unit,cross,length,clamp} from '@incorrect/vto-fit';
import {skinTransforms,skinPoint} from '@incorrect/vto-skinning';

/** Garment grading in bind metres, shared by render mesh and simulation cage. */
export function gradePoint(x,y,z,ratios) {
  const r=ratios||{chest:1,length:1,shoulder:1,sleeve:1,opening:1};
  const ax=Math.abs(x),upper=clamp((y-.34)/.22,0,1),collar=clamp((ax-.09)/.14,0,1);
  const widthRatio=1+((r.chest-1)*(1-upper)+(r.shoulder-1)*upper)*collar;
  let nx=x*widthRatio,ny=.66-(.66-y)*r.length,nz=z*r.chest;
  if(ax>.31){
    nx=Math.sign(x)*(.31*r.shoulder+(ax-.31)*r.sleeve);
    const center=.48-(ax-.31)*.51;
    ny=.66-(.66-center)*r.length+(y-center)*r.opening;nz=z*r.opening;
  }
  if(y>.57&&ax<.11)return [x,y,z];
  return [nx,ny,nz];
}

/** Bounded secondary cloth, XPBD distance constraints + kinematic tethers.
 * The rig carries gross motion. A welded surface cage supplies local flex,
 * inertia and approximate torso contact without simulating every render vertex.
 * No material-identification or manufacturing-accuracy claim is made.
 */
export class ClothCage {
  constructor(data,{lowPower=false}={}){
    if(data.version!==1||data.nodes.length>1600||data.edges.length>8000)throw Error('invalidCloth');
    this.nodes=data.nodes;this.edges=data.edges;this.lowPower=lowPower;
    this.count=this.nodes.length;
    this.position=new Float32Array(this.count*3);this.previous=this.position.slice();
    this.targets=this.position.slice();this.lastTargets=this.position.slice();
    this.offsets=new Float32Array(this.count*4);
    this.lambdas=new Float32Array(this.edges.length);
    this.restLengths=new Float32Array(this.edges.length);
    this.pins=this.nodes.map(n=>Math.abs(n.p[0])<.14&&n.p[1]>.565);
    this.reset();
  }
  reset(){this.started=false;this.time=0;this.offsets.fill(0);}
  grade(ratios){
    const key=JSON.stringify(ratios);
    if(key===this.gradeKey)return;
    this.gradeKey=key;this.rest=this.nodes.map(n=>gradePoint(...n.p,ratios));
    this.edges.forEach(([a,b],i)=>{this.restLengths[i]=length(sub(this.rest[a],this.rest[b]));});
    this.reset();
  }
  update(fit,ratios,{still=false,bodyChest=null,time=performance.now()}={}){
    this.grade(ratios);
    const scale=fit.scale;
    const transforms=fit.physical?skinTransforms(fit.matrices):null;
    this.nodes.forEach((node,i)=>{
      if(transforms){
        const point=skinPoint(transforms,node.w,this.rest[i]);
        for(let k=0;k<3;k++)this.targets[i*3+k]=point[k]/scale;
        return;
      }
      const p=[0,0,0];let total=0;
      for(const [name,weight] of Object.entries(node.w)){
        if(!fit.matrices[name])continue;
        const q=transform(fit.matrices[name],this.rest[i]);total+=weight;
        for(let k=0;k<3;k++)p[k]+=q[k]*weight;
      }
      for(let k=0;k<3;k++)this.targets[i*3+k]=p[k]/(scale*total||1);
    });
    if(!this.started||still){
      this.position.set(this.targets);this.previous.set(this.targets);this.started=true;
    } else {
      // Transport camera/body translation and scale; only local motion has inertia.
      const gain=clamp((time-this.time)/16.667,1,4);
      for(let i=0;i<this.position.length;i++){
        const delta=this.targets[i]-this.lastTargets[i];
        this.position[i]+=delta*.85;this.previous[i]+=delta*.85;
        if(Math.abs(delta)>.18){this.position[i]=this.previous[i]=this.targets[i];}
      }
      this.motionStep=gain;
    }
    this.time=time;this.lastTargets.set(this.targets);
    const iterations=this.lowPower?3:5,steps=still?10:Math.min(4,Math.ceil(this.motionStep||2)),dt=1/60;
    const origin=fit.shoulders.map(v=>v/scale);
    const basisX=unit(fit.matrices.chest.slice(0,3)),basisY=unit(fit.matrices.chest.slice(4,7)),basisZ=unit(cross(basisX,basisY));
    // Ellipse perimeter approximation, aspect 1.55. A measured chest sets
    // circumference; absent measurements this is only an anatomical proxy.
    const circumference=bodyChest>=60&&bodyChest<=180?bodyChest/100:.94;
    const radiusZ=circumference/(Math.PI*(3*(1.55+1)-Math.sqrt((3*1.55+1)*(1.55+3))));
    const radiusX=radiusZ*1.55;
    for(let step=0;step<steps;step++){
      for(let i=0;i<this.count;i++)for(let k=0;k<3;k++){
        const j=i*3+k,p=this.position[j],velocity=(p-this.previous[j])*.78;
        this.previous[j]=p;
        this.position[j]=this.pins[i]?this.targets[j]:p+velocity+(k===1?-9.81*dt*dt:0);
      }
      this.lambdas.fill(0);
      for(let iteration=0;iteration<iterations;iteration++){
        for(let ei=0;ei<this.edges.length;ei++){
          const [a,b]=this.edges[ei],ia=a*3,ib=b*3;
          const dx=this.position[ia]-this.position[ib],dy=this.position[ia+1]-this.position[ib+1],dz=this.position[ia+2]-this.position[ib+2];
          const dist=Math.hypot(dx,dy,dz);if(dist<1e-8)continue;
          const wa=this.pins[a]?0:1,wb=this.pins[b]?0:1,compliance=.000002/(dt*dt);
          const delta=(-(dist-this.restLengths[ei])-compliance*this.lambdas[ei])/(wa+wb+compliance);
          this.lambdas[ei]+=delta;
          const sa=wa*delta/dist,sb=wb*delta/dist;
          this.position[ia]+=sa*dx;this.position[ia+1]+=sa*dy;this.position[ia+2]+=sa*dz;
          this.position[ib]-=sb*dx;this.position[ib+1]-=sb*dy;this.position[ib+2]-=sb*dz;
        }
        for(let i=0;i<this.count;i++){
          const j=i*3,dx=this.position[j]-origin[0],dy=this.position[j+1]-origin[1],dz=this.position[j+2]-origin[2];
          const x=dx*basisX[0]+dy*basisX[1]+dz*basisX[2];
          const y=dx*basisY[0]+dy*basisY[1]+dz*basisY[2];
          const z=dx*basisZ[0]+dy*basisZ[1]+dz*basisZ[2];
          if(!this.pins[i]&&y<-.06&&y>-.5&&Math.abs(this.rest[i][0])<.29){
            const radial=Math.hypot(x/radiusX,z/radiusZ);
            if(radial<1.035&&radial>.05){
              const pushX=x*(1.035/radial-1),pushZ=z*(1.035/radial-1);
              this.position[j]+=basisX[0]*pushX+basisZ[0]*pushZ;
              this.position[j+1]+=basisX[1]*pushX+basisZ[1]*pushZ;
              this.position[j+2]+=basisX[2]*pushX+basisZ[2]*pushZ;
            }
          }
          // A soft attachment keeps the inferred person safe from runaway
          // tracking forces. Max displacement is 4 cm, 0 at the neckline.
          let distance=0;
          for(let k=0;k<3;k++){this.position[j+k]+=(this.targets[j+k]-this.position[j+k])*.09;distance+=(this.position[j+k]-this.targets[j+k])**2;}
          const limit=this.pins[i]?0:.04,factor=Math.min(1,limit/(Math.sqrt(distance)||1));
          for(let k=0;k<3;k++)this.position[j+k]=this.targets[j+k]+(this.position[j+k]-this.targets[j+k])*factor;
        }
      }
    }
    let maximum=0;
    for(let i=0;i<this.count;i++){
      let mag=0;
      for(let k=0;k<3;k++){const d=this.position[i*3+k]-this.targets[i*3+k];this.offsets[i*4+k]=d*scale;mag+=d*d;}
      maximum=Math.max(maximum,Math.sqrt(mag));
    }
    this.maxDisplacement=maximum;return this.offsets;
  }
  weights(point){
    // Asset binding only, not per-frame. Four nearest nodes preserve welded
    // material seams and distribute each particle displacement smoothly.
    const best=[];
    this.nodes.forEach((node,index)=>{
      const d=(node.p[0]-point[0])**2+(node.p[1]-point[1])**2+(node.p[2]-point[2])**2;
      if(best.length<4||d<best[3].d){best.push({index,d});best.sort((a,b)=>a.d-b.d);best.length=Math.min(4,best.length);}
    });
    const sum=best.reduce((s,n)=>s+1/(n.d+.00002),0);
    return {indices:best.map(n=>n.index),weights:best.map(n=>1/(n.d+.00002)/sum)};
  }
}
