/** Warp a semantic keyframe into the CURRENT frame using tracked limb segments.
 * Every restored pixel is sampled from the current image and checked against
 * the keyframe appearance. Never paste old hand pixels or unchecked polygons.
 * Ambiguous edges / large appearance changes keep the garment intact. */
export function warpForeground(reference,points,pixels,frameTime,person){
  const {width:w,height:h,alpha:mask,pixels:before,landmarks:old}=reference;
  const output=new Uint8ClampedArray(w*h);
  if(!points||!person?.alpha||frameTime-reference.frameTime>1200||frameTime<reference.frameTime)return output;
  const valid=p=>p&&(p.visibility??1)>.55&&(p.presence??1)>.55;
  const point=p=>[p.x*w,p.y*h];
  const segments=[];
  for(const [a,b] of [[13,15],[15,19],[14,16],[16,20],[7,8]]){
    if(![points[a],points[b],old[a],old[b]].every(valid))continue;
    const from=point(points[a]),to=point(points[b]),oa=point(old[a]),ob=point(old[b]);
    const dx=to[0]-from[0],dy=to[1]-from[1],odx=ob[0]-oa[0],ody=ob[1]-oa[1];
    const length=Math.hypot(dx,dy),oldLength=Math.hypot(odx,ody);
    if(length<2||oldLength<2||length/oldLength>1.8||length/oldLength<.55)continue;
    segments.push({from,oa,dx,dy,odx,ody,length,oldLength,head:a===7});
  }
  const span=Math.max(8,Math.hypot((points[11].x-points[12].x)*w,(points[11].y-points[12].y)*h));
  for(const s of segments){
    const radius=s.head?span*.45:span*.17;
    const x0=Math.max(1,Math.floor(Math.min(s.from[0],s.from[0]+s.dx)-radius));
    const x1=Math.min(w-2,Math.ceil(Math.max(s.from[0],s.from[0]+s.dx)+radius));
    const y0=Math.max(1,Math.floor(Math.min(s.from[1],s.from[1]+s.dy)-radius));
    const y1=Math.min(h-2,Math.ceil(Math.max(s.from[1],s.from[1]+s.dy)+radius));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const rx=x-s.from[0],ry=y-s.from[1];
      const u=(rx*s.dx+ry*s.dy)/(s.length*s.length);
      const v=(ry*s.dx-rx*s.dy)/(s.length*s.length);
      if((!s.head&&(u<-.12||u>1.25))||Math.abs(v*s.length)>radius)continue;
      const ox=Math.round(s.oa[0]+u*s.odx-v*s.ody),oy=Math.round(s.oa[1]+u*s.ody+v*s.odx);
      if(ox<1||oy<1||ox>=w-1||oy>=h-1)continue;
      const i=y*w+x,j=oy*w+ox;
      // Current-frame person evidence rejects newly exposed background even
      // when its colour resembles the old hand. This mask alone never restores
      // a pixel: semantic skin/accessory + pose + appearance still have to agree.
      const px=Math.min(person.width-1,Math.floor((x+.5)*person.width/w));
      const py=Math.min(person.height-1,Math.floor((y+.5)*person.height/h));
      if(person.alpha[py*person.width+px]<215)continue;
      const confidence=Math.min(mask[j],mask[j-1],mask[j+1],mask[j-w],mask[j+w]);
      if(confidence<160)continue;
      // Appearance agreement, not fixed skin-colour thresholds. This rejects
      // newly exposed wall/clothing when a limb changes shape or self-occludes.
      const ri=pixels[i*4],gi=pixels[i*4+1],bi=pixels[i*4+2],ro=before[j*4],go=before[j*4+1],bo=before[j*4+2];
      const total=ri+gi+bi+1,oldTotal=ro+go+bo+1;
      const chroma=Math.hypot(ri/total-ro/oldTotal,gi/total-go/oldTotal,bi/total-bo/oldTotal);
      const light=Math.abs(total-oldTotal)/765;
      if(chroma>.045||light>.10)continue;
      const gate=Math.min(1,(.045-chroma)/.015,(.10-light)/.035);
      output[i]=Math.max(output[i],Math.round(confidence*Math.max(0,gate)));
    }
  }
  return output;
}
