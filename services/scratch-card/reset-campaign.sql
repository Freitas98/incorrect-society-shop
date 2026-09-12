-- TEST RESET ONLY. Disable the theme section and campaign, then wait 20 minutes
-- for issued coupons to expire before running this file.
UPDATE campaigns SET active = 0, no_prize_weight = 18 WHERE id = 'secrets-sinners-2026';
DELETE FROM attempts WHERE campaign_id = 'secrets-sinners-2026';
DELETE FROM ip_claims WHERE campaign_id = 'secrets-sinners-2026';
UPDATE rewards SET remaining = initial_quantity WHERE campaign_id = 'secrets-sinners-2026';

-- Enable only when you intentionally open the campaign:
-- UPDATE campaigns SET active = 1 WHERE id = 'secrets-sinners-2026';
