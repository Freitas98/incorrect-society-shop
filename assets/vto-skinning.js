// Dual-quaternion blend for the uniformly-scaled physical fit. This preserves
// shoulder/sleeve volume at large rotations; classic matrix blends collapse it.
// The legacy non-uniform visual path retains Three's standard skinning.
const multiply=(a,b)=>[
  a[3]*b[0]+b[3]*a[0]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]+b[3]*a[1]+a[2]*b[0]-a[0]*b[2],
  a[3]*b[2]+b[3]*a[2]+a[0]*b[1]-a[1]*b[0],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
export function skinTransforms(matrices){
  return Object.fromEntries(Object.entries(matrices).map(([name,m])=>{
    const scale=Math.hypot(m[0],m[1],m[2]);
    const a=m[0]/scale,b=m[4]/scale,c=m[8]/scale,d=m[1]/scale,e=m[5]/scale,f=m[9]/scale,g=m[2]/scale,h=m[6]/scale,i=m[10]/scale;
    let q,s;const trace=a+e+i;
    if(trace>0){s=Math.sqrt(1+trace)*2;q=[(h-f)/s,(c-g)/s,(d-b)/s,s/4];}
    else if(a>e&&a>i){s=Math.sqrt(1+a-e-i)*2;q=[s/4,(b+d)/s,(c+g)/s,(h-f)/s];}
    else if(e>i){s=Math.sqrt(1+e-a-i)*2;q=[(b+d)/s,s/4,(f+h)/s,(c-g)/s];}
    else{s=Math.sqrt(1+i-a-e)*2;q=[(c+g)/s,(f+h)/s,s/4,(d-b)/s];}
    const norm=Math.hypot(...q);q=q.map(v=>v/norm);
    const dual=multiply([m[12],m[13],m[14],0],q).map(v=>v*.5);
    return [name,{q,dual,scale}];
  }));
}
export function skinPoint(transforms,weights,point){
  const qr=[0,0,0,0],qd=[0,0,0,0];let scale=0,reference=null,total=0;
  for(const [name,w] of Object.entries(weights)){
    const t=transforms[name];if(!t||!w)continue;reference ||= t.q;
    const sign=reference.reduce((s,v,i)=>s+v*t.q[i],0)<0?-1:1;
    for(let k=0;k<4;k++){qr[k]+=t.q[k]*w*sign;qd[k]+=t.dual[k]*w*sign;}
    scale+=t.scale*w;total+=w;
  }
  const norm=Math.hypot(...qr)||1;
  for(let k=0;k<4;k++){qr[k]/=norm;qd[k]/=norm;}
  const inverse=[-qr[0],-qr[1],-qr[2],qr[3]];
  const rotated=multiply(multiply(qr,[point[0]*scale/(total||1),point[1]*scale/(total||1),point[2]*scale/(total||1),0]),inverse);
  const offset=multiply(qd,inverse);
  return [0,1,2].map(k=>rotated[k]+2*offset[k]);
}

export const quaternionSkinning = `
uniform bool vtoPhysical;
vec4 vtoMul(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 vtoRotate(vec4 q,vec3 p){return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
vec4 vtoQuat(mat3 m){
  float trace=m[0][0]+m[1][1]+m[2][2];
  vec4 q;
  if(trace>0.0){float s=sqrt(1.0+trace)*2.0;q=vec4((m[1][2]-m[2][1])/s,(m[2][0]-m[0][2])/s,(m[0][1]-m[1][0])/s,.25*s);}
  else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){float s=sqrt(1.0+m[0][0]-m[1][1]-m[2][2])*2.0;q=vec4(.25*s,(m[1][0]+m[0][1])/s,(m[2][0]+m[0][2])/s,(m[1][2]-m[2][1])/s);}
  else if(m[1][1]>m[2][2]){float s=sqrt(1.0+m[1][1]-m[0][0]-m[2][2])*2.0;q=vec4((m[1][0]+m[0][1])/s,.25*s,(m[2][1]+m[1][2])/s,(m[2][0]-m[0][2])/s);}
  else{float s=sqrt(1.0+m[2][2]-m[0][0]-m[1][1])*2.0;q=vec4((m[2][0]+m[0][2])/s,(m[2][1]+m[1][2])/s,.25*s,(m[0][1]-m[1][0])/s);}
  return normalize(q);
}
void vtoAccumulate(mat4 m,float w,vec4 reference,inout vec4 qr,inout vec4 qd,inout float scale){
  float s=max(length(m[0].xyz),0.00001);
  vec4 q=vtoQuat(mat3(m)/s);q*=dot(reference,q)<0.0?-1.0:1.0;
  qr+=q*w;qd+=.5*vtoMul(vec4(m[3].xyz,0.0),q)*w;scale+=s*w;
}
`;
export const quaternionNormal = `
#include <skinnormal_vertex>
#ifdef USE_SKINNING
  vec4 vtoQR=vec4(0.0),vtoQD=vec4(0.0);float vtoScale=0.0;
  vec4 vtoReference=vtoQuat(mat3(boneMatX)/max(length(boneMatX[0].xyz),.00001));
  vtoAccumulate(boneMatX,skinWeight.x,vtoReference,vtoQR,vtoQD,vtoScale);
  vtoAccumulate(boneMatY,skinWeight.y,vtoReference,vtoQR,vtoQD,vtoScale);
  vtoAccumulate(boneMatZ,skinWeight.z,vtoReference,vtoQR,vtoQD,vtoScale);
  vtoAccumulate(boneMatW,skinWeight.w,vtoReference,vtoQR,vtoQD,vtoScale);
  float vtoNorm=max(length(vtoQR),.00001);vtoQR/=vtoNorm;vtoQD/=vtoNorm;
  if(vtoPhysical)objectNormal=mat3(bindMatrixInverse)*vtoRotate(vtoQR,mat3(bindMatrix)*normal);
#endif
`;
export const quaternionPosition = `
#include <skinning_vertex>
#ifdef USE_SKINNING
  if(vtoPhysical){
    vec3 p=(bindMatrix*vec4(position,1.0)).xyz*vtoScale;
    vec3 translation=2.0*vtoMul(vtoQD,vec4(-vtoQR.xyz,vtoQR.w)).xyz;
    transformed=(bindMatrixInverse*vec4(vtoRotate(vtoQR,p)+translation,1.0)).xyz;
  }
#endif
`;
