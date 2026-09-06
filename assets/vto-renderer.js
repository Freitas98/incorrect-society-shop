import * as THREE from '@incorrect/vto-three';
import {GLTFLoader} from '@incorrect/vto-gltf-loader';
import {solveFit,PoseFilter} from '@incorrect/vto-fit';

export class GarmentRenderer {
  constructor(canvas) {
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1;
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10000);
    this.camera.position.z=3000;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xb5afb0,2.2));
    const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-100,500,2000);this.scene.add(key);
    this.imageFilter=new PoseFilter();this.worldFilter=new PoseFilter();
    this.occluders=[];
    this.maskMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true});
    for(let i=0;i<3;i++) {
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,16),this.maskMaterial);
      mesh.renderOrder=-1;mesh.visible=false;this.scene.add(mesh);this.occluders.push(mesh);
    }
    this.head=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),this.maskMaterial);
    this.head.renderOrder=-1;this.head.visible=false;this.scene.add(this.head);
    this.hands=[0,1].map(()=>{
      const hand=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),this.maskMaterial);
      hand.renderOrder=-1;hand.visible=false;this.scene.add(hand);return hand;
    });
    this.disposed=false;
  }
  async load(url,signal) {
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error('modelLoad');
    const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),new URL('.',url).href);
    if(this.disposed){disposeModel(gltf.scene);return;}
    if(this.model){this.scene.remove(this.model);disposeModel(this.model);}
    this.model=gltf.scene;this.scene.add(this.model);this.model.updateMatrixWorld(true);
    this.bones=[];
    this.model.traverse(o=>{
      if(o.isBone) {
        this.bones.push({bone:o,rest:o.matrixWorld.clone()});o.matrixAutoUpdate=false;
      }
      if(o.isMesh){o.frustumCulled=false;}
    });
    const names=this.bones.map(({bone})=>bone.name);
    if(!['spine','chest','upper_armL','upper_armR'].every(name=>names.some(n=>n.replaceAll('.','')===name))) {
      this.model.visible=false;throw new Error('invalidRig');
    }
    this.model.visible=false;
  }
  resize(width,height) {
    if(this.width===width&&this.height===height)return;
    this.width=width;this.height=height;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});
    this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
  }
  reset(){this.imageFilter.reset();this.worldFilter.reset();this.hide();}
  hide(){if(this.model)this.model.visible=false;this.occluders.forEach(o=>o.visible=false);this.hands.forEach(o=>o.visible=false);this.head.visible=false;this.render();}
  fit(result,rect,options={}) {
    if(!this.model||!result.landmarks){this.reset();return null;}
    const points=this.imageFilter.update(result.landmarks,performance.now(),options.still);
    const world=result.world?this.worldFilter.update(result.world,performance.now(),options.still):null;
    const fit=solveFit(points,world,rect,this.width,this.height,options);
    if(!fit){this.hide();return null;}
    this.model.visible=true;
    for(const {bone,rest} of this.bones) {
      const name=bone.name.replace('upper_armL','upper_arm.L').replace('upper_armR','upper_arm.R');
      const matrix=fit.matrices[name];
      if(!matrix)continue;
      const desired=new THREE.Matrix4().fromArray(matrix).multiply(rest);
      const parentInverse=bone.parent.matrixWorld.clone().invert();
      bone.matrix.copy(parentInverse.multiply(desired));bone.matrixWorldNeedsUpdate=true;
      bone.updateMatrixWorld(true);
    }
    // Depth-only neck/forearm proxies keep the real person visible over cloth
    // when a forearm moves in front of the torso. No torso-wide cut-out.
    const neck=this.occluders[0];neck.visible=true;
    const m=new THREE.Matrix4().fromArray(fit.matrices.chest);
    neck.matrixAutoUpdate=false;
    neck.matrix.copy(m.multiply(new THREE.Matrix4().makeTranslation(0,.705,0)).scale(new THREE.Vector3(.070,.23,.070)));
    neck.matrixWorldNeedsUpdate=true;
    fit.arms.forEach((arm,i)=>{
      const o=this.occluders[i+1],a=new THREE.Vector3(...arm.elbow),b=new THREE.Vector3(...arm.wrist);
      o.visible=true;o.position.copy(a).add(b).multiplyScalar(.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
      o.scale.set(arm.radius,a.distanceTo(b),arm.radius);
    });
    for(let i=fit.arms.length+1;i<3;i++)this.occluders[i].visible=false;
    const nose=fit.landmarks[0],leftEar=fit.landmarks[7],rightEar=fit.landmarks[8];
    this.head.visible=!!nose;
    if(nose){
      const center=leftEar&&rightEar?leftEar.map((v,i)=>(v+rightEar[i])/2):nose;
      const radius=leftEar&&rightEar?Math.max(fit.scale*.067,Math.hypot(leftEar[0]-rightEar[0],leftEar[1]-rightEar[1])*.65):fit.scale*.083;
      this.head.position.set(center[0],center[1],Math.max(center[2],nose[2])+fit.scale*.07);
      this.head.scale.set(radius,radius*1.28,radius);
    }
    for(let i=0;i<2;i++){
      const wrist=fit.landmarks[15+i],index=fit.landmarks[19+i],pinky=fit.landmarks[17+i],hand=this.hands[i];
      hand.visible=!!(wrist&&index&&pinky);
      if(hand.visible){
        const center=wrist.map((v,k)=>(v+index[k]+pinky[k])/3);
        const radius=Math.max(fit.scale*.033,Math.hypot(...index.map((v,k)=>v-wrist[k]))*.65);
        hand.position.set(center[0],center[1],center[2]+fit.scale*.015);hand.scale.set(radius,radius,radius*.6);
      }
    }
    this.lastFit=fit;this.render();return fit;
  }
  render(){if(!this.disposed)this.renderer.render(this.scene,this.camera);}
  dispose(){
    this.disposed=true;if(this.model)disposeModel(this.model);
    this.occluders.forEach(o=>o.geometry.dispose());this.hands.forEach(o=>o.geometry.dispose());this.head.geometry.dispose();this.maskMaterial.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
function disposeModel(root) {
  const textures=new Set(),materials=new Set(),skeletons=new Set();
  root.traverse(o=>{
    o.geometry?.dispose();if(o.skeleton)skeletons.add(o.skeleton);
    for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)) {
      materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});
    }
  });
  materials.forEach(m=>m.dispose());textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});
  skeletons.forEach(s=>s.dispose());
}
