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
    // In front view: anatomical neck occluder fills the neck opening at Y = 0.64 (Z = -0.015),
    // sitting comfortably behind the front collar (Z ~ +0.07) and in front of the inside label/back collar (Z ~ -0.055).
    // In back view: the back of the shirt is a solid fabric panel facing camera; neck occluder is hidden so it never punches holes in the back!
    const isFrontView = fit.normal[2] > 0.15;
    const neck=this.occluders[0];
    neck.visible=isFrontView;
    if(isFrontView){
      const m=new THREE.Matrix4().fromArray(fit.matrices.chest);
      neck.matrixAutoUpdate=false;
      neck.matrix.copy(m.multiply(new THREE.Matrix4().makeTranslation(0,.64,-.015)).scale(new THREE.Vector3(.072,.20,.055)));
      neck.matrixWorldNeedsUpdate=true;
    }
    fit.arms.forEach((arm,i)=>{
      const o=this.occluders[i+1],a=new THREE.Vector3(...arm.elbow),b=new THREE.Vector3(...arm.wrist);
      const hand = this.hands[i];
      // Forearm only crosses in front of torso when:
      // 1. Person is facing front (in back view, arms are behind the shirt from camera perspective)
      // 2. Wrist is vertically between hips and collar
      // 3. Wrist is strictly within central chest width (|x - center| < scale * 0.18)
      // Arms raised to the side (fists, gestures, holding phone near shoulder) are outside this range,
      // guaranteeing that occluders NEVER cut holes into the sleeves!
      const isCrossingChest = isFrontView &&
        b.y > fit.hips[1] &&
        b.y < fit.shoulders[1] + fit.scale * 0.06 &&
        Math.abs(b.x - fit.shoulders[0]) < fit.scale * 0.18;

      if (!isCrossingChest) {
        o.visible = false;
        if (hand) hand.visible = false;
        return;
      }

      o.visible = true;
      // Start 70% down the forearm from elbow towards wrist:
      // Strictly localized over the chest where hand/phone crosses, safely away from the sleeve cuff!
      const posA = new THREE.Vector3().lerpVectors(a, b, 0.70);
      const frontTorsoZ = fit.shoulders[2] + fit.scale * 0.08;
      const posB = new THREE.Vector3(b.x, b.y, Math.max(b.z, frontTorsoZ + 2));
      posA.z = Math.max(posA.z, frontTorsoZ + 1);
      o.position.copy(posA).add(posB).multiplyScalar(.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), posB.clone().sub(posA).normalize());
      const forearmRadius = fit.scale * 0.016;
      o.scale.set(forearmRadius, Math.max(0.001, posA.distanceTo(posB)), forearmRadius);

      if (hand) {
        hand.visible = true;
        const armDir = posB.clone().sub(posA).normalize();
        const handPos = posB.clone().add(armDir.multiplyScalar(fit.scale * 0.024));
        hand.position.copy(handPos);
        const handRadius = fit.scale * 0.022;
        hand.scale.set(handRadius, handRadius, handRadius);
      }
    });
    for(let i=fit.arms.length+1;i<3;i++)this.occluders[i].visible=false;
    const nose=fit.landmarks[0],leftEar=fit.landmarks[7],rightEar=fit.landmarks[8];
    this.head.visible=isFrontView && !!nose;
    if(this.head.visible && nose){
      const center=leftEar&&rightEar?leftEar.map((v,i)=>(v+rightEar[i])/2):nose;
      const radius=leftEar&&rightEar?Math.max(fit.scale*.065,Math.hypot(leftEar[0]-rightEar[0],leftEar[1]-rightEar[1])*.60):fit.scale*.075;
      this.head.position.set(center[0],center[1],Math.max(center[2],nose[2])+fit.scale*.05);
      this.head.scale.set(radius,radius*1.15,radius);
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
