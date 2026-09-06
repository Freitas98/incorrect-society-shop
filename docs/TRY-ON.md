# Provador virtual — 2026-09-06

Implementação local para as duas t-shirts Incorrect Society, com imagem de câmara ou fotografia e malha 3D deformada pelo corpo. Não foi feito push Git, sincronização de tema nem publicação na Shopify.

## Associação aos produtos

O utilizador confirmou estes dois produtos separados:

- Secrets: `11569665933653`, ficheiro `assets/vto-secrets.glb`.
- Sinners: `11569666097493`, ficheiro `assets/vto-sinners.glb`.

Esses IDs têm associação explícita no início de `sections/product.liquid`. Não dependem do título, handle, tamanho ou cor. Os links do admin foram fornecidos e a ordem foi confirmada pelo utilizador; o browser disponível pediu autenticação, pelo que não foi inspecionado o admin nem alterado o catálogo.

Para reutilizar noutros produtos, escolher o produto correto em Product → Virtual try-on no editor, ou criar o metafield de produto `custom.try_on_model`, texto de uma linha, com `secrets` ou `sinners`. O seletor da secção tem precedência sobre o metafield do produto, que tem precedência sobre os IDs. Um valor não suportado no metafield impede o fallback por ID. Um metafield de variante com a mesma chave pode substituir o modelo da variante, se futuramente necessário; as duas peças atuais não precisam disso.

Um produto não associado não mostra o botão. As variantes continuam selecionadas pelo formulário original; o provador não muda o produto e não faz pedidos ao carrinho. O antigo seletor genérico de camisola e o atalho de compra dentro do modal foram substituídos por Voltar ao produto, evitando comprar uma variante diferente da peça apresentada.

## Funcionamento

- Abrir Try now using VR mostra um diálogo com o nome do produto, sem ativar a câmara nem carregar o motor pesado.
- Usar câmara pede vídeo, nunca áudio. Câmara frontal espelhada; botão para trocar de câmara. Cada imagem de fundo é a mesma enviada ao detetor, evitando desenhar uma pose atrasada sobre um frame novo.
- Escolher fotografia aceita JPG, PNG e WebP até 15 MB, respeita orientação e reduz o lado maior para 1800 px quando necessário. Não suporta HEIC diretamente.
- Pose Landmarker estima ombros, ancas, cotovelos e profundidade dos membros. A malha ajusta largura, comprimento, inclinação do tronco e orientação/escala das mangas. Câmara usa suavização temporal; fotografia usa a pose diretamente.
- Sem pose utilizável, a peça fica oculta e a interface pede melhor enquadramento. É necessário enquadrar ombros, ancas e cotovelos; não é um provador apenas de rosto.
- Ajustes visuais de largura/comprimento mantêm o produto. Não representam medidas reais dos tamanhos comerciais.
- Guardar imagem exporta o enquadramento mostrado, incluindo modelo e espelho, num JPEG local.
- Fechar, Escape, descarregar a secção ou ocultar a página com câmara ativa liberta câmara e recursos. O foco regressa ao botão. Reabrir cria um canvas novo porque o contexto WebGL anterior foi explicitamente libertado.

O nome comercial do botão foi preservado. Tecnicamente trata-se de uma sobreposição de realidade aumentada através da câmara, não de uma sessão de realidade virtual com headset.

## Arquitetura e calibração

`virtual-try-on.js` controla o diálogo, fontes, estados, geração de pedidos e limpeza. `vto-pose-worker.js` corre a inferência num worker e devolve o bitmap com os landmarks. `vto-fit.js` contém matemática independente do renderer. `vto-renderer.js` carrega GLB, respeita os bind matrices originais e aplica a deformação aos ossos; a imagem e a câmara ortográfica partilham o mesmo retângulo contain.

`vto-pose-processor.js` partilha a mesma inferência entre o worker e uma alternativa para browsers sem OffscreenCanvas. Nessa alternativa, a inferência continua local mas corre na thread principal com menor frequência. Passa-se um canvas explícito ao MediaPipe para não depender da deteção de Safari por user-agent, que pode tentar aceder a document dentro de um worker. WebKit de teste em Windows não disponibilizava OffscreenCanvas; esta alternativa foi implementada e testada, sem retirar o caminho mais eficiente dos browsers que o suportam.

Uma única `snippets/vto-import-map.liquid` no layout define os nomes `@incorrect/vto-*` com URLs `asset_url` versionadas. Definir o mapa não inicia downloads. Esta estrutura evita imports relativos sem a versão de cache da Shopify e mantém uma única cópia de Three.js. O worker recebe separadamente a URL versionada de MediaPipe, pois não herda o import map do documento. Segue a [recomendação Shopify para módulos sem bundler](https://shopify.dev/docs/storefronts/themes/best-practices/performance/use-import-maps-for-modules).

As âncoras dos modelos estão em metros, +Y para cima e +Z para a frente. Ombros anatómicos: ±0,235 m, altura 0,57 m; centro das ancas: altura 0,08 m. Vetor de braço na pose de referência: ±0,295 m, -0,20 m. A largura oversized externa do modelo não é a distância anatómica entre ombros. A calibração de profundidade combina projeção dos ombros e do tronco, para não colapsar quando a pessoa roda.

GLB corrigidos através do Blender MCP: Secrets 1 609 264 bytes, Sinners 1 447 120 bytes. Texturas incorporadas, seis ossos, menos de 40 mil triângulos por modelo. Toda a secção da extremidade das mangas tem peso 1 no respetivo braço; anteriormente a face inferior misturava pesos do tronco e esticava ao levantar o braço.

`scripts/refine-try-on-rig.py` documenta a alteração sobre cópias dos objetos originais. A cópia editável ficou em `artifacts/try-on/refined-models.blend`, com a cena de refinamento e dependências incorporadas; não substitui os originais nem contém alterações à cena original. `artifacts/` é ignorado por Git. Os três ficheiros que já estavam modificados no início e os GLB anteriores foram preservados em `artifacts/try-on/prior/`.

## Limites de fidelidade

É uma aproximação geométrica monocular, não um scan corporal nem uma simulação física de tecido. A malha deforma realmente no GPU; não é uma imagem plana a seguir uma caixa. A cabeça, pescoço, antebraços e mãos têm máscaras 3D aproximadas para preservar a pessoa à frente da roupa. Oclusões complexas, braços cruzados, perfil extremo, roupa original mais larga ou várias pessoas podem produzir artefactos. Não remove a roupa original nem gera pele por baixo dela. Não prometer tamanho certo, caimento comercial exato ou funcionamento perfeito em todas as poses.

## Privacidade e carregamento

Frames, fotografias e landmarks permanecem na memória do dispositivo. A implementação não faz uploads, não guarda biometria, não usa localStorage e só grava uma captura quando o utilizador pede. As permissões normais do browser continuam obrigatórias; a câmara exige HTTPS ou localhost. Não enviar media de clientes para serviços de IA como fallback.

Three.js e o bundle JS MediaPipe estão nos assets. Só depois da escolha de uma fonte são obtidos:

- WASM: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm`.
- Pose Full: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`.

Esses pedidos de recursos expõem os metadados normais de uma ligação HTTP aos respetivos fornecedores, mas não incluem a imagem. A interface informa sobre estes downloads. Uma Content Security Policy futura tem de permitir esses recursos, workers Blob e texturas Blob. Se forem bloqueados, mostrar erro recuperável; não enfraquecer a política global silenciosamente.

Uma inferência por vez, máximo 20 pedidos/s no worker CPU (8 pedidos/s na alternativa sem worker), renderização apenas após novo resultado/ajuste/resize e pixel ratio limitado a 1,5. A alternativa sem worker pode pausar brevemente a interface durante cada inferência. Não existe loop 3D permanente após fechar. A primeira utilização depende do download do modelo e WASM; não anunciar como instantânea ou offline na primeira visita.

## Desenvolvimento e testes

Não há bundler nem dependências de produção na raiz. Instalação isolada opcional, com versões fixas:

```powershell
npm install --prefix artifacts/try-on/runtime --no-audit --no-fund three@0.180.0 @mediapipe/tasks-vision@0.10.22-rc.20250304 liquidjs@10.21.1
node scripts/vendor-try-on.cjs
node --test tests/password-page.test.cjs tests/vto-fit.test.cjs tests/vto-models.test.cjs tests/vto-liquid.test.cjs
node scripts/vto-preview.cjs
```

O servidor de teste só escuta `127.0.0.1:4173`; não comunica com a Shopify. Usa o snippet Liquid e os assets reais com um produto fictício. `?model=sinners` seleciona Sinners. Não partilhar a pasta artifacts através de um servidor público.

Os scripts de browser precisam de Playwright e Chrome. `vto-integration-check.cjs` e `vto-video-check.cjs` aceitam `PLAYWRIGHT_MODULE_PATH`; o caminho de fallback corresponde ao runtime local usado nesta tarefa. Nenhum script ativa a webcam física. Fixtures públicas usadas, apenas em artifacts:

- `https://storage.googleapis.com/mediapipe-assets/pose.jpg`
- `https://storage.googleapis.com/mediapipe-assets/male_full_height_hands.jpg`
- `https://mediapipe.dev/images/mobile/pose_world_landmarks.mp4` — inclui a anotação de landmarks da demonstração original.

Com o servidor iniciado e as fixtures disponíveis:

```powershell
node scripts/vto-integration-check.cjs
node scripts/vto-integration-check.cjs --no-worker
node scripts/vto-video-check.cjs secrets
node scripts/vto-video-check.cjs sinners
node scripts/vto-browser-check.cjs sinners male_full_height_hands.jpg --mobile
node scripts/vto-browser-check.cjs sinners male_full_height_hands.jpg --mobile --webkit
shopify theme check --output json --no-color
git diff --check
```

Resultados locais de 2026-09-06:

- 28 testes Node: password sem regressões, enquadramento/espelho, âncoras, braços levantados/para a frente, orientação lateral, GLB reais, associação de produtos, JSON seguro EN/PT e mapa de módulos versionado.
- Chrome: fotografias com braços abertos e com um braço dobrado à frente do tronco; desktop e viewport 390×844 inspecionados visualmente.
- Câmara simulada com frames móveis: seguimento e espelho, câmara→foto, captura JPEG, Escape/foco, cleanup de workers/tracks, fecho durante permissão pendente, recusa de permissão recuperável e ausência de corpo. Nenhum pedido de upload observado.
- Os mesmos cenários passaram no caminho de compatibilidade sem worker em Chrome. WebKit 26.5 de teste passou as fotografias e a reabertura do provador em viewport mobile; não equivale a Safari num iPhone físico. Playwright WebKit e ferramentas auxiliares foram instalados na cache de testes local, não nos assets da loja.
- Vídeo de movimento real apresentado como MediaStream: Secrets 82 frames / 0 perdas; Sinners 81 frames / 0 perdas. Verificação da posição de um vértice real da manga contra a matriz de deformação em todos esses frames; amplitude angular superior a 0,6 rad nas últimas execuções. Estes números correspondem ao ensaio local, não a uma garantia estatística para todos os corpos.
- Inferência na máquina de teste: cerca de 55–65 ms/frame depois do arranque numa primeira execução; outras execuções chegaram a cerca de 110–200 ms/frame. O browser de teste usou WebGL por software e o arranque foi mais lento. Estes ensaios não são um benchmark de telemóveis nem uma promessa de FPS.
- Theme Check: 0 erros e 10 avisos pré-existentes. Não comprova compatibilidade com todo o hardware.

Ainda não houve validação em câmara física, Safari/iPhone/Android ou preview remoto do tema. Antes de publicar, testar esses dispositivos com as duas páginas reais, movimentos laterais/levantamento dos braços, erros/permissões, mudança de orientação e recarregamento no editor. Qualquer sincronização/publicação exige alvo e autorização confirmados. Não iniciar uma integração de checkout ou recomendar tamanhos com base neste modelo.

## Dependências e fontes

Three.js 0.180.0: MIT, licença em `docs/licenses/Three-LICENSE.txt`. MediaPipe Tasks Vision 0.10.22-rc.20250304: Apache-2.0, licença do projeto em `docs/licenses/MediaPipe-LICENSE.txt`. As licenças acompanham também os bundles distribuídos; imports e referências de source maps foram adaptados para Shopify. O script de vendorização regista hashes em `artifacts/try-on/vendor-hashes.json`.

Referências técnicas: [Pose Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html) e [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).
