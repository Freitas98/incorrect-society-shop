const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scriptSource = fs.readFileSync(path.join(__dirname, '../assets/secure-scratch-card.js'), 'utf8');

test('secure-scratch-card.js sends campaignId on all request routes', () => {
  assert.match(scriptSource, /endpoint \+ '\/' \+ route \+ '\?campaignId=' \+ encodeURIComponent\(campaignId\)/);
});

test('secure-scratch-card.js handles processing state gracefully without resetting to intro', () => {
  assert.match(scriptSource, /if \(reply\.data\.state === 'started' \|\| reply\.data\.state === 'processing'\)/);
});

test('secure-scratch-card.js includes fallback canvas dimensions', () => {
  assert.match(scriptSource, /rect\.width \|\| card\.offsetWidth \|\| 360/);
  assert.match(scriptSource, /rect\.height \|\| card\.offsetHeight \|\| 218/);
});

test('secure-scratch-card.js hides code details while scratching and reveals on finish', () => {
  assert.match(scriptSource, /details\.style\.display = 'none'/);
  assert.match(scriptSource, /card\.classList\.add\('is-revealed'\)/);
});

test('reset-campaign.sql activates campaign for testing', () => {
  const resetSql = fs.readFileSync(path.join(__dirname, '../services/scratch-card/reset-campaign.sql'), 'utf8');
  assert.match(resetSql, /UPDATE campaigns SET active = 1/);
});
