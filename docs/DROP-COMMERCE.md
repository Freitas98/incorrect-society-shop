# Drop commerce - configuração antes da publicação

As funcionalidades comerciais do drop são controladas em **Definições do tema > Current Drop & Delivery**. O tema não ativa nenhuma delas por defeito.

## Configuração do drop

1. Ativar **Enable current drop features**.
2. Escolher a coleção do drop atual e indicar o nome e a data/hora ISO 8601 de fecho em horário de Lisboa. Exemplo de inverno: `2026-10-31T23:59:00+00:00`; no horário de verão deve ser usada a respetiva diferença UTC.
3. Escolher as duas t-shirts e o produto-pai do bundle.
4. Ativar ou desativar **NO RESTOCKS** para acrescentar essa mensagem à announcement bar atual. Em **Announcement Bar**, o campo **Additional rotating messages** aceita uma frase por linha; o marquee apresenta-as pela mesma ordem e ignora linhas vazias.

O countdown é apenas informativo. No instante de fecho, remover/despublicar os produtos ou a coleção continua a ser uma ação no Shopify Admin; o tema não altera catálogo, inventário ou canais de venda.

## Bundle com portes grátis

Criar primeiro um produto-pai com a aplicação gratuita Shopify Bundles:

1. Criar um fixed bundle com as duas t-shirts.
2. Combinar a opção com o mesmo nome nas duas peças, normalmente **Tamanho**, para que cada variante do bundle corresponda ao mesmo tamanho em ambas.
3. Indicar esse produto-pai em **Bundle product** e as duas peças em **First/Second bundle t-shirt**.
4. Configurar no Shopify as taxas reais: portes grátis para encomendas de 80 EUR ou mais e uma taxa gratuita para o produto-pai do bundle.
5. Testar no checkout uma compra com apenas o bundle, uma compra de 80 EUR e uma compra que combine o bundle com outros produtos. O checkout Shopify é a autoridade sobre as taxas finais.

O cartão nas páginas das t-shirts adiciona a variante do produto-pai do bundle. Não adiciona duas variantes independentes: essa diferença permite à Shopify tratar o bundle e os portes como uma regra comercial real.

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
