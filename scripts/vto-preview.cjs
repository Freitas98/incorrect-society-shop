// Local-only preview of the real Liquid modal/assets. Never syncs Shopify.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {Liquid}=require('../artifacts/try-on/runtime/node_modules/liquidjs');
const root=path.resolve(__dirname,'..');
const readLocale=name=>JSON.parse(fs.readFileSync(path.join(root,'locales/'+name+'.json'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/,\s*([}\]])/g,'$1'));
function createEngine(language){
const engine=new Liquid({root:path.join(root,'snippets'),extname:'.liquid'}),locale=readLocale(language==='pt'?'pt-PT':'en.default');
engine.registerFilter('asset_url',s=>'/assets/'+s+'?v='+Math.round(fs.statSync(path.join(root,'assets',s)).mtimeMs));
engine.registerFilter('json',s=>JSON.stringify(s??null));
engine.registerFilter('money',s=>'€'+(Number(s||0)/100).toFixed(2));
engine.registerFilter('image_url',s=>s||'');
engine.registerFilter('t',s=>s.split('.').reduce((o,k)=>o?.[k],locale)||s);
return engine;
}
const types={'.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.html':'text/html','.json':'application/json','.mp4':'video/mp4'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(url.pathname==='/') {
      const engine=createEngine(url.searchParams.get('lang'));
      const model=url.searchParams.get('model')==='sinners'?'sinners':'secrets';
      const snippet=fs.readFileSync(path.join(root,'snippets/virtual-try-on-modal.liquid'),'utf8');
      const importMap=await engine.parseAndRender(fs.readFileSync(path.join(root,'snippets/vto-import-map.liquid'),'utf8'));
      const products=['secrets','sinners'].map((key,index)=>({
        id: index ? 11569666097493 : 11569665933653, title: key === 'secrets' ? 'Secrets white tee' : 'Sins burgundy tee',
        price:3000,featured_image:'/artifacts/3d/secrets-and-sinners/previews/'+key+'-front.png',
        options:['Size'],metafields:{custom:{try_on_model:{value:key}}},
        variants:['S','M','L','XL'].map((size,i)=>({id:101+index*10+i,title:size,options:[size],price:3000,available:size!=='XL',metafields:{custom:{try_on_model:{value:key}}}}))
      }));
      const modal=await engine.parseAndRender(snippet,{vto_model:model,section:{id:'test'},product:products[model==='sinners'?1:0],collection:{products}});
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><html lang="en"><head>'+importMap+'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/virtual-try-on.css"><title>Incorrect Society · Local try-on preview</title></head><body style="font-family:sans-serif;padding:30px;background:#eee"><section class="shopify-section"><h1>Local try-on preview — '+model+'</h1><p>Real theme assets · test product · no Shopify writes</p><button type="button" id="vto-sample">Try a public sample photo (no camera)</button><select class="variant-selector"><option value="101">M</option></select><button data-vto-open aria-controls="VirtualTryOn-test" class="btn-try-on-ar">Try now using VR</button>'+modal+'</section><script src="/assets/virtual-try-on.js"></script><script>document.getElementById("vto-sample").onclick=async()=>{const blob=await(await fetch("/artifacts/try-on/male_full_height_hands.jpg")).blob();const dt=new DataTransfer();dt.items.add(new File([blob],"sample.jpg",{type:"image/jpeg"}));document.querySelector("[data-vto-open]").click();const input=document.querySelector("[data-vto-file]");input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));};</script></body></html>');return;
    }
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep)||!['assets','artifacts'].includes(path.relative(root,target).split(path.sep)[0])){res.writeHead(403);res.end();return;}
    const stat=fs.statSync(target);if(!stat.isFile())throw Error('file');
    res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');
    fs.createReadStream(target).pipe(res);
  }catch(e){res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local-only try-on preview: http://127.0.0.1:4173'));
