const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const encoder = new TextEncoder();

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function secureEqual(first, second) {
  if (!first || !second || first.length !== second.length) return false;
  let result = 0;
  for (let index = 0; index < first.length; index += 1) result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return result === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function verifyProxyRequest(request, secret) {
  const url = new URL(request.url);
  const signature = url.searchParams.get('signature');
  const timestamp = Number(url.searchParams.get('timestamp'));
  if (!signature || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return null;

  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'signature') continue;
    grouped.set(key, [...(grouped.get(key) || []), value]);
  }
  const message = [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, values]) => `${key}=${values.join(',')}`)
    .join('');
  const expected = await hmacHex(secret, message);
  return secureEqual(signature, expected) ? Object.fromEntries(url.searchParams) : null;
}

async function randomCode() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `IS-${[...bytes].map((value) => value.toString(36).padStart(2, '0')).join('').toUpperCase()}`;
}

function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new Error('invalid_random_range');
  const upperBound = 0x100000000;
  const limit = upperBound - (upperBound % maxExclusive);
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % maxExclusive;
}

function proxyPath(pathname) {
  if (pathname.endsWith('/state')) return 'state';
  if (pathname.endsWith('/start')) return 'start';
  if (pathname.endsWith('/reveal')) return 'reveal';
  return '';
}

async function identity(request, env) {
  const proxy = await verifyProxyRequest(request, env.SHOPIFY_APP_CLIENT_SECRET);
  if (!proxy || proxy.shop !== env.SHOP_DOMAIN) return { error: json({ error: 'invalid_request' }, 401) };
  if (!proxy.logged_in_customer_id) return { error: json({ error: 'login_required' }, 401) };
  const forwarded = request.headers.get('X-Forwarded-For') || '';
  const ip = forwarded.split(',')[0].trim();
  if (!ip) return { error: json({ error: 'network_unavailable' }, 403) };
  return { customerId: proxy.logged_in_customer_id, ipHash: await hmacHex(env.IP_HASH_SECRET, ip) };
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

async function campaignIsActive(db, campaignId) {
  return db.prepare('SELECT id FROM campaigns WHERE id = ? AND active = 1').bind(campaignId).first();
}

async function attemptFor(db, campaignId, customerId) {
  return db.prepare('SELECT * FROM attempts WHERE campaign_id = ? AND customer_id = ?').bind(campaignId, customerId).first();
}

function publicAttempt(attempt) {
  if (!attempt) return { state: 'ready' };
  if (attempt.state === 'rewarded') {
    return { state: 'rewarded', code: attempt.discount_code, expiresAt: attempt.expires_at, amountCents: attempt.amount_cents };
  }
  if (attempt.state === 'no_prize') return { state: 'no_prize' };
  return { state: attempt.state === 'started' ? 'started' : 'processing' };
}

async function getRewardedAttempt(db, attempt) {
  if (!attempt || !attempt.reward_id) return attempt;
  const reward = await db.prepare('SELECT amount_cents FROM rewards WHERE id = ?').bind(attempt.reward_id).first();
  return { ...attempt, amount_cents: reward?.amount_cents || 0 };
}

async function createDiscount(env, { code, customerId, amountCents, expiresAt }) {
  const mutation = `
    mutation CreateScratchDiscount($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message code }
      }
    }
  `;
  const variables = {
    input: {
      title: `Scratch reward ${code}`,
      code,
      startsAt: nowIso(),
      endsAt: expiresAt,
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { customers: { add: [`gid://shopify/Customer/${customerId}`] } },
      customerGets: {
        items: { all: true },
        value: { discountAmount: { amount: (amountCents / 100).toFixed(2), appliesOnEachItem: false } },
      },
    },
  };
  const accessToken = await adminAccessToken(env);
  const response = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({ query: mutation, variables }),
  });
  if (!response.ok) throw new Error(`Shopify Admin API ${response.status}`);
  const payload = await response.json();
  const result = payload.data?.discountCodeBasicCreate;
  if (!result || result.userErrors?.length) throw new Error(result?.userErrors?.map(({ message }) => message).join('; ') || 'discount_failed');
  return result.codeDiscountNode.id;
}

async function adminAccessToken(env) {
  const response = await fetch(`https://${env.SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.SHOPIFY_APP_CLIENT_ID,
      client_secret: env.SHOPIFY_APP_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error('shopify_token_failed');
  return payload.access_token;
}

async function reserveReward(db, campaignId, attemptId) {
  for (let retry = 0; retry < 4; retry += 1) {
    const rewards = await db.prepare('SELECT id, amount_cents, remaining FROM rewards WHERE campaign_id = ? AND remaining > 0').bind(campaignId).all();
    const rows = rewards.results || [];
    if (!rows.length) return null;
    const campaign = await db.prepare('SELECT no_prize_weight FROM campaigns WHERE id = ?').bind(campaignId).first();
    const noPrizeWeight = Math.max(0, Number(campaign?.no_prize_weight ?? 18));
    const total = rows.reduce((sum, reward) => sum + reward.remaining, noPrizeWeight);
    let draw = randomInt(total);
    if (draw < noPrizeWeight) return null;
    draw -= noPrizeWeight;
    const chosen = rows.find((reward) => ((draw -= reward.remaining) < 0)) || rows[0];
    const decrement = await db.prepare('UPDATE rewards SET remaining = remaining - 1 WHERE id = ? AND remaining > 0').bind(chosen.id).run();
    if (!decrement.meta?.changes) continue;
    const code = await randomCode();
    const expiresAt = addMinutes(20);
    await db.prepare("UPDATE attempts SET state = 'reserved', reward_id = ?, discount_code = ?, expires_at = ? WHERE id = ? AND state = 'started'")
      .bind(chosen.id, code, expiresAt, attemptId).run();
    return { ...chosen, code, expiresAt };
  }
  return null;
}

async function refundReservedReward(db, attempt) {
  if (!attempt.reward_id) return;
  await db.batch([
    db.prepare('UPDATE rewards SET remaining = remaining + 1 WHERE id = ?').bind(attempt.reward_id),
    db.prepare("UPDATE attempts SET state = 'started', reward_id = NULL, discount_code = NULL, expires_at = NULL WHERE id = ? AND state = 'reserved'").bind(attempt.id),
  ]);
}

async function reveal(db, env, attempt) {
  let current = attempt;
  if (current.state === 'started') {
    const reservation = await reserveReward(db, current.campaign_id, current.id);
    if (!reservation) {
      await db.prepare("UPDATE attempts SET state = 'no_prize', revealed_at = ? WHERE id = ? AND state = 'started'").bind(nowIso(), current.id).run();
      return { state: 'no_prize' };
    }
    current = await db.prepare('SELECT * FROM attempts WHERE id = ?').bind(current.id).first();
  }
  if (current.state === 'reserved') {
    const reward = await db.prepare('SELECT amount_cents FROM rewards WHERE id = ?').bind(current.reward_id).first();
    try {
      const discountNodeId = await createDiscount(env, {
        code: current.discount_code,
        customerId: current.customer_id,
        amountCents: reward.amount_cents,
        expiresAt: current.expires_at,
      });
      await db.prepare("UPDATE attempts SET state = 'rewarded', discount_node_id = ?, revealed_at = ? WHERE id = ?")
        .bind(discountNodeId, nowIso(), current.id).run();
      return { state: 'rewarded', code: current.discount_code, expiresAt: current.expires_at, amountCents: reward.amount_cents };
    } catch (error) {
      // Keep the reservation for a safe retry. We never issue a second prize after an uncertain Admin API response.
      return { state: 'processing', retryable: true };
    }
  }
  return publicAttempt(await getRewardedAttempt(db, current));
}

export default {
  async fetch(request, env) {
    const route = proxyPath(new URL(request.url).pathname);
    if (!route) return json({ error: 'not_found' }, 404);
    const auth = await identity(request, env);
    if (auth.error) return auth.error;
    const payload = request.method === 'POST' ? await body(request) : Object.fromEntries(new URL(request.url).searchParams);
    const campaignId = String(payload.campaignId || '');
    if (!/^[a-z0-9-]{3,80}$/.test(campaignId) || !(await campaignIsActive(env.DB, campaignId))) return json({ error: 'campaign_unavailable' }, 404);

    let attempt = await attemptFor(env.DB, campaignId, auth.customerId);
    if (route === 'state') {
      const enrichedAttempt = await getRewardedAttempt(env.DB, attempt);
      return json(publicAttempt(enrichedAttempt));
    }
    if (route === 'start') {
      if (attempt) return json(publicAttempt(await getRewardedAttempt(env.DB, attempt)));
      const ipClaim = await env.DB.prepare('SELECT customer_id FROM ip_claims WHERE campaign_id = ? AND ip_hash = ?').bind(campaignId, auth.ipHash).first();
      if (ipClaim && ipClaim.customer_id !== auth.customerId) return json({ state: 'blocked' }, 429);
      if (!ipClaim) {
        await env.DB.prepare('INSERT OR IGNORE INTO ip_claims (campaign_id, ip_hash, customer_id) VALUES (?, ?, ?)')
          .bind(campaignId, auth.ipHash, auth.customerId).run();
        const claimed = await env.DB.prepare('SELECT customer_id FROM ip_claims WHERE campaign_id = ? AND ip_hash = ?').bind(campaignId, auth.ipHash).first();
        if (claimed.customer_id !== auth.customerId) return json({ state: 'blocked' }, 429);
      }
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO attempts (id, campaign_id, customer_id, ip_hash, state) VALUES (?, ?, ?, ?, 'started')")
        .bind(id, campaignId, auth.customerId, auth.ipHash).run();
      attempt = await attemptFor(env.DB, campaignId, auth.customerId);
      return json(publicAttempt(attempt));
    }
    if (route === 'reveal') {
      if (!attempt) return json({ error: 'start_required' }, 409);
      return json(await reveal(env.DB, env, attempt));
    }
    return json({ error: 'not_found' }, 404);
  },
};
