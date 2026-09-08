const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Liquid}=require('../artifacts/try-on/runtime/node_modules/liquidjs');
const root=path.join(__dirname,'..');
const mod=name=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'assets',name+'.js'),'utf8')).toString('base64'));
const sizing=mod('vto-sizing');
const chartPromise=new Liquid().parseAndRender(fs.readFileSync(path.join(root,'snippets/size-measurements.liquid'),'utf8'),{action:'json',garment:'tshirt'}).then(JSON.parse);
const variants=['S','M','L','XL'].map((size,i)=>({id:i,options:['Burgundy',size],available:size!=='XL'}));
test('chart JSON reuses the real named measurements, not generic diagram letters',async()=>{
  const chart=await chartPromise;
  assert.deepEqual(chart.sizes.S,{chest:60,length:64,sleeve:23,shoulder:63,opening:20});
  assert.deepEqual(chart.sizes.XL,{chest:66,length:70,sleeve:26,shoulder:69,opening:23});
  assert.equal(chart.tolerance,2);
});
test('exact size option supports different option orders; unknown and ambiguous values are not guessed',async()=>{
  const {sizeKey}=await sizing;
  assert.equal(sizeKey(variants[0],['Color','Size']),'S');
  assert.equal(sizeKey({options:['M','White']},['Tamanho','Cor']),'M');
  assert.equal(sizeKey({options:['M','S']},['Color','Size']),'S');
  assert.equal(sizeKey({options:['M','S']}),null);
  assert.equal(sizeKey({options:['XXL']}),null);
  assert.equal(sizeKey({title:'Secrets Large',options:[]}),null);
});
test('matching own garment returns exact M; sold-out XL is not replaced by a worse available size',async()=>{
  const {recommend}=await sizing,chart=await chartPromise;
  assert.equal(recommend(chart,{width:62,length:66},variants,['Color','Size']).key,'M');
  const xl=recommend(chart,{width:66,length:70},variants,['Color','Size']);
  assert.equal(xl.key,'XL');assert.equal(xl.available,false);assert.equal(xl.status,'match');
});
test('flat chest is doubled only when comparing with body circumference',async()=>{
  const {recommend}=await sizing,chart=await chartPromise;
  const r=recommend(chart,{method:'body',chest:100,preference:'boxy'},variants,['Color','Size']);
  assert.equal(r.key,'M');assert.equal(r.ease,24);assert.equal(r.targetWidth,62);
});
test('missing/invalid inputs do not produce recommendations; out-of-range bodies are flagged',async()=>{
  const {recommend,profileValues}=await sizing,chart=await chartPromise;
  for(const p of [{},{width:62},{width:-1,length:66},{method:'body',chest:NaN}])assert.equal(recommend(chart,p,variants).status,'incomplete');
  assert.equal(recommend(chart,{method:'body',chest:140},variants).status,'outside');
  assert.equal(profileValues({shoulder:'42,5'}).shoulder,42.5);
  assert.equal(profileValues({shoulder:100}).shoulder,null);
});
test('all five garment dimensions change independently with size; no invented XS/XXL',async()=>{
  const {garmentRatios}=await sizing,chart=await chartPromise;
  assert.deepEqual(garmentRatios(chart,'M'),{chest:1,length:1,sleeve:1,shoulder:1,opening:1});
  const xl=garmentRatios(chart,'XL');
  assert.equal(xl.sleeve,26/24);assert.equal(xl.shoulder,69/65);
  assert.notEqual(xl.length,xl.sleeve);assert.equal(garmentRatios(chart,'XS'),null);
});
