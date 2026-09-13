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

test('bundle product gallery shows product images and carts prioritize the two-tshirt composition', () => {
  const product = read('sections/product.liquid');
  assert.doesNotMatch(product, /fullscreen-image--bundle/);
  assert.match(product, /for image in product\.images/);

  const cart = read('sections/cart.liquid');
  assert.match(cart, /is_bundle_cart_item/);
  assert.match(cart, /bundle-cart-images/);

  const header = read('sections/header.liquid');
  assert.match(header, /const isBundle/);
  assert.match(header, /bundle-cart-images/);
});

test('bundle product displays collection breadcrumb and shipping information', () => {
  const product = read('sections/product.liquid');
  assert.match(product, /is_bundle_product/);
  assert.match(product, /BUNDLES/);
  assert.match(product, /product-free-shipping-threshold--bundle/);
});

test('bundle composition keeps both product images opaque in product and cart views', () => {
  const product = read('sections/product.liquid');
  const cart = read('sections/cart.liquid');
  const header = read('sections/header.liquid');
  [product, cart, header].forEach((source) => {
    assert.doesNotMatch(source, /bundle[\s\S]{0,600}mix-blend-mode:\s*multiply/);
    assert.match(source, /mix-blend-mode:\s*normal/);
  });
});

test('scratch-card codes are permitted to combine with Shopify discount classes', () => {
  const worker = read('services/scratch-card/src/worker.mjs');
  assert.match(worker, /combinesWith:\s*{[\s\S]*?orderDiscounts:\s*true,[\s\S]*?productDiscounts:\s*true,[\s\S]*?shippingDiscounts:\s*true/);
});

test('low stock string is "Poucas unidades" in store locales', () => {
  const en = parseThemeJson('locales/en.default.json');
  const pt = parseThemeJson('locales/pt-PT.json');
  assert.equal(en.drop.low_stock, 'Poucas unidades');
  assert.equal(pt.drop.low_stock, 'Poucas unidades');
});

test('mobile product gallery uses horizontal scroll snap and preserves page scroll', () => {
  const product = read('sections/product.liquid');
  assert.match(product, /overflow-x:\s*auto;/);
  assert.match(product, /scroll-snap-type:\s*x mandatory;/);
  assert.match(product, /smoothScrollToImage[\s\S]*?targetImage\.offsetLeft/);
});

test('product page places extinct between size options and buy button, and bundle after buy button', () => {
  const product = read('sections/product.liquid');
  const sizeOptionIndex = product.indexOf('class="size-options"');
  const extinctIndex = product.indexOf('class="product-extinct"');
  const addToCartIndex = product.indexOf('id="add-to-cart-btn"');
  const bundleCardIndex = product.indexOf('class="product-bundle"');

  assert.ok(sizeOptionIndex !== -1, 'size options must exist');
  assert.ok(extinctIndex !== -1, 'extinct element must exist');
  assert.ok(addToCartIndex !== -1, 'add to cart button must exist');
  assert.ok(bundleCardIndex !== -1, 'product bundle card must exist');

  assert.ok(sizeOptionIndex < extinctIndex, 'size options must come before extinct');
  assert.ok(extinctIndex < addToCartIndex, 'extinct must come before add to cart button');
  assert.ok(addToCartIndex < bundleCardIndex, 'add to cart button must come before bundle card');
});

test('drop bundle section keeps overlapping shirt images visible on mobile and desktop', () => {
  const dropBundle = read('sections/drop-bundle.liquid');
  assert.match(dropBundle, /\.drop-bundle-section \.drop-bundle-card__images img:first-child[\s\S]*?transform:\s*rotate\(-4deg\)/);
  assert.match(dropBundle, /\.drop-bundle-section \.drop-bundle-card__images img:last-child[\s\S]*?transform:\s*rotate\(4deg\)/);
  assert.doesNotMatch(dropBundle, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.drop-bundle-card__images\s*\{\s*display:\s*none/);
  assert.match(dropBundle, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.drop-bundle-card__images\s*\{[\s\S]*?display:\s*block/);
});

test('mobile product page places gallery, title, buying options and bundle first, moving info sections below', () => {
  const product = read('sections/product.liquid');
  const mobileMedia = product.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\s*@media/);
  assert.ok(mobileMedia, 'mobile media query <= 768px must exist');
  const css = mobileMedia[1];

  assert.match(css, /\.product-col-left\s*\{[\s\S]*?display:\s*contents;/);
  assert.match(css, /\.product-col-center\s*\{[\s\S]*?order:\s*1;/);
  assert.match(css, /\.product-breadcrumb\s*\{[\s\S]*?order:\s*2;/);
  assert.match(css, /\.product-title-row\s*\{[\s\S]*?order:\s*3;/);
  assert.match(css, /\.product-col-right\s*\{[\s\S]*?order:\s*4;/);
  assert.match(css, /\.product-info-sections\s*\{[\s\S]*?order:\s*5;/);
});

test('product page displays yellow dot for low stock and red dot for extinct', () => {
  const product = read('sections/product.liquid');
  assert.match(product, /\.product-low-stock::before\s*\{[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*#eab308;/);
  assert.match(product, /\.product-extinct::before\s*\{[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*#dc2626;/);
});

test('product page bundle renders drop-bundle-card with hide_images and two separate size dropdowns', () => {
  const product = read('sections/product.liquid');
  assert.match(product, /render 'drop-bundle-card'[\s\S]*?hide_images:\s*true/);
  assert.match(product, /\.product-bundle \.drop-bundle-card__offer[\s\S]*?background:\s*#7a1228/);
  assert.match(product, /\.product-bundle \.drop-bundle-card__sizes select/);
  assert.match(product, /\.product-bundle \.drop-bundle-card__button/);

  const snippet = read('snippets/drop-bundle-card.liquid');
  assert.match(snippet, /data-drop-bundle-size="one"/);
  assert.match(snippet, /data-drop-bundle-size="two"/);
  assert.match(snippet, /drop-bundle-card__offer-logo/);
});
