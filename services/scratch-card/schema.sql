PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  no_prize_weight INTEGER NOT NULL DEFAULT 18 CHECK (no_prize_weight >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
  UNIQUE (campaign_id, amount_cents)
);

CREATE TABLE IF NOT EXISTS ip_claims (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, ip_hash)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started', 'reserved', 'rewarded', 'no_prize')),
  reward_id TEXT REFERENCES rewards(id),
  discount_code TEXT,
  discount_node_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revealed_at TEXT,
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS attempts_campaign_state_idx ON attempts (campaign_id, state);

-- Create the drop only once. These are absolute maximums, not replenishing quotas.
-- Initial probabilities for ~100 participants: €3 ≈ 10.4%, €2 ≈ 20.8%, €1 ≈ 31.3%, no prize ≈ 37.5%.
-- Overall win rate initially is ~62.5%, allowing virtually all 30 prizes to be claimed within ~100 participants.
INSERT OR IGNORE INTO campaigns (id, active, no_prize_weight) VALUES ('secrets-sinners-2026', 0, 18);
INSERT OR IGNORE INTO rewards (id, campaign_id, amount_cents, remaining, initial_quantity) VALUES
  ('secrets-sinners-2026-eur-3', 'secrets-sinners-2026', 300, 5, 5),
  ('secrets-sinners-2026-eur-2', 'secrets-sinners-2026', 200, 10, 10),
  ('secrets-sinners-2026-eur-1', 'secrets-sinners-2026', 100, 15, 15);
