# Virtual Fitting Room V2 — publicada em 2026-09-08 (validação física pendente)

Base: `ff35b21`, checkout inicialmente limpo. O utilizador informou que a versão anterior está publicada e pediu maior realismo, movimento, comparação de tamanhos/apoio à compra e funcionamento em aparelhos menos potentes. Acrescentou que mãos/antebraços não devem abrir buracos na peça. A estética e o comércio introduzidos pelo utilizador foram preservados. A evolução começou localmente em 2026-09-07 e foi publicada com autorização explícita em 2026-09-08, commit `204c4f6`; o registo final abaixo distingue publicação de validação física.

## Medidas e escolha de tamanho

- `size-measurements.liquid`, ação `json`, fornece as mesmas variáveis numéricas da tabela visível: S/M/L/XL, peito em largura plana, comprimento, ombros, manga e abertura. Não duplicar estes números em JS. Tolerância indicada pela loja: ±2 cm na medida plana.
- `vto-sizing.js` resolve a opção de tamanho por nome explícito ou valor exato inequívoco. Não inventa XS/XXL nem interpreta títulos/cores como tamanhos.
- O perfil compara uma T-shirt existente (largura plana e comprimento) com a tabela. Alternativa: perímetro do peito e preferência de folga de 8/16/24 cm. Essas folgas são objetivos de estilo transparentes, não uma regra de modelagem validada pela marca.
- A recomendação é a medida mais próxima, não necessariamente a que está em stock. Mostra diferenças, empates, tolerância e falta de correspondência próxima; nunca troca silenciosamente por outro tamanho disponível.
- A largura medida entre articulações dos ombros calibra metros para píxeis; sem ela, a escala corporal estimada pelo Pose Landmarker continua explicitamente aproximada. A fotografia não mede centímetros por si só.
- Os cinco parâmetros de tamanho alteram separadamente o modelo. A escala do corpo é constante ao mudar S/M/L/XL e mover a anca não estica o comprimento físico da peça.
- O perfil fica apenas em memória/DOM enquanto a página está aberta. Não é enviado nem persistido em armazenamento local. Há controlo para limpar.

## Modelos e tecido

`scripts/build-try-on-cloth.py` foi executado através do Blender MCP, sobre cópias da biblioteca anterior `artifacts/try-on/refined-models.blend`. A cena original permaneceu intacta. A nova biblioteca editável é `artifacts/try-on/cloth-models-v2.blend` (artifacts ignorado pelo Git).

Os GLB incluem em extras `vto_cloth_cage`: 845 pontos soldados pela topologia, 3081 ligações e pesos dos ossos. Os modelos principais têm 1 701 380 bytes (Secrets) / 1 539 244 bytes (Sinners); LODs leves 785 192 / 623 056 bytes. Os LODs removem costuras geométricas muito pequenas, espessura secundária e reduzem a superfície; preservam estampados e esqueleto.

`vto-cloth.js` implementa deformação secundária limitada, com restrições de distância XPBD, inércia, gravidade, fixação no decote e contacto aproximado com um tronco elíptico. Deslocamento relativo máximo: 4 cm. A referência é a formulação [XPBD, Macklin/Müller/Chentanez](https://matthias-research.github.io/pages/publications/XPBD.pdf); não foi copiada uma biblioteca GPL. Os parâmetros não foram identificados experimentalmente num tecido físico. Não é uma simulação comercial de moldes/costura validada.

`vto-skinning.js` acrescenta mistura por quaterniões duais ao caminho físico de escala uniforme, para preservar volume nas rotações; o caminho legado não uniforme continua com o skinning matricial. Os alvos CPU do tecido usam a mesma transformação por quaterniões. O sombreamento combina as normais suaves com a superfície realmente deformada, evitando que as dobras conservem iluminação rígida.

Os pivôs das mangas são calculados a partir das articulações da pessoa no espaço da peça. O antigo pivô de ±23,5 cm não pode ser transladado para dentro quando o corpo é mais estreito: isso esmagava as cavas e produzia facetas semelhantes a rasgões. Um teste garante que, na pose de repouso, o painel e a manga continuam alinhados mesmo com ombros medidos de 35 cm. Os eixos da anca também são ortogonalizados para que o skinning por quaterniões receba rotações de escala uniforme, incluindo posturas inclinadas.

## Mãos, oclusão e resposta

Os antigos cilindros/esferas que escreviam profundidade por cima do tecido já não são mostrados. Não cortam a malha. A pessoa é composta numa camada 2D separada com píxeis da imagem original.

- Fotografias: segmentação semântica do próprio frame, limitada às regiões relevantes e confiança elevada; erosão conservadora nas bordas.
- Vídeo: worker de pose independente do worker de segmentação. Uma classificação lenta não bloqueia o seguimento do corpo.
- `vto-foreground.js` reprojeta a classificação recente pelas articulações e exige acordo de aparência com os píxeis do frame atual. Não cola uma mão de uma imagem anterior sobre o vídeo. Rejeita referências futuras/mais antigas que 1200 ms, tracking insuficiente e alterações de aparência. As bordas incertas mantêm o tecido intacto. É uma aproximação, não segmentação perfeita de dedos/telefones em todas as poses.
- O próprio Pose Full fornece também o contorno da pessoa no frame atual (`outputSegmentationMasks`, [API oficial](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)). Esse contorno é usado apenas para rejeitar fundo na reprojeção; nunca para revelar a roupa original por si só. É transferido em bytes com dimensão máxima de 256 px. A inferência usa no máximo 640 px em vídeo / 1024 px em fotografia, preservando o bitmap original para apresentação/captura. A inexistência de um contorno atual impede a restauração de píxeis de um frame anterior.
- Modelos externos: Pose Full e [Selfie Multiclass 256](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter), este último em `image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite` no domínio storage.googleapis.com. Seis classes oficiais: fundo, cabelo, pele do corpo, pele da face, roupa, acessórios. Não usa limiares fixos de cor de pele.
- GPU quando há aceleração real; CPU quando há renderização por software ou GPU indisponível. Recursos e import maps continuam versionados; o worker recebe URLs explícitas.
- Sem OffscreenCanvas há adaptadores locais no main thread. Esta alternativa pode pausar a UI durante segmentação e não tem a mesma performance dos dois workers. Não afirmar que equivale a um iPhone físico testado.
- Tracks, workers, modelos, bitmaps, referências de imagem e canvases auxiliares são libertados ao fechar. Nenhuma imagem ou medida é enviada a servidores.
- Falha no segmentador mantém a malha inteira e mostra uma indicação de que as mãos poderão ficar tapadas; escolher uma fonte novamente tenta recuperar o detalhe. Nunca recorrer a máscaras geométricas como alternativa. Resultados atrasados de outra fotografia/sessão não repintam a sessão atual.

## Compra e estado do produto

O desenho publicado pelo utilizador já contém seleção de outra peça e compra no modal. Esse fluxo foi preservado. A ação usa o ID exato da variante ativa, bloqueia pedidos concorrentes, valida 422/HTTP e envia `cartUpdated` com fonte `try-on` para os consumidores existentes. Uma atualização do carrinho que falhe depois de um POST bem-sucedido não repete a compra.

As trocas rápidas de GLB usam revisões e ignoram respostas antigas. Reabrir regressa ao produto da página e à variante selecionada no formulário. Os seletores e indicações de stock continuam acessíveis; esgotados podem ser comparados visualmente mas não comprados.

`loadedModelKey` tem de corresponder a `modelKey` antes de renderizar ou capturar: falhar a troca de modelo e mudar de tamanho não pode voltar a mostrar a peça anterior. Nova escolha de fonte recria o motor após falha de carregamento. Uma resposta incerta do POST ou uma falha de atualização do carrinho não é repetida automaticamente; há mensagem específica e ligação ao carrinho localizado. Não emitir um carrinho fictício nem apresentar um erro de rede cru como instrução para adicionar novamente.

## Evidência obtida e trabalho ainda necessário

Resultados intermédios (não equivalem a aprovação para publicação):

- 47 testes Node passaram antes de separar os workers; os novos testes de reprojeção de mãos e de tecido também passaram depois dessa separação. Reexecutar a suíte completa no fim.
- Theme Check: 0 erros / 10 avisos preexistentes na versão intermédia. Reexecutar após todas as alterações.
- Fotografias Chrome: Secrets e Sinners, incluindo reabertura. Testes de viewport mobile e WebKit de Windows realizados na versão intermédia; repetir a versão final.
- Commerce check, modelos normal e leve: medidas reais, escala corporal constante S–XL, esgotado, variante correta no POST simulado, erro 422, trocas rápidas de produto e reabertura. Todos os POST de teste são intercetados; não criam compras na Shopify.
- Integração: câmara simulada móvel, espelho, passagem a fotografia, JPEG, Escape/foco, tracks terminadas, todos os workers terminados, permissão atrasada/negada, imagem sem pessoa e ausência de uploads.
- Vídeo público MediaPipe, versão intermédia: 80 frames, zero perdas de pose, extremidade real da manga acompanha o osso. Essa verificação não prova, por si só, qualidade do caimento nem precisão da oclusão.
- Medição CPU/renderização por software: segmentação serial demorava ~350 ms/frame. Com workers independentes, pose observada ~40–55 ms enquanto a segmentação demora ~330 ms. Medir FPS fim a fim, custo de cloth/composição e latência em condições comparáveis; não apresentar estes números como desempenho garantido em telemóveis.
- Inspeção sobre fundo magenta confirmou que as zonas cinzentas nas cavas são sombreamento/geometria, não transparências abertas pelos braços. Ainda precisam de polimento visual.

Atualização após separar os workers e alinhar CPU/GPU:

- 52 testes Node passaram; Theme Check mantém 0 erros / 10 avisos anteriores.
- Integração normal e sem worker passou com os dois processadores, incluindo limpeza e reabertura. WebKit de Windows voltou a passar fotografia/reabertura em viewport mobile.
- Benchmarks sequenciais de 12 segundos, depois de aquecimento, Chrome/SwiftShader: modelo normal em desktop, 132 frames / 11,1 fps, mediana cloth 5,3 ms, idade p95 do frame 111,6 ms; modo leve em 390×844 e CPU limitada 4×, 135 frames / 11,3 fps, mediana cloth 15,7 ms, idade p95 90,6 ms. O p95 do intervalo da interface foi 25 / 20,8 ms. A limitação de CPU via browser não equivale ao hardware de um telefone; o teste verifica progressão e responsividade sob essa condição específica.
- A imagem de câmara/fotografia aparece durante o carregamento dos modelos; os frames de pose continuam emparelhados com a imagem correta depois de iniciar o seguimento.
- O seletor Qualidade automática / Modo leve troca o LOD, DPR e esforço de tecido sem mudar produto, medidas ou fonte; não pede novamente a câmara. O modo automático continua a respeitar as indicações limitadas de memória/CPU fornecidas pelo browser. Não guarda preferências em servidores.

Pendentes prioritários: comparar com as peças realmente vestidas, com tamanho conhecido, e validar câmara física iPhone/Android, movimentos rápidos, orientação e o tema Shopify remoto. Foram pedidas fotografias de referência; a montra pública está protegida. Os testes locais de UI PT/mobile, medidas, compra simulada, falhas e limpeza não substituem essas validações de caimento/dispositivos. Em 2026-09-08 o utilizador autorizou explicitamente a publicação em produção e disponibilizou-se para os testes físicos; consultar o registo de publicação abaixo.

Ronda posterior de regressões:

- 56 testes Node cobrem agora os LODs binários, pivôs físicos das mangas e bases ortogonais da anca, além dos contratos anteriores.
- `vto-occlusion-check.cjs` usou a área da pessoa na captura enviada pelo utilizador: 3519 píxeis de primeiro plano com confiança elevada; seis posições diferentes das mãos alteraram **zero** píxeis de transparência do modelo. O teste verifica a integridade da malha, não a precisão perfeita de cada dedo na captura de baixa resolução. A imagem usada já continha uma sobreposição da versão anterior; não equivale à fotografia original.
- `vto-resilience-check.cjs`: segmentador bloqueado, recuperação, interface PT/mobile, medidas inválidas, modelo bloqueado sem reaparecimento da peça anterior, nova tentativa, fotografia antiga a terminar a descodificação após reabertura e limpeza. Passou sem uploads nem câmara real.
- Commerce check normal e leve: passou também a resposta 422, falha do GET após POST confirmado e resposta de rede incerta; não repetiu adições nem inventou eventos de carrinho.
- Integração normal voltou a passar depois das correções de pivôs e identidade de modelo. A confirmação visual de seguimento desaparece após dois segundos para deixar de tapar a cara em ecrãs pequenos; estados de erro/procura continuam visíveis.
- A montra pública foi consultada, mas redireciona para a página de password. Não foram submetidas credenciais nem extraídos catálogos privados. Continuam em falta referências das peças realmente vestidas com tamanho conhecido.

Ronda de contorno atual e compatibilidade (2026-09-08):

- Acrescentado teste que rejeita fundo atual com a mesma cor da mão anterior: a reprojeção necessita também de evidência do contorno atual da pessoa. A máscara da pessoa nunca revela roupa por si só.
- O ensaio vertical detetou uma falha fatal do MediaPipe CPU ao copiar máscaras com linhas desalinhadas (427×640). Usar um bitmap de inferência com dimensões múltiplas de quatro resolveu o caso; a fotografia original de 638×1000 é inferida a 640×1000, mantendo a apresentação original. `poseInputSize` tem testes de regressão para retrato, paisagem e limites de resolução.
- A câmara simulada passou a usar uma fotografia em retrato com uma mão à frente do peito. O teste exige píxeis efetivamente restaurados, não apenas uma T-shirt sem oclusão. Depois do alinhamento, passou a sequência de 25 frames, transição para fotografia com outra postura, captura, fecho/reabertura, erros e ausência de uploads.
- O teste WebKit com o processamento anterior bloqueou e foi terminado apenas na árvore de processos pertencente ao teste. Depois do alinhamento, nova execução WebKit passou fotografia/reabertura; Chrome sem workers passou a câmara simulada em retrato com primeiro plano visível, transições e limpeza. Nenhum desses ensaios usa uma câmara física.
- Benchmark após acrescentar o contorno atual, sequencial, vídeo público 640×360, SwiftShader: normal 113 frames / 9,43 fps, cloth mediano 6,6 ms, idade p95 110,3 ms; leve, viewport mobile e CPU limitada 4×: 118 frames / 9,88 fps, cloth mediano 20 ms, idade p95 115,1 ms. Intervalo p95 da interface ~29 ms em ambos. Substituem os números anteriores para esta versão; não são medições em telemóveis físicos.
- Ronda final local: 58 testes Node passaram; Theme Check 0 erros / 10 avisos anteriores; `git diff --check` passou. A referência enviada pelo utilizador voltou a passar com 3495 píxeis de primeiro plano e zero mudanças de transparência da peça nos seis movimentos das mãos. Ainda não existe aprovação de caimento real ou teste remoto/telemóvel.

## Publicação autorizada — 2026-09-08

- Alvo confirmado pela Shopify CLI: loja `uuxj91-bd.myshopify.com`, tema `incorrect-society-shop/main`, ID `184958812501`, função `live`.
- Os commits do editor Shopify `996fa8d` e `fdcb920` foram integrados por fast-forward antes da publicação, preservando `config/settings_data.json`. Os 27 ficheiros relevantes descarregados do tema live coincidiram com `origin/main` nessa revisão.
- Cópia de segurança local, fora do tema e do Git: `C:/dev/incorrect-society-backups/production-before-v2-20260908`. Pode conter configuração privada: não publicar nem servir por HTTP. O commit `fdcb920` também identifica a base anterior à V2.
- Não se alterou o interruptor nem os valores guardados do editor: `settings.enable_virtual_try_on` já estava ativo. Para desligar: editor do tema → Definições do tema → Virtual Try-On → desmarcar **Enable Virtual Try-On (VR)** → Guardar. A opção homónima na secção Product também pode desligar o provador nesse template.
- Preparação final: 58 testes Node passaram; Theme Check 0 erros / 10 avisos preexistentes. Verificação da sincronização live e teste físico são passos distintos; não assumir sucesso remoto apenas pelo push Git.
- Publicação concluída por `git push origin main`, commit `204c4f6`, através da ligação GitHub–Shopify existente. Nova leitura autenticada do tema live confirmou os 21 ficheiros alterados, incluindo os quatro GLB, e zero alterações aos cinco controlos comparados: `settings_data`, `settings_schema`, template de produto, secção de produto e layout. A Shopify confirmou `processing: false` e função `live`.
- Os 16 assets alterados responderam HTTP 200 no CDN da montra; os quatro GLB coincidem byte a byte. O CDN minifica JS/CSS, pelo que comparação textual direta desses recursos não é válida. O teste de browser com os módulos minificados reais e os GLB do CDN passou Secrets e Sinners (20 respostas CDN por peça, fotografia ajustada, sem erros JS/worker nem POST). Usou HTML Liquid/catálogo fictício servido localmente e uma fotografia pública; não substitui teste das páginas Shopify autenticadas.
- A página pública do produto redireciona para `/password` e identifica o mesmo tema publicado. Não foram submetidas credenciais, usada uma câmara real nem efetuadas compras. O utilizador vai validar as páginas reais e a câmara física: mãos/antebraços à frente, braços cruzados/levantados, rotação, troca de câmara, S/M/L/XL, modo leve e fecho/reabertura. Caimento e recomendação continuam aproximações por validar contra peças reais.

Comandos adicionais:

```powershell
node --test tests/vto-sizing.test.cjs tests/vto-cloth.test.cjs tests/vto-occlusion.test.cjs tests/vto-foreground.test.cjs
node scripts/vto-commerce-check.cjs
node scripts/vto-commerce-check.cjs --lite
node scripts/vto-occlusion-check.cjs
node scripts/vto-resilience-check.cjs
```
