const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Liquid, filters } = require('../artifacts/try-on/runtime/node_modules/liquidjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const starts = '2026-11-27T00:00:00+01:00';
const ends = '2026-11-28T00:00:00Z';
const start = Date.parse(starts);
const end = Date.parse(ends);

function engine(settings) {
  const liquid = new Liquid({
    root: path.join(root, 'snippets'),
    extname: '.liquid',
    preserveTimezones: true,
    globals: { settings }
  });
  liquid.registerFilter('json', JSON.stringify);
  liquid.registerFilter('money_with_currency', (amount) => `${(amount / 100).toFixed(2)} EUR`);
  liquid.registerFilter('t', (key) => key);
  // LiquidJS's timezone-preserving formatter shifts %s by the display offset.
  liquid.registerFilter('date', function (value, format) {
    if (format === '%s' && Number.isFinite(Date.parse(value))) return String(Date.parse(value) / 1000);
    return filters.date.call(this, value, format);
  });
  return liquid;
}

async function renderSchedule(settings, now) {
  const schedule = read('snippets/black-friday-schedule.liquid').replace("'now'", `'${now}'`);
  return engine(settings).parseAndRender(`<html lang="pt-PT"${schedule}>`);
}

test('the schedule requires a valid end and starts inclusively in the configured time zone', async () => {
  const settings = { enable_black_friday: true, black_friday_starts_at: starts, black_friday_ends_at: ends };
  const before = await renderSchedule(settings, '2026-11-26T22:59:59Z');
  assert.ok(before.includes(`data-black-friday-start="${start / 1000}"`));
  assert.ok(before.includes(`data-black-friday-end="${end / 1000}"`));
  assert.doesNotMatch(before, /data-black-friday-active/);
  assert.match(await renderSchedule(settings, '2026-11-26T23:00:00Z'), /data-black-friday-active/);
  assert.doesNotMatch(await renderSchedule(settings, ends), /data-black-friday-active/);
  assert.match(await renderSchedule({ ...settings, black_friday_starts_at: '' }, '2026-11-22T00:00:00Z'), /data-black-friday-active/);

  for (const invalid of [
    { enable_black_friday: false },
    { black_friday_ends_at: '' },
    { black_friday_ends_at: starts },
    { black_friday_ends_at: '2026-11-28T00:00:00' },
    { black_friday_starts_at: 'now' },
    { black_friday_starts_at: '2026-02-31T00:00:00Z' }
  ]) {
    assert.equal(await renderSchedule({ ...settings, ...invalid }, starts), '<html lang="pt-PT">');
  }
});

test('variant prices serialize as script-safe HTML and only catalogue prices are discounted', async () => {
  const liquid = engine({ enable_black_friday: true });
  const product = { type: 'T-Shirt', 'gift_card?': false };
  const render = (args) => liquid.parseAndRender(`{% render 'price', amount: 6299${args} %}`, { product });
  const markup = await render(", catalog_product: product, output: 'json'");
  assert.doesNotMatch(markup, /</);
  assert.match(JSON.parse(markup), /black-friday-price[\s\S]*50\.39 EUR[\s\S]*<s[^>]*>62\.99 EUR<\/s>/);
  assert.equal(await render(''), '62.99 EUR');
  assert.equal(await engine({}).parseAndRender("{% render 'price', amount: 6299, catalog_product: product %}", { product }), '62.99 EUR');
});

test('gift card products retain their regular price even when Black Friday is enabled', async () => {
  const liquid = engine({ enable_black_friday: true });
  const source = "{% render 'price', amount: 2500, catalog_product: product, output: 'json' %}";
  for (const product of [{ 'gift_card?': true }, { type: 'Gift Card' }]) {
    assert.equal(JSON.parse(await liquid.parseAndRender(source, { product })), '25.00 EUR');
  }
});

test('the countdown updates prices in place at the start and restores the announcement at the end', () => {
  let now = start - 1000;
  let active = false;
  let tick;
  const label = { dataset: { startsIn: 'Starts', endsIn: 'Ends' } };
  const timer = { dataset: { format: '__DAYS__d __HOURS__h __MINUTES__m __SECONDS__s' } };
  const standard = {};
  const announcement = {
    parentElement: { querySelector: () => standard },
    querySelector: (selector) => selector === '[data-black-friday-label]' ? label : timer
  };
  const document = {
    documentElement: {
      hasAttribute: () => true,
      dataset: { blackFridayStart: start / 1000, blackFridayEnd: end / 1000 },
      toggleAttribute: (name, state) => {
        assert.equal(name, 'data-black-friday-active');
        active = state;
      }
    },
    querySelector: () => announcement,
    addEventListener() {}
  };
  vm.runInNewContext(read('assets/black-friday.js'), {
    Date: { now: () => now },
    document,
    window: { addEventListener() {} },
    setTimeout: (callback) => { tick = callback; },
    clearTimeout: () => { tick = undefined; }
  });
  assert.equal(active, false);
  assert.equal(label.textContent, 'Starts');
  assert.equal(timer.textContent, '0d 0h 0m 1s');
  assert.equal(standard.hidden, true);

  now = start;
  tick();
  assert.equal(active, true);
  assert.equal(label.textContent, 'Ends');

  now = end;
  tick();
  assert.equal(active, false);
  assert.equal(announcement.hidden, true);
  assert.equal(standard.hidden, false);
  assert.equal(tick, undefined);
});
