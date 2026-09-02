const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../layout/password.liquid'), 'utf8');
const script = source.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const openingTime = Date.parse('2030-10-01T18:00:00Z');
const fixturePassword = 'test-fixture-only';

test('shop description visibility is a password page checkbox, enabled by default', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/settings_schema.json'), 'utf8'));
  const passwordSettings = schema.find((group) => group.name === 'Password Page').settings;
  const descriptionSettings = passwordSettings.filter((setting) => setting.id === 'password_show_shop_description');
  assert.equal(descriptionSettings.length, 1);
  assert.equal(descriptionSettings[0].type, 'checkbox');
  assert.equal(descriptionSettings[0].default, true);
});

test('description markup is gated by its setting and a nonempty store description', () => {
  assert.match(source, /\{%\s*if settings\.password_show_shop_description and shop\.description != blank\s*%\}\s*<p class="password-shop-description">[\s\S]*?<\/p>\s*\{%\s*endif\s*%\}/);
});

test('description escapes HTML before preserving line breaks', () => {
  assert.match(source, /<p class="password-shop-description">\{\{\s*shop\.description\s*\|\s*escape\s*\|\s*newline_to_br\s*\}\}<\/p>/);
});

test('description inherits the page font and sits between the logo and timer', () => {
  const descriptionIndex = source.indexOf('<p class="password-shop-description">');
  assert.ok(descriptionIndex > source.indexOf('<div class="password-logo-container">'));
  assert.ok(descriptionIndex < source.indexOf('<div class="password-timer"'));
  assert.match(source, /\.password-shop-description\s*\{[^}]*font-family:\s*inherit;/);
});

// Execute the actual page script with an isolated DOM and clock. No Shopify requests.
function createPage({ enabled, now, readyState = 'complete', initialInput = '' }) {
  let clock = now;
  const elements = new Map();
  const intervals = new Map();
  const listeners = new Map();
  let nextInterval = 0;

  for (const id of [
    'password-timer', 'password-input-group', 'password-enter-btn', 'password-input',
    'timer-days', 'timer-hours', 'timer-minutes', 'timer-seconds',
  ]) {
    const classes = new Set();
    const attributes = new Set(id === 'password-input' ? ['required'] : []);
    elements.set(id, {
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
      },
      value: id === 'password-input' ? initialInput : '',
      textContent: '00',
      removeAttribute: (name) => attributes.delete(name),
      hasAttribute: (name) => attributes.has(name),
    });
  }

  class ControlledDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
  }

  // Replace configuration lines wholesale so real theme passwords are never evaluated or logged.
  const renderedScript = script
    .replace(/const TIMER_ENABLED = [^\r\n]+/, `const TIMER_ENABLED = ${JSON.stringify(enabled)};`)
    .replace(/const SHOP_OPEN_DATE = [^\r\n]+/, `const SHOP_OPEN_DATE = new Date(${openingTime});`)
    .replace(/const AUTO_PASSWORD = [^\r\n]+/, `const AUTO_PASSWORD = ${JSON.stringify(fixturePassword)};`);

  vm.runInNewContext(renderedScript, {
    Date: ControlledDate,
    document: {
      readyState,
      getElementById: (id) => elements.get(id),
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    setInterval(callback, delay) {
      assert.equal(delay, 1000);
      const id = ++nextInterval;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
  });

  return {
    get: (id) => elements.get(id),
    intervals,
    ready: () => listeners.get('DOMContentLoaded')(),
    tick(time) {
      clock = time;
      for (const callback of [...intervals.values()]) callback();
    },
  };
}

function assertManualEntry(page, countdownVisible) {
  assert.equal(page.get('password-timer').classList.contains('active'), countdownVisible);
  assert.equal(page.get('password-input-group').classList.contains('hidden'), false);
  assert.equal(page.get('password-enter-btn').classList.contains('active'), false);
  assert.equal(page.get('password-input').hasAttribute('required'), true);
  assert.equal(page.get('password-input').value, '');
}

function assertEnterButton(page) {
  assert.equal(page.get('password-timer').classList.contains('active'), false);
  assert.equal(page.get('password-input-group').classList.contains('hidden'), true);
  assert.equal(page.get('password-enter-btn').classList.contains('active'), true);
  assert.equal(page.get('password-input').value, fixturePassword);
  assert.equal(page.get('password-input').hasAttribute('required'), false);
  assert.equal(page.intervals.size, 0);
}

test('Liquid configuration preserves false and emits a JSON boolean', () => {
  assert.match(script, /const TIMER_ENABLED = \{\{\s*settings\.password_timer_enabled\s*\|\s*default:\s*true,\s*allow_false:\s*true\s*\|\s*json\s*\}\};/);
});

for (const [label, offset] of [['before', -1000], ['at', 0], ['after', 1000]]) {
  test(`disabled countdown: manual password entry ${label} opening`, () => {
    const page = createPage({ enabled: false, now: openingTime + offset });
    assertManualEntry(page, false);
    assert.equal(page.intervals.size, 0);
    page.tick(openingTime + 60000);
    assertManualEntry(page, false);
  });
}

test('enabled countdown: countdown and manual input remain visible before opening', () => {
  const page = createPage({ enabled: true, now: openingTime - 90061000 });
  assertManualEntry(page, true);
  for (const unit of ['days', 'hours', 'minutes', 'seconds']) {
    assert.equal(page.get(`timer-${unit}`).textContent, '01');
  }
  assert.equal(page.intervals.size, 1);
});

for (const [label, offset] of [['at', 0], ['after', 1000]]) {
  test(`enabled countdown: prefilled ENTER button ${label} opening`, () => {
    assertEnterButton(createPage({ enabled: true, now: openingTime + offset }));
  });
}

test('countdown transitions to ENTER without reloading and stops its interval', () => {
  const page = createPage({ enabled: true, now: openingTime - 2000 });
  assertManualEntry(page, true);
  page.get('password-input').value = 'unfinished-manual-entry';
  page.tick(openingTime - 1000);
  assert.equal(page.get('timer-seconds').textContent, '01');
  assert.equal(page.get('password-input').value, 'unfinished-manual-entry');
  page.tick(openingTime);
  assertEnterButton(page);
});

test('disabled countdown preserves user input rather than auto-filling it', () => {
  const page = createPage({ enabled: false, now: openingTime + 1000, initialInput: 'manual-entry' });
  assert.equal(page.get('password-input').value, 'manual-entry');
  assert.equal(page.get('password-input').hasAttribute('required'), true);
});

test('initialization also runs through DOMContentLoaded', () => {
  const page = createPage({ enabled: true, now: openingTime, readyState: 'loading' });
  assert.equal(page.get('password-enter-btn').classList.contains('active'), false);
  page.ready();
  assertEnterButton(page);
});
