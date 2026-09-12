# Drop commerce - configuração antes da publicação

As funcionalidades comerciais do drop são controladas em **Definições do tema > Current Drop & Delivery**. O tema não ativa nenhuma delas por defeito.

## Configuração do drop

1. Ativar **Enable current drop features**.
2. Escolher a coleção do drop atual e indicar o nome e a data/hora ISO 8601 de fecho em horário de Lisboa. Exemplo de inverno: `2026-10-31T23:59:00+00:00`; no horário de verão deve ser usada a respetiva diferença UTC.
3. Escolher as duas t-shirts e o produto-pai do bundle.
4. Ativar ou desativar **NO RESTOCKS** para acrescentar essa mensagem à announcement bar atual. Em **Announcement Bar**, o campo **Additional rotating messages** aceita uma frase por linha; o marquee apresenta-as pela mesma ordem e ignora linhas vazias.

O countdown é apenas informativo. No instante de fecho, remover/despublicar os produtos ou a coleção continua a ser uma ação no Shopify Admin; o tema não altera catálogo, inventário ou canais de venda.

## Bundle e portes em Portugal

O tema identifica e adiciona **uma variante do produto-pai** `Secrets + Sinners Bundle`; nunca acrescenta duas t-shirts independentes. Criar e manter esse produto-pai na aplicação gratuita Shopify Bundles:

1. Criar um *fixed bundle* com `Secrets White Tee` e `Sins Burgundy Tee`.
2. Combinar a opção com o mesmo nome nas duas peças, normalmente **Tamanho**, para que cada variante do bundle corresponda ao mesmo tamanho em ambas.
3. Confirmar que o bundle apresenta as componentes no admin da aplicação **Shopify Bundles**. É esta ligação, e não o tema, que reduz o inventário da Secrets e da Sinners quando é comprada uma variante do bundle.
4. No editor do tema, indicar esse produto-pai em **Bundle product** e as duas peças em **First/Second bundle t-shirt**. Não escolher uma das t-shirts como produto-pai.

Em **Definições Shopify > Envio e entrega > Perfis de envio**, na zona Portugal, manter as taxas normais da transportadora e criar uma taxa gratuita com mínimo de preço de **80 EUR**. Assim, duas unidades da mesma T-shirt só têm portes grátis quando o subtotal elegível chega a 80 EUR; a quantidade não é usada como critério.

O Shopify Bundles não permite aplicar um perfil de envio ao produto-pai: os portes são calculados pelos perfis das peças que o compõem. Por isso, no plano Basic da loja, a regra “bundle presente → portes grátis em Portugal” não pode ser criada apenas com as taxas nativas. Exige uma app pública de regras/descontos de envio que suporte essa condição (pode ter subscrição) ou uma Shopify Function numa loja Shopify Plus. O tema não pode alterar a taxa do checkout de forma segura.

Na raspadinha, cada cupão válido é criado para uma utilização, para o cliente que o recebeu, e está autorizado a acumular com descontos de produto, de encomenda e de envio. Confirmar no admin que outras campanhas/descontos automáticos também permitem acumulação; a Shopify continua a decidir compatibilidades e a validade no checkout.

Antes de publicar, testar no checkout com endereço em Portugal:

1. Uma T-shirt abaixo de 80 EUR: taxa normal da transportadora.
2. Duas unidades da mesma T-shirt abaixo de 80 EUR: taxa normal da transportadora.
3. Encomenda de 80 EUR ou mais: portes 0 EUR.
4. Só o `Secrets + Sinners Bundle`, abaixo de 80 EUR: portes 0 EUR e redução do stock das duas componentes.
5. Bundle com outros artigos abaixo de 80 EUR: confirmar o comportamento pretendido para os perfis ou para a regra de envio instalada.
6. Cada caso anterior com um cupão de raspadinha ainda válido: o cupão deve poder ser aplicado.

## Poucas unidades e EXTINCT

O tema lê a quantidade atual de cada variante da Shopify e só mostra **Poucas unidades** quando:

- O inventário é controlado pela Shopify e a política não permite continuar a vender sem stock.
- A variante está disponível.
- `inventário atual / custom.drop_initial_stock` é igual ou inferior à percentagem definida no tema, inicialmente 67%.

Criar no admin o metafield de variante `custom.drop_initial_stock` como número inteiro e preencher o stock inicial de cada tamanho/cor no início do drop. O tema não tenta deduzir esse valor a partir do inventário atual.

Uma cor sem combinação disponível fica indisponível. Um tamanho sem stock continua selecionável para comunicar o estado real, e só nesse caso aparece **EXTINCT** junto aos seletores. A validação Shopify continua a prevalecer no momento de adicionar ao carrinho.

## Estimativa DPD

Preencher apenas dados confirmados: nome da transportadora, fuso, hora de corte, dias de expedição, datas fechadas e intervalo de dias úteis. A previsão é mostrada como estimativa e não substitui as taxas ou prazos confirmados no checkout.

## Raspadinha

A raspadinha é uma secção do tema ligada ao Worker Cloudflare gratuito preparado para a loja. Exige login numa conta Shopify: o App Proxy confirma o cliente e o servidor aplica um limite de uma tentativa por cliente e por IP, guardado apenas como hash. Quando existe prémio, o Worker cria um código único, limitado ao cliente que o recebeu, a uma utilização e a 20 minutos.

As quotas, pesos, bloqueio imediato e reinício dos testes são operados na D1 Cloudflare; não ficam expostos nas definições do tema. O procedimento completo está em [Raspadinha segura — serviço Cloudflare](../services/scratch-card/README.md).

Para a ativar primeiro no tema de desenvolvimento:

1. Em Cloudflare D1, colocar `campaigns.active = 1` apenas para a campanha de teste.
2. No editor do tema de desenvolvimento, ativar a secção **Secure Scratch Card**.
3. Iniciar sessão com uma conta cliente de teste e confirmar a emissão e utilização de um único código.
4. Antes de abrir a loja, desligar campanha/tema, esperar 20 minutos e executar o script de reinício documentado.

Não colocar códigos de desconto, percentagens, quotas ou credenciais em settings, Liquid ou JavaScript do tema.
