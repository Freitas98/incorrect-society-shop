// Integration with the Liquid source. Requires the isolated preview dependency:
// npm install --prefix artifacts/try-on/runtime liquidjs@10.21.1
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Liquid}=require('../artifacts/try-on/runtime/node_modules/liquidjs');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'sections/product.liquid'),'utf8');
const selection=source.slice(0,source.indexOf('<div class="product-page-new'))+'{{ vto_available | json }}|{{ vto_model | json }}';
const snippet=fs.readFileSync(path.join(root,'snippets/virtual-try-on-modal.liquid'),'utf8');
function engine(lang='en.default'){
  const liquid=new Liquid({root:path.join(root,'snippets'),extname:'.liquid'}),locale=JSON.parse(fs.readFileSync(path.join(root,'locales/'+lang+'.json'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/,\s*([}\]])/g,'$1'));
  liquid.registerFilter('json',v=>JSON.stringify(v??null));liquid.registerFilter('asset_url',v=>'/assets/'+v);
  liquid.registerFilter('t',v=>v.split('.').reduce((a,k)=>a?.[k],locale)||v);return liquid;
}
const product=(id=99,model)=>({id,title:'Unrelated white Secrets T-shirt',metafields:{custom:{try_on_model:{value:model}}},variants:[{id:1,options:['M'],metafields:{custom:{}}}]});
test('explicit product identity selects the correct model; unrelated titles/colours never grant a model',async()=>{
  for(const [p,settings,expected] of [
    [product(),{},[false,'']],
    [product(11569665933653),{},[true,'secrets']],
    [product(11569666097493),{},[true,'sinners']],
    [product(99,'secrets'),{},[true,'secrets']],
    [product(99,'sinners'),{},[true,'sinners']],
    [product(99,'invalid'),{},[false,'invalid']],
    [product(99),{vto_secrets_product:{id:99},vto_sinners_product:{id:100}},[true,'secrets']],
    [product(100),{vto_secrets_product:{id:99},vto_sinners_product:{id:100}},[true,'sinners']],
    [product(101),{vto_secrets_product:{id:99},vto_sinners_product:{id:100}},[false,'']],
    [product(11569665933653),{enable_virtual_try_on:false},[false,'secrets']],
  ]){
    const output=(await engine().parseAndRender(selection,{product:p,section:{settings}})).trim();
    assert.deepEqual(output.split('|').map(JSON.parse),expected);
  }
});
test('global and product-section kill switches independently override every supported product',async()=>{
  for(const id of [11569665933653,11569666097493]){
    for(const globalFlag of [false,true,undefined])for(const sectionFlag of [false,true,undefined]){
      const output=(await engine().parseAndRender(selection,{
        product:product(id),settings:{enable_virtual_try_on:globalFlag},
        section:{settings:{enable_virtual_try_on:sectionFlag}},
      })).trim();
      const [available]=output.split('|').map(JSON.parse);
      assert.equal(available,globalFlag!==false&&sectionFlag!==false,
        `product ${id}: global=${globalFlag}, section=${sectionFlag}`);
    }
  }
  const overridden=product(99);
  overridden.variants[0].metafields.custom.try_on_model={value:'secrets'};
  const output=(await engine().parseAndRender(selection,{
    product:overridden,settings:{enable_virtual_try_on:false},section:{settings:{}},
  })).trim();
  assert.equal(JSON.parse(output.split('|')[0]),false,'variant model cannot bypass the global kill switch');
});
test('EN and PT modal config is valid, fully translated, scoped and script-safe',async()=>{
  for(const lang of ['en.default','pt-PT']){
    const p=product();p.title='<img src=x onerror=alert(1)>';
    p.variants[0].options=['</script><script>alert(1)</script>'];
    const html=await engine(lang).parseAndRender(snippet,{product:p,section:{id:'one'},vto_model:'sinners'});
    assert.ok(html.includes('id="VirtualTryOn-one"'));assert.ok(html.includes('&lt;img'));
    assert.equal((html.match(/<script/g)||[]).length,1);
    const config=JSON.parse(html.match(/data-vto-config>([\s\S]*?)<\/script>/)[1]);
    assert.equal(config.model,'sinners');assert.equal(config.variants[0].model,'sinners');
    assert.equal(config.variants[0].options[0],p.variants[0].options[0]);
    assert.ok(Object.values(config.strings).every(v=>typeof v==='string'&&!v.startsWith('try_on.')));
    assert.ok(Object.values(config.fitStrings).every(v=>typeof v==='string'&&!v.startsWith('try_on.')));
    assert.ok(!html.includes('try_on.fit.'),'visible labels must also be translated');
    assert.ok(config.strings.photoFitted);
  }
});
test('one variant may explicitly override its parent product model',async()=>{
  const p=product();p.variants[0].metafields.custom.try_on_model={value:'secrets'};
  const html=await engine().parseAndRender(snippet,{product:p,section:{id:'two'},vto_model:'sinners'});
  const config=JSON.parse(html.match(/data-vto-config>([\s\S]*?)<\/script>/)[1]);
  assert.equal(config.variants[0].model,'secrets');
});
test('layout import map versions every shared module without eagerly loading it',async()=>{
  const liquid=engine();liquid.registerFilter('asset_url',v=>'https://cdn.example.test/assets/'+v+'?v=123');
  const source=fs.readFileSync(path.join(root,'snippets/vto-import-map.liquid'),'utf8');
  const html=await liquid.parseAndRender(source),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.ok(Object.keys(map.imports).length >= 8);
  assert.ok(Object.entries(map.imports).every(([key,url])=>key.startsWith('@incorrect/')&&url.endsWith('?v=123')));
  assert.equal((html.match(/\bsrc=/g)||[]).length,0);
  assert.equal((fs.readFileSync(path.join(root,'layout/theme.liquid'),'utf8').match(/render 'vto-import-map'/g)||[]).length,1);
});
