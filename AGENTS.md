# Contexto de trabalho — Incorrect Society

## Objetivo e âmbito

Este repositório contém o tema Shopify da loja de roupa Incorrect Society. Não é uma aplicação React/Next.js, uma app Shopify com backend, nem um projeto Expo. Manter a identidade visual e o funcionamento da loja ao desenvolver novas funcionalidades.

Contexto verificado em 2026-09-02, no commit `d023630` de `main`. Consultar `docs/ESTADO-DO-PROJETO.md` para diagnóstico, evidências, prioridades de segurança/performance e plano de evolução. Esse relatório é uma fotografia histórica, não uma lista de problemas necessariamente ainda presentes: confirmar no código antes de agir.

Comunicar com o utilizador em português de Portugal. Distinguir sempre funcionalidades encontradas no código de comportamentos efetivamente testados na Shopify.

## Stack e organização

- Tema Shopify com Liquid, templates JSON, schemas de secções/blocos, CSS e JavaScript nativo.
- Sem `package.json`, bundler, framework frontend, backend próprio ou suíte de testes versionada na data da análise.
- `layout/theme.liquid`: layout principal, variáveis CSS, metadados, traduções JS, loader, announcement, grupos de header/footer e modal newsletter.
- `layout/password.liquid`: página de pré-lançamento independente, com formulário e countdown próprios. O `content_for_layout` está comentado; não assumir que `sections/password.liquid` é a interface visível.
- `templates/`: composição das páginas; muitos JSON são geridos pelo editor Shopify.
- `sections/`: HTML/Liquid e grande parte do CSS/JS das funcionalidades.
- `snippets/`: unidades reutilizáveis; `blocks/`: blocos de tema `group` e `text`.
- `assets/critical.css`: estilos globais carregados em todas as páginas, incluindo regras de componentes antigos. Há também CSS local e inline nas secções.
- `config/settings_schema.json`: opções disponíveis no editor. `config/settings_data.json`: valores e estado guardados da loja, não um ficheiro de defaults descartável.
- `locales/en.default.json` e `locales/pt-PT.json`: traduções da montra. `locales/en.default.schema.json`: traduções do editor.
- `.theme-check.yml`: `theme-check:recommended`. `.shopify/`: cache local ignorada pelo Git; não é fonte de verdade para o catálogo.

## Mapa das funcionalidades

| Área | Entrada / implementação |
| --- | --- |
| Homepage | `templates/index.json`: `full-width-images` → `new-arrivals-grid` → `hero-slider-gallery` |
| Shop / todos os produtos | `templates/page.all-products.json`: hero → `new-in-products` → `old-collections` → galeria |
| Coleção | `templates/collection.json` → `sections/collection.liquid`, paginação de 12 produtos |
| Produto | `templates/product.json` → `sections/product.liquid` + `sections/related-products.liquid` |
| Carrinho | `sections/header.liquid` para drawer; `sections/cart.liquid` para página completa |
| Pesquisa | pesquisa preditiva no header; `sections/search.liquid` para resultados paginados |
| Tamanhos | `sections/sizing-guide.liquid`, popup em `product.liquid`, dados em `snippets/size-measurements.liquid` |
| Newsletter | `sections/footer.liquid`, `snippets/newsletter-modal.liquid`, `snippets/newsletter-content.liquid` |
| Páginas informativas | `sections/policy-page.liquid` escolhe o snippet pelo `page.handle` |
| Magazine | `templates/page.magazine.json` → `sections/news-magazine.liquid` |
| Blog / artigo | `sections/blog.liquid` / `sections/article.liquid` |
| Gift card emitido | `templates/gift_card.liquid`, documento independente com `{% layout none %}` |
| Música | `snippets/music-player.liquid`, renderizado no footer |

Não confundir `sections/product-grid.liquid` com a grelha ativa da homepage. Não confundir `sections/sidebar-navigation.liquid` com o menu mobile atual, implementado no header. Ambos existem, mas não estão ligados aos templates/grupos atuais. `sections/cart-inventory.liquid` é usado por pedido HTTP de Section Rendering, mesmo sem referência Liquid direta. Não apagar ficheiros apenas por uma pesquisa de `render` não encontrar usos.

## Contratos de dados a preservar

- O catálogo, inventário, encomendas, clientes, descontos, portes, menus, páginas e imagens `shopify://` vivem na Shopify. O repositório não contém um ambiente completo da loja.
- `settings.current_collection` aponta atualmente para `female-anxiety`. A coleção da homepage é uma opção separada, em `templates/index.json`; não assumir sincronização automática.
- Referências existentes incluem coleções `female-anxiety`, `accessories`, `gift-cards`; páginas `all-products`, `newsletter`, `contact-us`, `shipping-policy`, `return-policy`, `terms-of-service` e referências a `news`. Confirmar handles e atribuição de templates no admin antes de mudar navegação.
- Metafields de produto consumidos: `custom.details`, `custom.model_info`, `custom.badge` e `custom.type`. O último alimenta filtros `?type=hoodie` / `?type=t-shirt`; não confundir com o campo nativo `product.type`.
- O guia suporta `tshirt`, `longsleeve`, `babytee`, `hoodie`. A fonte numérica está em `size-measurements`; conversão para polegadas por divisão por 2,54. Não alterar medidas/legendas sem confirmação da marca.
- `settings.gift_card_product_handle` identifica o produto gift card usado para ilustrar o cartão emitido.
- Newsletter usa formulários nativos `customer`, com tags `newsletter_modal`, `newsletter_footer`, `newsletter_page`. Entrega de email, confirmação e desconto de 10% são dependências externas, não funcionalidades implementadas aqui.
- Contacto usa formulários nativos `contact`; existe mais de um template legado. Preferir o caminho `page.contact-us` → `policy-page` → `contact-us-content` quando for o efetivamente atribuído.
- Playlist: até 50 pares `music_track_N_name` / `music_track_N_url`, com fallback no snippet e estado `musicPlayer*` em `localStorage`.

## Contratos JavaScript e carrinho

- `window.themeStrings` é criado no layout com traduções serializadas por `| json`.
- `window.loadingScreen.show()/hide()` é definido no snippet do loader.
- `window.addToCartAndUpdate(formData)` é definido no header e consumido pelo produto e pelas compras rápidas. A implementação atual tem falhas documentadas: não copiar o seu tratamento de erros como padrão correto.
- `window.showError(message)` apresenta notificações de erro.
- Eventos atuais: `cartUpdated` com `detail: { cart, source }`, e `cartCleared` com `detail: { source }`; fontes existentes `sidebar` e `main`. Preservar consumidores ou migrá-los em conjunto.
- `cart-inventory` devolve `#inventory-data` com `items` indexados por `item.key`. O JSON normal de `/cart.js` não equivale ao objeto Liquid `item.variant`.
- Alterar/remover linhas por `item.key`, não apenas pelo ID da variante, para distinguir propriedades/descontos distintos.
- Numa alteração ao carrinho, verificar os dois carrinhos e os seis caminhos de quick add: coleção, pesquisa, new arrivals, new in, old collections e product grid.
- Preferir rotas localizadas (`routes.*` em Liquid; `window.Shopify.routes.root` em JS). Os caminhos absolutos existentes são dívida técnica, não convenção a replicar.
- Tratar `response.ok`, mensagens de erro, cliques concorrentes, falha de rede e reconciliação com a resposta do servidor. Não indicar sucesso só porque `fetch` resolveu.
- Não confiar no DOM, no countdown ou em validações de stock do browser como barreira de segurança. A Shopify mantém a autoridade sobre compra, preços e inventário.

## Acesso à montra — comportamento confirmado em 2026-09-03

- Countdown desativado: ocultar contador e ENTER, manter input de password e botão de submissão manual, independentemente da data de abertura. Não preencher automaticamente a password neste estado.
- Countdown ativo antes da abertura: mostrar contador, input e botão de submissão manual.
- Countdown ativo a partir da abertura (incluindo igualdade): ocultar contador/input, preencher a password configurada e mostrar ENTER. A submissão exige clique; não há navegação automática.
- Preservar `false` em `password_timer_enabled` com `allow_false: true` e serializar o booleano com `json`. O modo desativado tem precedência sobre a data.
- O preenchimento automático faz parte do comportamento explicitamente pedido pelo utilizador; a ressalva de exposição no cliente continua documentada no relatório. Não remover esta funcionalidade sem acordo.
- `password_show_visitor_message` (checkbox em Password Page, ativo por defeito) mostra `shop.password_message` abaixo do logótipo, com a fonte herdada da página. É a mensagem definida no admin em Acesso à loja → Mensagem para os seus visitantes, e não a descrição SEO da loja. Desligado ou com mensagem vazia, não renderiza o parágrafo. É independente do estado do countdown; o texto é escapado e mantém quebras de linha.
- Testes locais sem dependências: `node --test tests/password-page.test.cjs`. Usam o script real com configuração fictícia, DOM e relógio simulados; não autenticam na Shopify.

## Convenções para novas alterações

### Provador virtual — V2 publicada em 2026-09-08

Consultar `docs/TRY-ON-V2.md` para arquitetura, medidas, evidências e validações pendentes. `docs/TRY-ON.md` preserva a primeira versão como histórico. A V2 parte do redesign do utilizador (`ff35b21`), preserva as alterações posteriores do editor (`fdcb920`) e foi publicada com autorização explícita pelo commit `204c4f6` em `main`. Confirmada no tema live `incorrect-society-shop/main`, ID `184958812501`, loja `uuxj91-bd.myshopify.com`: os 21 ficheiros de tema alterados coincidem com o commit. Definições, template/secção de produto e layout foram preservados. Para desligar globalmente: Definições do tema → Virtual Try-On → **Enable Virtual Try-On (VR)** (`settings.enable_virtual_try_on`).

- Entrada: `sections/product.liquid` → `snippets/virtual-try-on-modal.liquid`, isolado por `section.id`; controlador `assets/virtual-try-on.js`, estilos `assets/virtual-try-on.css`.
- Produtos distintos, confirmados pelo utilizador: ID `11569665933653` = Secrets; ID `11569666097493` = Sinners. Não inferir a peça pelo título ou cor. Fallback por estes IDs; `custom.try_on_model` do produto substitui o fallback, os seletores de produto da secção têm precedência e o metafield da variante pode substituir o modelo dessa variante. Valores válidos: `secrets`, `sinners`.
- Apenas produtos explicitamente associados mostram o botão. O redesign do utilizador permite escolher outra peça, variante e adicionar ao carrinho dentro do modal. Preservar esse fluxo e o formulário original. O POST usa o ID exato da variante ativa e emite `cartUpdated` com `source: 'try-on'` após obter o carrinho confirmado. Falhas 422, atualização falhada e resultado de rede incerto têm tratamentos distintos; nunca repetir um POST automaticamente.
- `loadedModelKey` tem de coincidir com `modelKey` antes de renderizar/capturar. Uma troca de GLB falhada não pode voltar a mostrar a peça anterior ao mudar de tamanho. Revisões descartam carregamentos antigos; nova fonte permite tentar recuperar. Reabrir regressa ao produto da página e à variante do seu formulário.
- Câmara/fotografia e medidas processadas no dispositivo. Não enviar imagens, landmarks, perfis ou capturas para servidores. Pedir acesso à câmara apenas após clique em Usar câmara; terminar tracks, ambos os workers, frames e recursos 3D ao fechar/descarregar a secção. Não ativar uma câmara real durante testes automatizados. Medidas ficam em memória/DOM, não em localStorage; existe controlo para limpar.
- Modelo 3D e dependências pesadas só carregam depois de escolher uma fonte. Three.js 0.180.0 e MediaPipe Tasks Vision 0.10.22-rc.20250304 vendorizados em `assets/vto-*`; WASM, Pose Lite (vídeo), Pose Full (fotografia) e Selfie Multiclass 256 são obtidos de URLs fixas Google/jsDelivr. O processador prefere GPU disponível e não software, com alternativa CPU na falha de inicialização. Licenças e reprodução em `docs/TRY-ON.md` e `scripts/vendor-try-on.cjs`.
- `layout/theme.liquid` inclui uma única `vto-import-map`; os nomes `@incorrect/vto-*` resolvem para `asset_url` versionadas, sem download antecipado. Não voltar a imports relativos sem versão nem duplicar Three.js; o worker recebe a URL versionada do bundle MediaPipe porque import maps do documento não se aplicam a workers.
- `vto-pose-worker.js` serve dois workers independentes: pose/contorno atual da pessoa e classificação semântica mais lenta. Cada bitmap acompanha os seus landmarks. `vto-fit.js` usa o mesmo enquadramento contain; espelho selfie troca atribuições anatómicas. Sem OffscreenCanvas os processadores correm na thread principal e podem pausar a interface; não equivalem em performance aos workers nem comprovam comportamento num iPhone físico.
- Nunca voltar a recortar a malha por cilindros/esferas de braços/mãos. `vto-occlusion.js` extrai apenas píxeis observados de pele/cabelo/face/acessórios com confiança elevada e região anatómica válida. `vto-foreground.js` reprojeta uma classificação recente, usa os píxeis do frame atual e exige acordo de aparência e contorno atual da pessoa. Evidência incerta mantém a peça inteira. Falha do segmentador avisa que a peça pode tapar as mãos e permite nova tentativa.
- GLB em metros, +Y para cima, +Z frente; ossos `root`, `spine`, `chest`, `neck`, `upper_arm.L/R`. O loader pode retirar os pontos dos nomes. Âncoras do rig original: ombros ±0,235 m / altura 0,57 m; ancas 0,08 m. No ajuste físico, os pivôs das mangas são recalculados para as articulações da pessoa no espaço da peça, sem comprimir a cava para a largura do corpo. Bases ortogonais de escala uniforme são exigidas pelo skinning de volume.
- As mangas foram reponderadas através do Blender MCP: toda a extremidade acompanha o respetivo braço, incluindo a face inferior. Testes inspecionam os GLB reais. Não voltar a misturar pesos do tronco na extremidade das mangas. `solveFit().sleeveBends` acrescenta uma dobra contínua a partir do cotovelo observado, orientada para o pulso, apenas no tecido de manga que chega a essa região. `bendSleevePoint` nos alvos CPU e `vtoBendSleeve` no shader têm de concordar. Uma dobra legítima pode alterar a silhueta da manga; o teste de ausência de buracos distingue essa alteração da perda de opacidade no tronco.
- `size-measurements.liquid`, ação `json`, é a fonte única das cinco medidas reais S/M/L/XL. `vto-sizing.js` compara com uma T-shirt do utilizador ou peito/folga; não inventa tamanhos nem troca silenciosamente uma recomendação esgotada por outra. A escala visual pode ser calibrada pela largura entre articulações dos ombros; sem essa medida usa uma referência anatómica aproximada de 42 cm. Não usar a escala absoluta dos world landmarks monoculares como medida real: corpos subestimados pelo detetor faziam a roupa crescer. Não confundir largura plana com perímetro do peito; a tabela não foi alterada nesta correção.
- `vto-cloth.js` usa 845 pontos de superfície ligados pela topologia, gravidade/inércia, restrições XPBD e contacto aproximado com o tronco. `vto-skinning.js` preserva volume com quaterniões duais no caminho físico. Não é uma simulação validada de moldes/tecido da marca, remoção generativa da roupa original ou garantia de tamanho ideal. A recomendação compara medidas; os parâmetros de tecido ainda são aproximados.
- GLB principal e LOD leve preservam estampados e esqueleto. Pointer coarse e informação de hardware ausente selecionam um perfil automático conservador; não assumir que deviceMemory ausente no iPhone significa capacidade elevada. Câmara pede 640×480/24 fps (máximo 30) e o bitmap transferido é limitado a 640 px; pose de vídeo a 384 px, com alinhamento de quatro píxeis. Inferência e segmentação deixam tempo ocioso proporcional ao custo medido. Modo leve usa DPR 1, sem MSAA, uma etapa/duas iterações de tecido por pose; fotografias mantêm dez etapas de assentamento. O seletor manual preserva peça, medidas e fonte. Emulação com CPU limitada não equivale ao hardware/temperatura de um telemóvel.
- Testes: `node --test tests/*.test.cjs` (61 passaram; Liquid requer dependência isolada documentada). Scripts locais de integração, comércio simulado, resiliência, oclusão, vídeo e performance em `scripts/vto-*.cjs`; nunca usam câmara real, carrinho real ou uploads. O primeiro teste físico do utilizador em iPhone 15 Pro Max identificou lentidão/aquecimento, escala excessiva e falta da dobra da manga. As correções têm regressões locais e ensaio GPU Intel, não aprovação térmica em iPhone. `vto-device-budget-check.cjs --gpu` valida capacidades semelhantes às expostas pelo iPhone e recursos efetivamente carregados, usando vídeo público. Consultar `docs/TRY-ON-V2.md` para publicação e novo teste físico pendente.

### Regras gerais

1. Ler os templates, secções, snippets e consumidores relevantes antes de editar; preferir alterações pequenas e coerentes com o tema.
2. Não introduzir uma framework ou pipeline de build sem necessidade concreta e acordo do utilizador.
3. Usar `section.id` e seletores locais para novas instâncias de componentes. Evitar IDs globais repetidos e inicializações duplicadas.
4. Tornar novas inicializações compatíveis com carregamento normal e recarregamento no editor (`shopify:section:load`); limpar listeners/observers quando necessário.
5. Liquid não é avaliado dentro de `{% javascript %}` / `{% stylesheet %}`. Passar dados dinâmicos por atributos ou JSON; usar `{% style %}` quando CSS precisar de Liquid.
6. Escapar texto/atributos com `escape`; serializar dados JS com `json`, respeitando o contexto HTML. Preferir `textContent`/DOM seguro a interpolar dados em `innerHTML`. Manter HTML editorial intencional separado de texto simples.
7. Para novo texto de interface, acrescentar chaves EN e PT. Textos fixos existentes não justificam aumentar a inconsistência.
8. Preservar a identidade atual: Century Gothic, branco/preto, acento bordô, fotografia de grande formato e composição minimalista. As opções globais de cor/fonte do schema não comandam todos os estilos: ler `css-variables` e CSS local.
9. Usar imagens responsivas; carregar prioritariamente apenas a imagem principal visível e adiar media abaixo da dobra. Respeitar teclado, foco, leitores de ecrã e movimento reduzido.
10. Não colocar segredos em settings, Liquid ou JavaScript enviados ao browser. Não reproduzir a palavra-passe de acesso da montra em documentação, logs ou exemplos.
11. Atualizar este contexto quando mudar um contrato ou ponto de entrada. Manter resultados históricos no relatório datado.

## Desenvolvimento e validação

Na análise estavam disponíveis Node `22.16.0` e Shopify CLI `3.83.3`. Verificar versões no ambiente atual; não atualizar ferramentas globais automaticamente.

Comandos locais, na raiz:

```powershell
git status --short
shopify version
shopify theme check --output json --no-color
git diff --check
git diff --stat
```

Não existe `npm test` / `npm run build` neste checkout. Desde 2026-09-03 existem testes locais da página de password, executados com `node --test tests/password-page.test.cjs`. Os JSON Shopify têm comentários; `en.default.json` também tem uma vírgula final aceite pelo parser do Theme Check usado. Um `JSON.parse` estrito isolado não substitui validação Shopify.

Baseline de 2026-09-02: Theme Check com 0 erros e 10 avisos, todos já existentes. Validar novamente e não mascarar novos problemas desativando regras. A aprovação do linter não comprova fluxos de compra, segurança ou performance real.

Preview, apenas depois de confirmar loja, acesso e tema de desenvolvimento:

```powershell
shopify theme dev --store <loja-confirmada>.myshopify.com
```

Este comando sincroniza um tema de desenvolvimento remoto; não é apenas um servidor estático local. Não o executar automaticamente numa tarefa apenas de análise. Nunca executar `theme push`, `theme publish`, `theme pull`, comandos com `--live` ou um push Git com potencial de publicação sem autorização e alvo confirmado.

Checklist proporcional a qualquer feature:

- Desktop e mobile: homepage, Shop, coleção, produto, pesquisa, carrinho e páginas afetadas.
- Variantes: opção única, cor/tamanho em ordens distintas, combinação inexistente, esgotado, gift card.
- Carrinho: adicionar por produto/quick add, aumentar/reduzir/remover/limpar, erro 422, offline, cliques rápidos, descontos e sincronia drawer/página.
- Idiomas EN/PT e moeda/mercado aplicáveis; testar URL com locale.
- Teclado, Escape, foco e reabertura de overlays; inicialização no editor.
- Newsletter/contacto: sucesso, erro e challenge apenas em ambiente de teste autorizado; não subscrever emails reais nem criar encomendas durante uma análise.
- Medir performance antes/depois numa preview comparável quando forem alterados media, CSS, JS ou integrações.

## Git, dados gerados e publicação

`main` recebe commits de `shopify[bot]`, incluindo alterações a settings em 2026-09-02. Tratar a ligação GitHub–Shopify como potencialmente ativa; confirmar qual tema/branch é publicado antes de qualquer push.

Preservar alterações do utilizador e do editor. Não substituir em massa `settings_data.json`, IDs de blocos, `block_order`, templates ou grupos. Criar branches `codex/...` quando for pedido trabalho numa branch; não fazer commit/push automaticamente. Não versionar `.shopify/`, credenciais ou exportações de clientes.

O README original contém estrutura e assets desatualizados. Usar o código e este documento como contexto inicial, verificando sempre o estado atual.
