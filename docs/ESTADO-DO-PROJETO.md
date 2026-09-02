# Estado do projeto — Incorrect Society

Análise de referência: 2026-09-02 · commit `d023630` · branch `main`.

Atualização de 2026-09-03: corrigida localmente a precedência do modo countdown desativado e a preservação do booleano `false` na página de password. Countdown ativo mantém entrada manual antes da abertura e ENTER com preenchimento automático depois, conforme pedido do utilizador. Adicionados testes em `tests/password-page.test.cjs`; não houve publicação ou validação de autenticação real na Shopify. Os resultados abaixo continuam a descrever a análise original. O preenchimento automático foi mantido intencionalmente; a ressalva de segurança relativa à password enviada ao cliente continua aplicável.

Também adicionada a opção `password_show_visitor_message`, em Password Page, para mostrar a mensagem nativa da página de acesso (`shop.password_message`) abaixo do logótipo e com a mesma fonte. Esta é a mensagem definida no admin em Acesso à loja → Mensagem para os seus visitantes; não é a descrição SEO da loja. Ativa por defeito; sem mensagem ou com a opção desativada, o parágrafo não é renderizado. Foram acrescentadas verificações estruturais do schema, condição, escape e tipografia aos testes locais; a apresentação com os dados reais da loja precisa de confirmação em preview.

## 1. Conclusão

A loja tem um tema Shopify personalizado com as principais áreas de uma loja de roupa já implementadas: catálogo, produto, variantes, compra rápida, carrinho, pesquisa, tamanhos, newsletter, gift cards e conteúdo editorial. Não é apenas um protótipo visual.

O maior obstáculo a novas features é a manutenção dos fluxos existentes: lógica repetida entre grelhas, carrinho dividido entre dois componentes, pressupostos sobre variantes, configurações que não controlam a interface e dependências do admin não documentadas anteriormente. Recomendo estabilizar compra e acesso à montra antes de funcionalidades que aumentem a complexidade desses fluxos.

Esta é uma análise do repositório, com validação estática e reproduções locais controladas. Não confirma que o checkout real, os emails, os portes ou todas as páginas estejam operacionais na loja publicada. Não foram feitas encomendas, subscrições, alterações no admin ou deploys.

## 2. Cobertura e verificações

Foram inventariados os 108 ficheiros versionados: 29 secções, 17 snippets, 25 templates, 2 layouts, 2 blocos, 3 locales, 2 ficheiros de configuração, 22 assets e 6 ficheiros na raiz. A análise cruzou composição dos templates, referências, schemas, traduções, JavaScript, estilos, assets, dados guardados e histórico Git.

| Verificação | Resultado |
| --- | --- |
| Estado Git inicial | Sem alterações locais |
| Shopify CLI instalada | 3.83.3 |
| `shopify theme check --output json --no-color` | Exit 0; 0 erros, 10 avisos |
| JSON/configuração | 28 ficheiros JSON/webmanifest e 29 schemas Liquid analisados com tolerância a comentários/vírgula final |
| Referências estáticas literais | Sem secções, snippets ou assets locais em falta nas referências analisadas; não valida URLs/CDN nem referências dinâmicas |
| Traduções | 277 chaves-folha em EN e 277 em PT, sem diferenças de chaves; sem chaves literais `t` em falta no levantamento |
| JavaScript sem Liquid | 19 blocos passaram compilação sintática em Node; 9 dependentes de Liquid ficaram fora desse teste |
| Reprodução de falhas | 3 problemas confirmados executando funções do código com mocks locais |
| Automação versionada | Sem suíte de testes, `package.json` ou workflow CI encontrado |
| Performance de produção | Não medida; sem Lighthouse, waterfall, dados reais de utilizadores ou checkout testado |

Os 10 avisos do Theme Check distribuem-se por `layout/theme.liquid` (3 assets remotos), `snippets/pagefly-main-js.liquid` (5: asset remoto, nomes de variáveis e filtros antigos), `snippets/music-player.liquid` (1) e `sections/product.liquid` (1). Parte dos avisos pertence a código sem ligação estática ao layout atual; não confundir o número com dez falhas visíveis.

Nota sobre JSON: `locales/en.default.json:258` tem uma vírgula final. O parser do Theme Check instalado aceita-a. Não foi classificada como erro de produção só porque um parser JSON estrito a rejeita.

## 3. Arquitetura e estado funcional

### Estrutura principal

O tema é renderizado pela Shopify. O layout principal monta o header, a página e o footer; o JavaScript melhora a interação no browser. Não existe backend de negócio neste repositório. Pagamentos, inventário, clientes, consentimentos guardados, descontos e entrega de emails dependem da plataforma e/ou de apps.

`assets/critical.css` tem cerca de 37,4 kB de fonte não comprimida. Os maiores ficheiros Liquid são header (~63 kB), guia de tamanhos (~52 kB), produto (~50 kB), carrinho (~36 kB) e grelhas (~21–36 kB). Estes tamanhos misturam HTML, CSS, JS e schema: não representam bytes transferidos por página nem demonstram, por si só, lentidão.

### Catálogo e merchandising

- Homepage atual: imagem principal, grelha da coleção `female-anxiety` com limite de 12 produtos e galeria editorial de cinco slides.
- Página Shop: hero, coleção atual com limite de 12 produtos, restantes produtos com limite de 24 e galeria.
- Coleções e pesquisa têm paginação de 12 resultados; blog, de 9 artigos.
- Existem badges, imagens de hover, indicação de cores e compra rápida. As cores nas grelhas são indicadores visuais, não um seletor completo de variante.
- Os filtros de tipo usam `custom.type`; os de tamanho na homepage fazem pedidos adicionais de produto. Filtram os cartões carregados, não todo o catálogo no servidor.
- `old-collections` percorre `collections.all.products` sem paginação. À medida que o catálogo crescer, a combinação de limites, exclusão da coleção atual e filtragem no browser pode deixar produtos fora de Shop. A coleção paginada continua a ser um caminho distinto.
- `related-products` escolhe produtos por coleção, com regra especial para gift cards/acessórios; não usa uma integração de recomendações personalizadas.

### Produto, tamanhos e carrinho

Há galeria com miniaturas, zoom/lightbox, variantes, preço, detalhes e informação do modelo via metafields. O guia de tamanhos tem uma fonte central de valores e quatro famílias de peças, apresentada na página e no popup.

O carrinho tem duas implementações: drawer no header e página completa. Comunicam por `cartUpdated` / `cartCleared`. O header também fornece a função global de adição e consulta uma secção auxiliar para inventário. Esta concentração faz com que uma alteração aparentemente local no header possa afetar compras em todo o site.

### Marca, conteúdo e comunicação

- Identidade visual atual: Century Gothic, branco/preto, bordô, imagens grandes, header fixo com contraste adaptativo.
- Magazine permite YouTube, Spotify, social, arquivo e artigos; conteúdo é configurado no editor, não sincronizado automaticamente das redes.
- Há três entradas de newsletter com formulários Shopify e promessa de 10% de desconto. Não há implementação local do envio desse desconto.
- O footer inclui o leitor de música em todas as páginas que usam o layout principal. A playlist é configurável e persiste em `localStorage`.
- Contacto, políticas e newsletter dependem de páginas existentes e dos respetivos handles. Há caminhos de contacto duplicados e fallbacks de subscribe/unsubscribe/challenge que precisam de confirmação na Shopify.
- O magazine tem template e conteúdo, mas o link News no header/mobile está comentado; confirmar se se pretende tornar esta área acessível na navegação.

### Configuração e conteúdo externos

`settings_data.json` contém uma data de abertura futura (`2026-10-01T20:00:00+00:00`) e timer ativo. Confirmar o horário comercial pretendido e o fuso: a string é UTC, não uma indicação automática de hora local de Lisboa.

O código não permite confirmar: tema publicado, loja/preview de destino, ativação da password, produtos/variantes reais, Markets/idiomas ativos, páginas atribuídas, portes, impostos, descontos, apps ativas, analytics, política de cookies ou entrega de emails. A coleção da homepage e `settings.current_collection` são configuradas separadamente.

## 4. Problemas prioritários

Prioridades: P1 = resolver antes de expandir a área afetada; P2 = próximo ciclo de qualidade; P3 = manutenção. Esforço B/M/A = baixo/médio/alto relativo, sem compromisso de prazo e dependente da validação na Shopify.

### P1 — Palavra-passe da montra presente no cliente

Evidência: `layout/password.liquid:320` coloca `settings.password_auto_password` numa constante JavaScript; a opção e um valor estão versionados em `config/settings_schema.json:921` e `config/settings_data.json:54`.

O countdown decide quando preencher o formulário, mas a palavra-passe já foi entregue ao browser antes disso. Se corresponder à password ativa da montra, a proteção do pré-lançamento fica contornável. Isto não é uma credencial de administração Shopify, nem prova acesso a dados de clientes.

Recomendação: deixar de enviar essa password ao cliente, remover o segredo de configurações/versionamento futuro e trocar a password no admin se ainda for válida. Tratar a abertura como alteração autorizada da proteção Shopify, não como lógica de segurança no relógio do visitante. Rotação/admin e eventual tratamento do histórico exigem confirmação do responsável. Esforço M. [Proteção da montra na Shopify](https://help.shopify.com/en/manual/online-store/themes/password-page).

### P1 — Falhas ao adicionar ao carrinho podem parecer sucesso

Evidência: `sections/header.liquid:1858` faz parse da resposta de `cart/add.js` sem verificar `response.ok`, ignora o resultado e consulta o carrinho. `sections/product.liquid:1495` apresenta sucesso quando essa promessa resolve. Fallbacks de quick add repetem o padrão.

Reprodução local: uma resposta simulada HTTP 422 à adição, seguida de um carrinho vazio válido, resolve a função com sucesso e emite `cartUpdated`. Nenhum pedido à loja foi feito.

Recomendação: centralizar pedidos, validar status/payload, apresentar erro traduzido e só confirmar adição após sucesso real. Distinguir “adição efetuada mas atualização visual falhou” de “adição falhou”, evitando incentivar duplicações. Esforço M.

### P1 — Seleção de variantes pode comprar a opção errada

Evidência: `sections/product.liquid:214` procura imagens de cor sempre em `option1`; `sections/product.liquid:1434` não trata a ausência de uma combinação correspondente.

Reprodução local: quando a variante existente é Blue/S e o cliente seleciona Blue/XL inexistente, o seletor oculto continua em Blue/S e o botão permanece ativo. Para cores noutra posição, os swatches podem nem ser renderizados.

Recomendação: usar a posição real de cada opção, resolver a combinação completa, limpar/desativar o ID quando não existir e sincronizar preço, disponibilidade, imagem e URL da variante. Esforço M.

Compra rápida: em `sections/collection.liquid:613` e implementações equivalentes, a deduplicação apenas por tamanho conserva a primeira variante desse tamanho. Se uma cor estiver esgotada e outra não, pode desativar um tamanho disponível; também pode adicionar uma cor não escolhida. Definir o comportamento de cor/tamanho antes de alargar o catálogo. Esforço M.

### P1 — Quantidades e recuperação de erros inconsistentes

Evidência: drawer usa `cart/update.js` em `sections/header.liquid:1764`, com verificação local de stock comentada perto de 1706 e sem validar status HTTP. A página usa o mesmo endpoint em `sections/cart.liquid:860`. Ao remover, `cart.liquid:925` retira o cartão do DOM após 300 ms, mesmo se a operação falhar; no erro de quantidade repõe o número, mas não todos os totais otimistas.

Recomendação: usar `change.js` com a chave da linha para mudanças de quantidade, serializar alterações, reconciliar preços/quantidades com o servidor e repor a interface completa em caso de falha. A Shopify documenta que `update.js` não valida stock de variantes já no carrinho. Isto é um risco de inconsistência no carrinho, não prova de venda concluída acima do stock. Esforço M. [Cart API](https://shopify.dev/docs/api/ajax/reference/cart).

### P2 — Construção de HTML precisa de reforço

Evidência: resultados preditivos (`sections/header.liquid:1431`), drawer (`header.liquid:1579`) e botões de quick add interpolam títulos/opções/URLs em `innerHTML`. Formulários como `snippets/contact-us-content.liquid:35` devolvem valores em atributos sem `escape` explícito.

Não foi demonstrada exploração na loja. O risco depende da origem dos valores e do tratamento efetuado pela Shopify, mas as saídas não impõem uma fronteira local clara entre texto e HTML.

Recomendação: criar elementos e usar `textContent` para texto; aplicar escape contextual em Liquid, validar destinos e reservar HTML livre para conteúdo editorial intencional. Não aplicar `escape` indiscriminadamente a descrições rich text. Esforço M. [OWASP: prevenção de DOM XSS](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html).

### P2 — Traduções e moeda não são consistentes

As 277 chaves estão alinhadas, mas produto, navegação, newsletter, filtros e mensagens do carrinho ainda incluem inglês fixo. O snippet `price` e formatadores JavaScript fixam EUR, enquanto outras secções usam `money`; pedidos `/cart...`, `/products...` e `/search...` ignoram o prefixo do idioma.

Recomendação: completar EN/PT e unificar apresentação monetária usando a moeda da sessão. Caso a loja seja exclusivamente EUR, documentar essa decisão; não anunciar suporte multimoeda sem o testar. Usar rotas localizadas. Esforço M. [URLs localizadas da Ajax API](https://shopify.dev/docs/api/ajax#locale-aware-urls).

### P2 — Editor e configurações não refletem sempre o comportamento

- `snippets/css-variables.liquid` fixa cores, fonte, margens e raio, ignorando várias opções globais declaradas.
- `header.logo` e `header.tagline` estão no schema, mas não controlam o markup atual; `footer.show_payment_icons` também não é aplicado. `footer-group.json` conserva um `menu` já ausente do schema.
- `password_timer_enabled | default: true` não preserva explicitamente `false`; rever com `allow_false`/serialização adequada. A página de password não apresenta `form.errors` no formulário visível.
- Muitas inicializações dependem apenas de `DOMContentLoaded` e selecionam a primeira secção por classe. Não há tratamento explícito de `shopify:section:load` encontrado.
- `news-magazine.liquid:21` repete `id="filter-btn"` seis vezes. O schema aceita Vimeo, mas o renderer constrói sempre um embed YouTube.

Recomendação: alinhar opções expostas com o código e tornar componentes reentrantes/isolados por secção. Validar diretamente no editor, sem assumir que um preview com reload completo cobre esse comportamento. Esforço M.

### P2 — Acessibilidade de overlays e música

O modal de newsletter nasce com `aria-hidden="true"`, mas o JavaScript só altera a classe visual; não atualiza esse estado, não fecha por Escape nem gere foco. Drawer, menu mobile e lightbox também precisam de revisão conjunta de foco e semântica. O controlo musical é uma âncora sem `href`, em vez de um botão nativo. Não foi encontrada preferência de movimento reduzido.

Recomendação: nomes acessíveis, `aria` sincronizado, foco inicial/restaurado, navegação por teclado, fecho por Escape e prevenção de interação com conteúdo atrás de modais. Respeitar movimento reduzido e tornar a reprodução musical uma escolha explícita. Esforço M.

### P2 — Leitor de música falha com estado antigo

Evidência: `snippets/music-player.liquid:205` restaura um índice guardado sem verificar se continua dentro da playlist. Reprodução local: uma playlist reduzida para uma faixa e índice anterior 10 provoca erro ao ler `trackObj.url`.

Recomendação: validar índices e permutações, versionar o estado pela playlist, proteger acessos a storage e tratar falhas de reprodução. Não existe listener `ended` para avançar automaticamente de faixa; confirmar o comportamento pretendido. Esforço B/M.

### P3 — Documentação, SEO e conteúdo legado

- README referencia assets e documentos que não existem e descreve comportamentos antigos. O novo `AGENTS.md` fornece o mapa atual.
- Há caminhos de contacto duplicados, `product-grid`, `sidebar-navigation`, exemplos de blocos e snippet PageFly sem ligação estática aos templates atuais. Não apagar sem confirmar uso no editor/app. `cart-inventory` é uma exceção ativa via HTTP.
- Três manifests idênticos não são ligados no head e apontam para ícones na raiz; a sua presença não torna a loja uma PWA.
- Metadados têm canonical, Open Graph e structured data de produto, mas a meta description usa sempre `shop.description`, embora `page_description` esteja disponível para OG.
- Os termos mostram a data de hoje por `document.write`, não a data real de revisão editorial.
- Rever significado das medidas A/B/C com a marca: os nomes genéricos Sleeve/Chest e os valores de baby tee/t-shirt merecem confronto com os SVG e fichas técnicas; não alterar valores por suposição.

Recomendação: corrigir contexto/SEO por página e reduzir código legado apenas depois de confirmar referências reais. Esforço B/M.

## 5. Plano recomendado

O plano abaixo não foi executado; a alteração desta análise é apenas documental.

| Etapa | Entregável | Critério de conclusão |
| --- | --- | --- |
| 1. Confirmar ambiente | Loja, tema de desenvolvimento, branch ligada à Shopify, páginas e dados de teste | Preview autorizada, sem risco de publicação acidental |
| 2. Estabilizar compra e acesso | Remover segredo do cliente, corrigir variantes, erros HTTP, quantidades e rollback | Casos P1 reproduzidos passam a ter comportamento correto em testes e preview |
| 3. Criar base de regressão | Testes do carrinho/variantes, Theme Check em CI, smoke tests e checklist de release | Alterações futuras têm verificações repetíveis |
| 4. Otimizar media e pedidos | Hero responsivo, fontes, música/embeds adiados, cache de produto | Comparação antes/depois em mobile e desktop, sem regressões visuais |
| 5. Consolidar componentes | Serviço de carrinho e quick add partilhados; CSS e lifecycle organizados | As grelhas e os dois carrinhos usam os mesmos contratos |
| 6. Qualidade transversal | EN/PT, moeda, acessibilidade, editor, SEO, privacidade e conteúdo | Checklist aprovada nos mercados e páginas efetivamente ativos |
| 7. Novas features | Implementação por fatias pequenas, com critérios de aceitação | Cada feature entra com testes e dependências Shopify documentadas |

Não proponho reescrever o tema nem migrar de plataforma. A estrutura existente permite evolução incremental.

## 6. Melhorias de segurança recomendadas

| Prioridade | Melhoria | Impacto / esforço |
| --- | --- | --- |
| P1 | Eliminar a password da montra entregue ao browser; confirmar rotação da ativa | Proteção do pré-lançamento; M |
| P1 | Status HTTP, variantes completas e estado autoritativo do carrinho | Integridade da compra e mensagens fiáveis; M |
| P2 | Saídas DOM seguras, escape de formulários e dados JS serializados | Redução da superfície de injeção; M |
| P2 | Rever quem pode editar HTML livre de embeds e respetivos domínios | Menos dependências de conteúdo executável; B/M |
| P2 | Inventariar apps, pixels, permissões e consentimento no admin | Visibilidade sobre terceiros e dados; depende de acesso |
| P2 | Reforçar processo Git/Shopify: revisão, proteção de branch, permissões mínimas e 2FA | Evitar publicação/acesso indevido; depende dos responsáveis |
| P3 | Secret scanning em CI e política de não registar dados de clientes/tokens | Prevenção de exposição futura; B/M |

Não foram encontrados padrões comuns de tokens administrativos/chaves privadas no conteúdo atual pesquisado, mas isto não substitui análise de histórico, credenciais externas e permissões. O problema concreto encontrado é a password da montra; não se conclui que o projeto esteja livre de outros segredos.

Sobre privacidade: os formulários usam `contact[accepts_marketing] = true`, e há media de terceiros. Confirmar experiência de consentimento, textos informativos e configurações reais antes de concluir conformidade. Uma tag de newsletter ou um valor em `localStorage` não prova consentimento persistido nem entrega do email. Integrar com os mecanismos de privacidade aplicáveis à loja, sem criar um sistema paralelo só no browser. [Customer Privacy API](https://shopify.dev/docs/api/customer-privacy).

Não introduzir tokens Admin API no tema. Também não aplicar uma política CSP genérica e restritiva sem testar os scripts Shopify/apps: a configuração de headers e a política da plataforma precisam de validação própria.

## 7. Melhorias de performance recomendadas

Estas são oportunidades inferidas do código, não medições de lentidão do site publicado.

| Prioridade | Evidência local | Ação recomendada | Esforço |
| --- | --- | --- | --- |
| P1 | Hero inicial de `full-width-images.liquid:65` é lazy, com imagem até 2000 px; não há imagem mobile configurada no template atual | Primeira imagem visível eager/prioritária; `srcset`/`sizes` e dimensões corretas, lazy nas restantes | B/M |
| P2 | `music-player.liquid:45` tem `preload="auto"` e tenta tocar ao carregar/interagir com a página | Adiar download/reprodução até escolha explícita; persistência de estado menos frequente | B/M |
| P2 | Fonts Google no head, apesar de Century Gothic local; `critical.css:2` sem `font-display`; face bold tem `font-style: bold` inválido | Confirmar fontes realmente usadas, retirar pedidos dispensáveis, corrigir família/pesos e estratégia de apresentação | B |
| P2 | `new-arrivals-grid.liquid:887` faz `await fetch` de cada produto sequencialmente a cada filtro de tamanho | Cache partilhada por handle/locale, dados mínimos de variantes ou concorrência limitada; cancelar/ignorar filtros ultrapassados | M |
| P2 | Quick add repete pedidos de produto; busca preditiva tem debounce, mas sem cancelamento | Reutilizar dados de produto; `AbortController`/identificador de pedido para pesquisa | M |
| P2 | CSS/quick add repetidos em várias secções; ficheiro global inclui componentes antigos | Consolidar gradualmente módulos e estilos por responsabilidade; medir cobertura antes de retirar CSS | M/A |
| P2 | YouTube carregado diretamente no magazine e HTML embed livre | Placeholder com carregamento por interação/visibilidade; lazy e política de consentimento quando aplicável | B/M |
| P3 | Contraste do header amostra vários pontos e estilos por frame; galeria combina observers e listeners | Perfilar scroll, agrupar leituras/escritas e reduzir amostras/listeners; conservar o comportamento visual | M |
| P3 | Guia de tamanhos repete tabelas/listas e dezenas de renders do snippet de medidas | Gerar estruturas a partir de dados partilhados e medir custo Liquid/DOM | M |

A separação em assets deve respeitar a forma como Shopify agrupa/carrega `{% javascript %}` e `{% stylesheet %}`. Não mover Liquid dinâmico para dentro dessas tags. [Carregamento de scripts e estilos](https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags).

Para validar ganhos, medir homepage, Shop, coleção, produto e magazine, em mobile/desktop, antes e depois, com cache fria/quente e estado de consentimento comparável. Registar LCP, INP, CLS, bytes de imagens/áudio, quantidade de pedidos e tarefas longas; separar custo do tema de apps e scripts injetados. [Performance de temas Shopify](https://shopify.dev/docs/storefronts/themes/best-practices/performance).

Objetivos de qualidade, não resultados atuais: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1, avaliados no percentil 75 quando houver dados reais. Não converter uma execução Lighthouse numa garantia sobre todos os clientes. [Web Vitals](https://web.dev/articles/vitals).

## 8. Validação antes das próximas features

1. Confirmar o URL da loja/preview e se `main` atualiza um tema publicado ou apenas de desenvolvimento.
2. Identificar mercados/idiomas/moedas ativos e a intenção de lançamento/password.
3. Preparar produtos de teste com uma opção, cor/tamanho em ambas as ordens, combinações inexistentes, stock baixo, esgotado, desconto e gift card.
4. Testar todos os caminhos de quick add, drawer e carrinho, incluindo HTTP 422, offline e cliques rápidos.
5. Confirmar newsletter/challenge/subscription e desconto em ambiente autorizado, sem subscrever clientes reais por acidente.
6. Confirmar handles de páginas/coleções, atribuição de templates, políticas e medidas com a marca.
7. Fazer baseline visual, acessível e de performance; adicionar regressões automatizadas para os contratos mais críticos.

## 9. Entrega desta análise

Criados `AGENTS.md` e este relatório. Código funcional, settings, catálogo e tema remoto ficaram inalterados. Os testes de reprodução foram executados em scripts temporários fora do repositório, com DOM/API simulados e sem acesso de escrita à loja; não constituem ainda uma suíte de testes permanente.

O contexto necessário para começar já está registado. A primeira intervenção técnica recomendada é estabilizar variantes/carrinho e retirar a password do cliente; depois, executar as melhorias rápidas de media/fontes antes de ampliar funcionalidades comerciais.
