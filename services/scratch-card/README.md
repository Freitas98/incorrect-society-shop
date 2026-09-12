# Raspadinha segura — serviço Cloudflare

Este serviço é o lado privado da raspadinha. O tema apenas desenha a interface; nunca contém tokens Shopify, segredos de App Proxy, contadores de prémios ou decisões de prémio.

## Garantias implementadas

- Login de conta Shopify obrigatório. O App Proxy confirma o `logged_in_customer_id` com HMAC antes de qualquer operação.
- Uma tentativa por cliente **e** uma por IP/campanha. O IP é guardado apenas como HMAC (`IP_HASH_SECRET`), nunca em texto simples.
- Limites absolutos da campanha: 5 x 3 EUR, 10 x 2 EUR e 15 x 1 EUR. Quando terminam, os resultados são não premiados.
- Código criptograficamente aleatório, uma utilização, restrito ao cliente premiado e com `endsAt` 20 minutos após a revelação.
- A atribuição de prémio ocorre no servidor apenas depois de a pessoa raspar. O browser não recebe probabilidades, contadores ou segredos.

## Preparação sem custos

1. Na conta Cloudflare, criar uma base D1 e executar `schema.sql`.
2. Copiar `wrangler.toml.example` para `wrangler.toml` e preencher apenas o ID da base D1.
3. Criar um Custom App Shopify com os scopes `write_discounts,read_discounts,read_customers` e configurar o App Proxy como `apps/incorrect-scratch` a apontar para `https://<worker>/proxy`.
4. Guardar estes segredos no Worker (nunca no repositório):
   - `SHOPIFY_APP_CLIENT_SECRET`
   - `SHOPIFY_APP_CLIENT_ID`
   - `SHOP_DOMAIN` (por exemplo, `uuxj91-bd.myshopify.com`)
   - `IP_HASH_SECRET` (uma chave aleatória independente)
5. Publicar o Worker e só depois ativar a campanha na D1 (`campaigns.active = 1`) e a secção **Secure Scratch Card** no tema de desenvolvimento.

O produto/tema não deve ser publicado nesta fase. Antes de ativar a campanha real, acrescentar às condições da ação: “Prémios limitados, sujeitos a disponibilidade; uma participação por cliente e por rede.”

## Operação

### Quotas, probabilidades e reinício de testes

Os valores ficam no servidor, na consola **Cloudflare → Storage & databases → D1 → incorrect-scratch-card**, nunca no tema.

- `rewards.initial_quantity` define o máximo de cada prémio; `remaining` é o saldo em direto. O ponto de partida é 5×€3, 10×€2 e 15×€1.
- `campaigns.no_prize_weight` define o peso de não-prémio. Com o valor `18` (calibrado para um universo de cerca de 100 pessoas/peças), a probabilidade inicial de prémio é de **~62,5%** (€3: **10,4%**, €2: **20,8%**, €1: **31,3%**, sem prémio: **37,5%**). Esta ponderação garante matematicamente que quase todos ou a totalidade dos 30 prémios saem ao longo de aproximadamente 100 participações. Quando um prémio esgota, nunca volta a ser escolhido.
- Para reiniciar testes, desativar o tema e a campanha, aguardar 20 minutos para os cupões emitidos expirarem e executar [`reset-campaign.sql`](reset-campaign.sql). O ficheiro limpa participações/IPs de teste e restaura `remaining` a `initial_quantity`.

- Para alterar a data/campanha, criar novo ID de campanha e novas linhas de prémios; não reutilizar uma campanha esgotada.
- Para interromper imediatamente a promoção, definir `active = 0` na campanha: ninguém recebe novo prémio, sem apagar auditoria.
- O limite por IP é deliberadamente estrito por pedido da marca; pode bloquear pessoas legítimas numa casa, universidade ou rede móvel partilhada.
