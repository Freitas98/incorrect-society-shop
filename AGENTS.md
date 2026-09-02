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
