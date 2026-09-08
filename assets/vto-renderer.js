import * as THREE from '@incorrect/vto-three';
import {GLTFLoader} from '@incorrect/vto-gltf-loader';
import {solveFit,PoseFilter} from '@incorrect/vto-fit';
import {ClothCage,gradePoint} from '@incorrect/vto-cloth';
import {quaternionSkinning,quaternionNormal,quaternionPosition} from '@incorrect/vto-skinning';

export class GarmentRenderer {
  constructor(canvas,{lowPower=false}={}) {
    this.lowPower=lowPower;
    this.loadRevision=0;
    this.physicalUniform={value:false};
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1:1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1;
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10000);
    this.camera.position.z=3000;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xb5afb0,2.2));
    const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-100,500,2000);this.scene.add(key);
    this.imageFilter=new PoseFilter();this.worldFilter=new PoseFilter();
    this.occluders=[];this.hands=[]; // no depth-cut geometry; foreground is composited
    this.disposed=false;
  }
  async load(url,signal) {
    const revision=++this.loadRevision;
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error('modelLoad');
    const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),new URL('.',url).href);
    if(this.disposed||signal?.aborted||revision!==this.loadRevision){disposeModel(gltf.scene);return;}
    if(this.model){this.scene.remove(this.model);disposeModel(this.model);}
    this.clothTexture?.dispose();this.clothTexture=null;this.cloth=null;
    this.model=gltf.scene;this.scene.add(this.model);this.model.updateMatrixWorld(true);
    this.bones=[];this.surfaces=[];this.lastRatios=null;
    this.model.traverse(o=>{
      if(o.isBone) {
        this.bones.push({bone:o,rest:o.matrixWorld.clone()});o.matrixAutoUpdate=false;
      }
      if(o.isMesh){o.frustumCulled=false;
        this.surfaces.push({mesh:o,rest:o.geometry.attributes.position.array.slice()});
      }
    });
    const names=this.bones.map(({bone})=>bone.name);
    if(!['spine','chest','upper_armL','upper_armR'].every(name=>names.some(n=>n.replaceAll('.','')===name))) {
      this.model.visible=false;throw new Error('invalidRig');
    }
    this.model.visible=false;
    this.bindCloth();
  }
  resize(width,height) {
    if(this.width===width&&this.height===height)return;
    this.width=width;this.height=height;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});
    this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
  }
  setQuality(lowPower) {
    this.lowPower=lowPower;
    if(this.cloth)this.cloth.lowPower=lowPower;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1:1.5));
  }
  reset(){this.imageFilter.reset();this.worldFilter.reset();this.cloth?.reset();this.hide();}
  hide(){if(this.model)this.model.visible=false;this.render();}
  fit(result,rect,options={}) {
    if(!this.model||!result.landmarks){this.reset();return null;}
    const points=this.imageFilter.update(result.landmarks,performance.now(),options.still);
    const world=result.world?this.worldFilter.update(result.world,performance.now(),options.still):null;
    const fit=solveFit(points,world,rect,this.width,this.height,options);
    if(!fit){this.hide();return null;}
    this.model.visible=true;
    this.physicalUniform.value=fit.physical;
    this.resizeGarment(options.ratios);
    for(const {bone,rest} of this.bones) {
      const name=bone.name.replace('upper_armL','upper_arm.L').replace('upper_armR','upper_arm.R');
      const matrix=fit.matrices[name];
      if(!matrix)continue;
      const desired=new THREE.Matrix4().fromArray(matrix).multiply(rest);
      const parentInverse=bone.parent.matrixWorld.clone().invert();
      bone.matrix.copy(parentInverse.multiply(desired));bone.matrixWorldNeedsUpdate=true;
      bone.updateMatrixWorld(true);
    }
    if(this.cloth){
      const start=performance.now();
      this.cloth.update(fit,options.ratios,{still:options.still,bodyChest:options.bodyChest});
      this.clothTexture.needsUpdate=true;this.clothMs=performance.now()-start;
    }
    // Foreground pixels are composited separately. Never punch holes in the
    // garment with cylinders/spheres approximating a person\'s arms or hands.
    this.lastFit=fit;this.render();return fit;
  }
  resizeGarment(ratios) {
    const signature=JSON.stringify(ratios);
    if(signature===this.lastRatios)return;
    this.lastRatios=signature;
    for(const {mesh,rest} of this.surfaces) {
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setXYZ(i,...gradePoint(rest[i*3],rest[i*3+1],rest[i*3+2],ratios));
      positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
    }
  }
  bindCloth() {
    let data;
    this.model.traverse(o=>{if(o.userData.vto_cloth_cage)data=JSON.parse(o.userData.vto_cloth_cage);});
    if(!data)return;
    this.cloth=new ClothCage(data,{lowPower:this.lowPower});
    this.clothTexture=new THREE.DataTexture(this.cloth.offsets,this.cloth.count,1,THREE.RGBAFormat,THREE.FloatType);
    this.clothTexture.needsUpdate=true;
    const materials=new Set();
    for(const {mesh,rest} of this.surfaces){
      const count=mesh.geometry.attributes.position.count,ids=new Float32Array(count*4),weights=new Float32Array(count*4);
      for(let i=0;i<count;i++){
        const bound=this.cloth.weights([rest[i*3],rest[i*3+1],rest[i*3+2]]);
        ids.set(bound.indices,i*4);weights.set(bound.weights,i*4);
      }
      mesh.geometry.setAttribute('clothIndices',new THREE.BufferAttribute(ids,4));
      mesh.geometry.setAttribute('clothWeights',new THREE.BufferAttribute(weights,4));
      for(const material of [mesh.material].flat()){
        if(materials.has(material))continue;materials.add(material);
        material.onBeforeCompile=shader=>{
          shader.uniforms.clothOffsets={value:this.clothTexture};
          shader.uniforms.clothCount={value:this.cloth.count};
          shader.uniforms.vtoPhysical=this.physicalUniform;
          shader.vertexShader=quaternionSkinning+'attribute vec4 clothIndices; attribute vec4 clothWeights; uniform sampler2D clothOffsets; uniform float clothCount;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <skinnormal_vertex>',quaternionNormal);
          shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>', quaternionPosition+'\n'+
            ['x','y','z','w'].map(c=>'transformed += texture2D(clothOffsets,vec2((clothIndices.'+c+'+0.5)/clothCount,0.5)).xyz*clothWeights.'+c+';').join('\n'));
          // Blend the true deformed-surface normal with the smooth knit normal;
          // otherwise cloth bends geometrically while its lighting stays rigid.
          const normalChunk=THREE.ShaderChunk.normal_fragment_begin.replace(
            'vec3 normal = normalize( vNormal );',
            'vec3 surfaceNormal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition))); vec3 normal=normalize(mix(normalize(vNormal),surfaceNormal*faceDirection,0.65));');
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',normalChunk);
        };
        material.customProgramCacheKey=()=> 'incorrect-cloth-v2';
        material.needsUpdate=true;
      }
    }
  }
  render(){if(!this.disposed)this.renderer.render(this.scene,this.camera);}
  dispose(){
    this.disposed=true;if(this.model)disposeModel(this.model);
    this.clothTexture?.dispose();
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
