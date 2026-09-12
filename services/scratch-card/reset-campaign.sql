-- TEST RESET: Cleans attempts, ip_claims and resets reward quotas so you can test again.
DELETE FROM attempts WHERE campaign_id = 'secrets-sinners-2026';
DELETE FROM ip_claims WHERE campaign_id = 'secrets-sinners-2026';
UPDATE rewards SET remaining = initial_quantity WHERE campaign_id = 'secrets-sinners-2026';

-- Make sure campaign is active for testing (active = 1 means playable; active = 0 disables the promotion):
UPDATE campaigns SET active = 1, no_prize_weight = 18 WHERE id = 'secrets-sinners-2026';
