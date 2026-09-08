const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function readModel(name){
  const data=fs.readFileSync(path.join(__dirname,'../assets/vto-'+name+'.glb'));
  assert.equal(data.toString('utf8',0,4),'glTF');assert.equal(data.readUInt32LE(4),2);
  const jsonLength=data.readUInt32LE(12),gltf=JSON.parse(data.subarray(20,20+jsonLength));
  const bin=20+jsonLength+8;
  const read=id=>{
    const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];
    const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const [size,method]={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']}[a.componentType];
    const offset=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>data[method](offset+i*stride+k*size)));
  };
  return {gltf,read,bytes:data.length};
}
for(const name of ['secrets','sinners','secrets-lite','sinners-lite']){
  test(name+': real GLB has mobile-sized embedded textures, valid skinning and fully driven cuffs',()=>{
    const {gltf,read,bytes}=readModel(name);
    assert.ok(bytes<2*1024*1024);
    if(name.endsWith('-lite'))assert.ok(bytes<800*1024);
    assert.ok(gltf.images.length>=2);assert.ok(gltf.images.every(i=>i.bufferView!==undefined&&!i.uri));
    assert.equal(gltf.skins.length,1);
    const names=gltf.skins[0].joints.map(i=>gltf.nodes[i].name);
    for(const bone of ['root','spine','chest','neck','upper_arm.L','upper_arm.R'])assert.ok(names.includes(bone));
    let cuffs=0,triangles=0;
    for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
      const a=primitive.attributes,positions=read(a.POSITION),joints=read(a.JOINTS_0),weights=read(a.WEIGHTS_0);
      triangles+=read(primitive.indices).length/3;
      assert.equal(positions.length,weights.length);
      positions.forEach((p,i)=>{
        assert.ok(p.every(Number.isFinite));assert.ok(weights[i].every(w=>Number.isFinite(w)&&w>=0));
        assert.ok(Math.abs(weights[i].reduce((x,y)=>x+y,0)-1)<1e-5);
        if(Math.abs(p[0])>.48){
          cuffs++;
          const arm=p[0]>0?'upper_arm.L':'upper_arm.R';
          const influence=weights[i].reduce((sum,w,k)=>sum+(names[joints[i][k]]===arm?w:0),0);
          assert.ok(influence>.999,'the entire sleeve cuff must follow its arm, including the underside');
        }
      });
    }
    assert.ok(cuffs>50);assert.ok(triangles<40000);
  });
}
