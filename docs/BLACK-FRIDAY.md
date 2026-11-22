# Campanha Black Friday

O tema apresenta uma redução de 20% no preço de catálogo em **Definições do tema → Black Friday**. A barra superior conta até ao início e, durante a campanha, até ao fim. No fim volta ao anúncio habitual. O preço anterior surge riscado a seguir ao preço promocional.

## Configurar a campanha

1. Em **Shopify Admin → Descontos**, criar um desconto automático **Montante de desconto em produtos**, com o título `Black Friday -20%` e valor de **20%**. Usar todos os clientes e nenhuma compra mínima.
2. Incluir todos os produtos e variantes à venda, incluindo o **produto-pai do bundle** e os **produtos de cartão-oferta**. Se o catálogo mudar durante a campanha, confirmar a elegibilidade dos novos artigos.
3. Programar o início e o fim do desconto no fuso horário da loja. No editor do tema, ativar **Enable Black Friday** e preencher os mesmos instantes em ISO 8601 com segundos e fuso horário, por exemplo `2026-11-27T00:00:00+00:00`. O início vazio apresenta a campanha de imediato. O fim é obrigatório.
4. Antes de abrir a campanha ao público, confirmar o preço de referência no EEE. O tema risca o preço de catálogo imediatamente anterior ao desconto. Quando for necessário divulgar um preço mais baixo praticado nos últimos 30 dias, preparar essa informação por produto antes de ativar esta apresentação.
5. Verificar num carrinho e no checkout uma peça avulsa, um bundle com tamanhos distintos e um cartão-oferta. Confirmar também a configuração de combinações com outros descontos em uso. Se a campanha for terminada manualmente, desativar a opção no editor e terminar o desconto automático no admin.

O editor controla a apresentação da montra. O desconto do admin é independente e altera os valores pagos. A página de carrinho apresenta os descontos calculados pela Shopify. O carrinho lateral destaca apenas as alocações reais com o título `Black Friday -20%` e inclui-as no subtotal apresentado. Os valores de cartões-oferta já emitidos mantêm o saldo atribuído pela Shopify.

Documentação Shopify sobre [descontos automáticos](https://help.shopify.com/en/manual/discounts/discount-types/percentage-fixed-amount), [bundles](https://help.shopify.com/en/manual/products/bundles/shopify-bundles), [cartões-oferta](https://help.shopify.com/en/manual/products/gift-card-products/discounted-gift-cards) e [preço de referência no EEE](https://help.shopify.com/en/manual/compliance/legal/pricing-indication-directive).
