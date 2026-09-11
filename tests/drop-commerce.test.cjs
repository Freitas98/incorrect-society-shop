const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const parseThemeJson = (file) => JSON.parse(
  read(file)
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    .replace(/,\s*([}\]])/g, '$1')
);

test('drop settings expose the bundle, stock, delivery and closing controls', () => {
  const schema = parseThemeJson('config/settings_schema.json');
  const group = schema.find((entry) => entry.name === 'Current Drop & Delivery');
  assert.ok(group);
  const ids = new Set(group.settings.map((setting) => setting.id));
  [
    'enable_drop_features',
    'drop_collection',
    'drop_close_at',
    'drop_bundle_product',
    'drop_bundle_component_one',
    'drop_bundle_component_two',
    'free_shipping_threshold',
    'low_stock_ratio',
    'shipping_carrier_name',
    'shipping_cutoff_time',
  ].forEach((id) => assert.ok(ids.has(id), `missing ${id}`));
});

test('product commerce code parses and keeps Shopify inventory authoritative', () => {
  const product = read('sections/product.liquid');
  const javascript = product.match(/\{% javascript %\}([\s\S]*?)\{% endjavascript %\}/);
  assert.ok(javascript, 'missing product JavaScript block');
  assert.doesNotThrow(() => new Function(javascript[1]));
  assert.match(product, /variant\.metafields\.custom\.drop_initial_stock/);
  assert.match(product, /variant\.inventory_management === 'shopify'/);
  assert.match(product, /variant\.inventory_policy === 'deny'/);
  assert.match(product, /window\.addItemsToCartAndUpdate/);
  assert.match(product, /function isSizeInput\(input\)/);
  assert.match(product, /selectedSizeOutOfStock/);
  assert.doesNotMatch(product, /const anyExtinct/);
});

test('cart additions reject failed Shopify responses before reporting a cart update', () => {
  const header = read('sections/header.liquid');
  const javascript = header.match(/\{% javascript %\}([\s\S]*?)\{% endjavascript %\}/);
  assert.ok(javascript, 'missing header JavaScript block');
  assert.doesNotThrow(() => new Function(javascript[1]));
  assert.match(header, /if \(!response\.ok\) throw await responseError/);
  assert.match(header, /if \(!cartResponse\.ok\)/);
  assert.match(header, /window\.Shopify\?\.routes\?\.root/);
});

test('only the two requested heroes enable rounded lower corners', () => {
  const homepage = parseThemeJson('templates/index.json');
  const allProducts = parseThemeJson('templates/page.all-products.json');
  assert.equal(homepage.sections.hero_editorial.settings.round_bottom_corners, true);
  assert.equal(allProducts.sections.hero_editorial.settings.round_bottom_corners, true);
});

test('announcement bar supports up to 3 configurable messages with brand icon separator', () => {
  const announcement = read('sections/announcement-bar.liquid');
  assert.match(announcement, /message_1/);
  assert.match(announcement, /message_2/);
  assert.match(announcement, /message_3/);
  assert.match(announcement, /announcement-icon-wrap/);
  assert.match(announcement, /Logo_white\.svg/);
  assert.match(announcement, /announcement-scroll/);
});
