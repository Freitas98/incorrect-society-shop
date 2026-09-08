/* On-device camera/photo try-on. No frame or photo is sent to a server. */
(() => {
  'use strict';
  if (window.IncorrectTryOn) return;
  const instances = new Map();

  class TryOn {
    constructor(dialog) {
      this.dialog = dialog;
      this.section = dialog.closest('.shopify-section') || document;
      this.config = JSON.parse(dialog.querySelector('[data-vto-config]').textContent);
      this.q = role => dialog.querySelector('[data-vto-' + role + ']');
      this.text = this.config.strings;
      this.media = this.q('media');
      this.ctx = this.media.getContext('2d');
      this.canvas = this.q('canvas');
      this.foreground = this.q('foreground');
      this.foregroundCtx = this.foreground.getContext('2d');
      this.maskCanvas = document.createElement('canvas');
      this.maskCtx = this.maskCanvas.getContext('2d');
      this.cutout = document.createElement('canvas');
      this.cutoutCtx = this.cutout.getContext('2d');
      this.warpCanvas = document.createElement('canvas');
      this.warpCtx = this.warpCanvas.getContext('2d', {willReadFrequently: true});
      this.stage = this.q('stage');
      this.input = this.q('file');
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.playsInline = true;
      this.generation = 0;
      this.session = 0;
      this.pending = false;
      this.facing = 'user';
      this.mode = null;
      this.frameInterval = 50;
      this.events = new AbortController();

      // Active garment product and variants
      this.activeProduct = this.config.currentProduct || { id: '', title: '', priceFormatted: '', model: this.config.model };
      this.activeVariants = this.config.variants || [];
      this.selectedVariantId = null;
      this.profile = {};
      this.modelRevision = 0;
      // iOS does not expose deviceMemory. Missing hints are NOT evidence that a
      // phone can sustain desktop rendering and two neural networks indefinitely.
      this.mobile = window.matchMedia('(pointer: coarse)').matches;
      this.autoLowPower = this.mobile || (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory ?? 4) <= 4;
      this.lowPower = this.autoLowPower;

      const on = (el, event, fn) => el.addEventListener(event, fn, { signal: this.events.signal });
      on(dialog, 'click', e => {
        const action = e.target.closest('[data-vto-action]')?.dataset.vtoAction;
        if (e.target === dialog || action === 'close') this.close();
        if (action === 'camera') this.startCamera();
        if (action === 'upload') this.input.click();
        if (action === 'flip') { this.facing = this.facing === 'user' ? 'environment' : 'user'; this.startCamera(); }
        if (action === 'save') this.save();
        if (action === 'product') this.close();
      });

      on(dialog, 'cancel', () => this.close());
      on(dialog, 'close', () => { if (!dialog.open) this.cleanup(); });
      on(this.input, 'change', () => { const file = this.input.files[0]; if (file) this.startPhoto(file); this.input.value = ''; });
      on(document, 'visibilitychange', () => { if (document.hidden && this.mode === 'camera') this.close(); });

      // Prevent gestures on stage canvas from hijacking mobile drawer scroll
      this.stage.addEventListener('touchmove', e => {
        if (!e.target.closest('.vto-choices-card') && !e.target.closest('.vto-stage-btn')) {
          e.preventDefault();
        }
      }, { signal: this.events.signal, passive: false });

      this.contextLost = e => { e.preventDefault(); if (this.opened) this.fail('webglLost'); };
      this.canvas.addEventListener('webglcontextlost', this.contextLost);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);

      // Initialize sizes, add-to-cart, collection catalog and slider feedback
      this.initCommerce();
      on(dialog, 'input', e => {
        const key = e.target.dataset.vtoProfile;
        if (!key) return;
        this.profile[key] = e.target.value;
        this.updateMeasurements();
        this.refit();
      });
      on(this.q('clear-profile'), 'click', () => {
        this.profile = {};
        dialog.querySelectorAll('input[data-vto-profile]').forEach(el => { el.value = ''; });
        dialog.querySelector('[data-vto-profile="method"]').value = 'shirt';
        dialog.querySelector('[data-vto-profile="preference"]').value = 'boxy';
        this.updateMeasurements(); this.refit();
      });
      on(this.q('use-recommendation'), 'click', () => {
        const variant = this.activeVariants.find(v => this.sizing?.sizeKey(v, this.activeProduct.optionNames) === this.recommendation?.key);
        if (variant) this.selectVariant(variant.id);
      });
      on(this.q('quality'), 'change', e => {
        const lowPower = e.target.value === 'lite' || this.autoLowPower;
        if (lowPower === this.lowPower) return;
        this.lowPower = lowPower;
        this.engine?.setQuality(lowPower);
        this.loadModel(this.modelKey, true);this.resize();
      });
    }

    initCommerce() {
      // 1. Initial size selection
      this.renderSizes();

      // 2. Render suggested collection items
      const grid = this.q('collection-grid');
      if (grid && Array.isArray(this.config.collectionItems) && this.config.collectionItems.length) {
        grid.innerHTML = '';
        this.config.collectionItems.forEach(item => {
          const card = document.createElement('div');
          card.className = 'vto-catalog-card' + (item.id === this.activeProduct.id ? ' active' : '');
          card.setAttribute('data-item-id', String(item.id));
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');

          const img = document.createElement('img');
          img.className = 'vto-catalog-thumb';
          img.src = item.featuredImage || '';
          img.alt = item.title || '';
          img.loading = 'lazy';

          const info = document.createElement('div');
          info.className = 'vto-catalog-info';

          const title = document.createElement('div');
          title.className = 'vto-catalog-title';
          title.textContent = item.title;

          const price = document.createElement('div');
          price.className = 'vto-catalog-price';
          price.textContent = item.priceFormatted || '';

          info.appendChild(title);
          info.appendChild(price);

          const badge = document.createElement('span');
          badge.className = 'vto-catalog-badge';
          badge.textContent = this.text.tryPiece || 'Try';

          card.appendChild(img);
          card.appendChild(info);
          card.appendChild(badge);

          const activate = () => this.switchGarment(item);
          card.addEventListener('click', activate);
          card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
          });

          grid.appendChild(card);
        });
      }

      // 3. Add to cart button
      const addBtn = this.q('add-cart');
      if (addBtn) {
        addBtn.addEventListener('click', () => this.addToCart());
      }
    }

    updateMeasurements() {
      if (!this.sizing) return;
      const s = this.sizing, t = this.config.fitStrings, chart = this.config.measurements;
      const profile = s.profileValues(this.profile);
      this.bodyShoulder = profile.shoulder;
      this.bodyChest = profile.chest;
      this.q('profile-shirt').hidden = profile.method !== 'shirt';
      this.q('profile-body').hidden = profile.method !== 'body';
      const selected = this.activeVariants.find(v => v.id === this.selectedVariantId);
      this.sizeKey = s.sizeKey(selected, this.activeProduct.optionNames);
      this.measurements = s.dimensions(chart, this.sizeKey);
      this.ratios = s.garmentRatios(chart, this.sizeKey);
      const list = this.q('measurements'); list.replaceChildren();
      if (this.measurements) {
        const title = document.createElement('strong'); title.textContent = t.measurements; list.append(title);
        for (const [key, label] of [['chest', t.width], ['length', t.length], ['shoulder', t.garmentShoulder], ['sleeve', t.sleeve], ['opening', t.opening]]) {
          const row = document.createElement('span');
          row.textContent = label.replace(/ \(cm\)/, '') + ': ' + this.measurements[key] + ' cm'; list.append(row);
        }
      }
      const recommendation = s.recommend(chart, this.profile, this.activeVariants, this.activeProduct.optionNames);
      this.recommendation = recommendation;
      const signed = n => (n > 0 ? '+' : '') + Math.round(n * 10) / 10;
      const format = (message, values) => Object.entries(values).reduce((str, [k, v]) => str.replaceAll('{' + k + '}', v), message);
      let advice = t[recommendation.status];
      if (recommendation.key) {
        advice = format(advice, {size: recommendation.key});
        advice += '\n' + (recommendation.method === 'shirt'
          ? format(t.difference, {width: signed(recommendation.widthDelta), length: signed(recommendation.lengthDelta)})
          : format(t.ease, {ease: signed(recommendation.ease)}));
        if (recommendation.tied.length > 1) advice += '\n' + format(t.tie, {sizes: recommendation.tied.join(' / ')});
        if (!recommendation.available) advice += '\n' + t.soldout;
        advice += '\n' + format(t.tolerance, {tolerance: recommendation.tolerance});
      }
      const invalid = [...this.dialog.querySelectorAll('input[data-vto-profile]')].some(el => !el.closest('[hidden]') && !el.validity.valid);
      this.q('fit-advice').textContent = invalid ? t.invalid : advice;
      this.q('use-recommendation').hidden = invalid || !recommendation.key;
      this.q('fit-scale').textContent = !this.measurements ? t.unsupported : profile.shoulder ? t.calibrated : t.uncalibrated;
    }

    renderSizes() {
      const container = this.q('sizes');
      const label = this.dialog.querySelector('[data-vto-active-size-label]');
      if (!container) return;
      container.innerHTML = '';

      const variants = this.activeVariants || [];
      if (!this.selectedVariantId || !variants.some(v => v.id === this.selectedVariantId)) {
        const firstAvail = variants.find(v => v.available) || variants[0];
        this.selectedVariantId = firstAvail ? firstAvail.id : null;
      }

      variants.forEach(variant => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vto-size-btn' + (variant.id === this.selectedVariantId ? ' active' : '') + (!variant.available ? ' is-soldout' : '');
        btn.textContent = variant.title || variant.options?.[0] || 'Size';
        btn.setAttribute('data-variant-id', String(variant.id));
        btn.setAttribute('aria-pressed', String(variant.id === this.selectedVariantId));
        if (!variant.available) btn.setAttribute('aria-label', btn.textContent + ' — ' + this.text.outOfStock);

        btn.addEventListener('click', () => {
          this.selectVariant(variant.id);
        });
        container.appendChild(btn);
      });

      const selected = variants.find(v => v.id === this.selectedVariantId);
      if (label && selected) {
        label.textContent = selected.title || selected.options?.[0] || '';
      }
      this.updateMeasurements();
      this.updateAddCartState();
    }

    selectVariant(variantId) {
      if (!this.activeVariants.some(v => v.id === variantId)) return;
      this.selectedVariantId = variantId;
      const container = this.q('sizes');
      if (container) {
        container.querySelectorAll('.vto-size-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-variant-id') === String(variantId));
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-variant-id') === String(variantId)));
        });
      }
      const label = this.dialog.querySelector('[data-vto-active-size-label]');
      const selected = this.activeVariants.find(v => v.id === variantId);
      if (label && selected) {
        label.textContent = selected.title || selected.options?.[0] || '';
      }
      this.updateMeasurements();
      this.updateAddCartState();
      this.loadModel(selected?.model || this.activeProduct.model);
      this.refit();
    }

    updateAddCartState() {
      const btn = this.q('add-cart');
      const textEl = this.dialog.querySelector('[data-vto-cart-cta-text]');
      const priceEl = this.dialog.querySelector('[data-vto-cart-cta-price]');
      const stockBadge = this.dialog.querySelector('[data-vto-stock-badge]');
      if (!btn) return;

      const variant = this.activeVariants.find(v => v.id === this.selectedVariantId);
      if (!variant || !variant.available) {
        btn.disabled = true;
        if (textEl) textEl.textContent = this.text.outOfStock || 'Sold out';
        if (stockBadge) {
          stockBadge.textContent = this.text.outOfStock || 'Sold out';
          stockBadge.classList.add('out-of-stock');
        }
      } else {
        btn.disabled = !!this.cartPending;
        if (textEl) textEl.textContent = this.text.addToCart || 'Add to cart';
        if (priceEl && variant.priceFormatted) priceEl.textContent = variant.priceFormatted;
        if (stockBadge) {
          stockBadge.textContent = this.config.fitStrings.available;
          stockBadge.classList.remove('out-of-stock');
        }
      }
      if (variant?.priceFormatted) {
        if (priceEl) priceEl.textContent=variant.priceFormatted;
        const displayedPrice=this.q('product-price');
        if(displayedPrice)displayedPrice.textContent=variant.priceFormatted;
      }
    }

    async switchGarment(item) {
      if (!item || item.id === this.activeProduct?.id) return;
      this.activeProduct = item;
      this.activeVariants = item.variants || [];

      // Update texts in DOM
      const headerTitle = this.dialog.querySelector('[data-vto-header-title]');
      const nameEl = this.dialog.querySelector('[data-vto-product-name]');
      const priceEl = this.dialog.querySelector('[data-vto-product-price]');
      const cartPriceEl = this.dialog.querySelector('[data-vto-cart-cta-price]');

      if (headerTitle) headerTitle.textContent = item.title;
      if (nameEl) nameEl.textContent = item.title;
      if (priceEl && item.priceFormatted) priceEl.textContent = item.priceFormatted;
      if (cartPriceEl && item.priceFormatted) cartPriceEl.textContent = item.priceFormatted;

      // Update catalog cards highlight
      const grid = this.q('collection-grid');
      if (grid) {
        grid.querySelectorAll('.vto-catalog-card').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-item-id') === String(item.id));
        });
      }

      // Re-render size options for new piece
      this.renderSizes();
      this.loadModel(this.activeVariants.find(v => v.id === this.selectedVariantId)?.model || item.model);
    }

    async loadModel(key, force = false) {
      if (!key || !this.config.models[key]) {
        this.modelKey = ''; this.loadedModelKey = ''; this.modelRevision++; this.engine?.hide(); this.status('unsupported');
        this.dialog.querySelectorAll('[data-vto-action="camera"],[data-vto-action="upload"]').forEach(el => { el.disabled = true; });
        return;
      }
      this.dialog.querySelectorAll('[data-vto-action="camera"],[data-vto-action="upload"]').forEach(el => { el.disabled = false; });
      if (key && (force || key !== this.modelKey) && this.config.models[key]) {
        this.modelKey = key; this.loadedModelKey = '';
        const revision = ++this.modelRevision, session = this.session;
        if (this.engine) {
          this.engine.hide();
          this.q('busy').hidden = false;
          try {
            await this.engine.load(this.modelUrl(), this.abort?.signal);
            if (revision !== this.modelRevision || session !== this.session) return;
            this.loadedModelKey = key;
            this.refit();
          } catch (e) {
            if (revision === this.modelRevision && session === this.session) {
              this.enginePromise = null; this.fail('engineError');
            }
          } finally {
            if (revision === this.modelRevision && session === this.session) this.q('busy').hidden = true;
          }
        }
      }
    }

    async addToCart() {
      const variant = this.activeVariants.find(v => v.id === this.selectedVariantId);
      if (!variant?.available || this.cartPending) return;
      const session = this.session, productTitle = this.activeProduct.title;
      const toast = this.q('cart-toast'), label = this.q('cart-cta-text');
      this.cartPending = true; this.updateAddCartState();
      if (label) label.textContent = this.text.addingToCart;
      if (toast) toast.hidden = true;
      const root = window.Shopify?.routes?.root || '/';
      let confirmed = false, serverMessage = '';
      try {
        const response = await fetch(root + 'cart/add.js', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({items: [{id: variant.id, quantity: 1}]})
        });
        confirmed = response.ok;
        const added = await response.json();
        if (!response.ok || added.status >= 400) {
          confirmed = false;
          serverMessage = typeof added.description === 'string' ? added.description : this.config.fitStrings.cartError;
          throw new Error('cartRejected');
        }
        // A failed refresh must never invite a duplicate add after a successful POST.
        let refreshed = false;
        try {
          const res = await fetch(root + 'cart.js', {cache: 'no-store'});
          if (!res.ok) throw new Error('cartRefresh');
          const cart = await res.json();
          window.dispatchEvent(new CustomEvent('cartUpdated', {detail: {cart, source: 'try-on'}}));
          refreshed = true;
        } catch { /* The cart page can reconcile a confirmed add without repeating it. */ }
        if (session === this.session && this.opened && toast) {
          toast.hidden = false;
          toast.textContent = productTitle + ' (' + variant.title + ') — ' + this.text.addedToCart;
          if (!refreshed) this.appendCartLink(toast, root, this.config.fitStrings.cartRefresh);
        }
      } catch {
        if (session === this.session && this.opened && toast) {
          toast.hidden = false;
          toast.textContent = serverMessage;
          if (!serverMessage) this.appendCartLink(toast, root, confirmed ? this.config.fitStrings.cartRefresh : this.config.fitStrings.cartUnknown);
        }
      } finally {
        this.cartPending = false;
        if (!this.events.signal.aborted) this.updateAddCartState();
      }
    }

    appendCartLink(toast, root, message) {
      const link = document.createElement('a');
      link.href = root + 'cart'; link.textContent = this.config.fitStrings.viewCart;
      toast.append(document.createTextNode(' ' + message + ' '), link);
    }

    selectedModel() {
      const options = [];
      this.section.querySelectorAll('input[name^="option-"]:checked').forEach(el => {
        const i = Number(el.name.match(/option-(\d+)/)?.[1]) - 1;
        if (i >= 0) options[i] = el.value;
      });
      const selector = this.section.querySelector('.variant-selector');
      const variant = options.length
        ? this.config.variants.find(v => v.options.every((o, i) => o === options[i]))
        : this.config.variants.find(v => String(v.id) === selector?.value);
      return options.length && !variant ? '' : variant?.model || this.config.model;
    }

    modelUrl() {
      return new URL((this.lowPower && this.config.liteModels?.[this.modelKey]) || this.config.models[this.modelKey], location.href).href;
    }

    open(opener) {
      if (this.opened) return;
      this.opener = opener;
      this.switchGarment({...this.config.currentProduct, variants: this.config.variants});
      this.modelKey = this.selectedModel();
      this.session++;
      this.opened = true;
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.dialog.showModal();
      this.q('choices').hidden = false;
      const statusPill = this.q('status-pill');
      if (statusPill) statusPill.hidden = true;
      const stageActions = this.dialog.querySelector('.vto-stage-actions');
      if (stageActions) stageActions.hidden = true;
      const switchers = this.q('source-switchers');
      if (switchers) switchers.hidden = true;
      this.q('save').disabled = true;
      this.status(this.config.models[this.modelKey] ? 'intro' : 'unsupported');
      this.q('camera').disabled = this.q('upload').disabled = !this.config.models[this.modelKey];

      // Sync active variant based on product page selection
      const selector = this.section.querySelector('.variant-selector');
      if (selector && selector.value) {
        const found = this.activeVariants?.find(v => String(v.id) === String(selector.value));
        if (found) this.selectVariant(found.id);
      }
      this.resize();
      import('@incorrect/vto-sizing').then(sizing => {
        if (this.events.signal.aborted) return;
        this.sizing = sizing; this.updateMeasurements(); this.refit();
      }).catch(() => { this.q('fit-advice').textContent = this.config.fitStrings.unsupported; });
    }

    status(key) {
      const textKey = key === 'tracking' && this.mode === 'photo' ? 'photoFitted' : key;
      if (this.dialog.dataset.state !== key || this.statusTextKey !== textKey) {
        const msg = this.text[textKey] || textKey;
        const statusEl = this.q('status');
        if (statusEl) statusEl.textContent = msg;
      }
      this.statusTextKey = textKey;
      this.dialog.dataset.state = key;
    }

    close() {
      if (this.dialog.open) this.dialog.close();
      this.cleanup();
    }

    cleanup() {
      if (!this.opened) return;
      this.opened = false;
      const statusPill = this.q('status-pill');
      if (statusPill) statusPill.hidden = true;
      const stageActions = this.dialog.querySelector('.vto-stage-actions');
      if (stageActions) stageActions.hidden = true;
      const switchers = this.q('source-switchers');
      if (switchers) switchers.hidden = true;
      this.generation++;
      this.session++;
      cancelAnimationFrame(this.raf);
      cancelAnimationFrame(this.previewRaf);
      this.stopStream();
      this.abort?.abort();
      this.abort = null;
      clearTimeout(this.workerTimeout);
      this.rejectWorker?.(new Error('cancelled'));
      this.rejectWorker = null;
      this.worker?.terminate();
      this.worker = null;
      clearTimeout(this.segTimeout);
      this.rejectSeg?.(new Error('cancelled'));this.rejectSeg=null;
      this.segWorker?.terminate();this.segWorker=null;this.segReady=false;
      this.segPending=false;this.segReference=null;this.segPromise=null;
      this.q('occlusion-note').hidden=true;
      this.engine?.dispose();
      this.engine = null;
      this.loadedModelKey = '';
      this.enginePromise = null;
      this.workerPromise = null;
      this.pending = false;
      this.lastResult = null;
      this.mode = null;
      this.bitmap?.close();
      this.bitmap = null;
      this.ctx.clearRect(0, 0, this.media.width, this.media.height);
      this.foreground.width = this.foreground.height = this.cutout.width = this.cutout.height = this.maskCanvas.width = this.maskCanvas.height = 1;
      this.warpCanvas.width = this.warpCanvas.height = 1;
      document.body.style.overflow = this.previousOverflow;
      this.opener?.focus();
      this.q('busy').hidden = true;
    }

    destroy() {
      this.close();
      this.events.abort();
      this.canvas.removeEventListener('webglcontextlost', this.contextLost);
      this.resizeObserver.disconnect();
    }

    freshCanvas() {
      const canvas = this.canvas.cloneNode(false);
      this.canvas.removeEventListener('webglcontextlost', this.contextLost);
      this.canvas.replaceWith(canvas);
      this.canvas = canvas;
      canvas.addEventListener('webglcontextlost', this.contextLost);
    }

    stopStream() {
      this.stream?.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.video.srcObject = null;
    }

    fail(key) {
      if (!this.opened) return;
      this.status(key);
      this.q('busy').hidden = true;
      this.engine?.hide();
      this.q('save').disabled = true;
      this.pending = false;
      if (key !== 'invalidPhoto') {
        this.failed = true;
        cancelAnimationFrame(this.raf);
        this.stopStream();
      }
    }

    async prepare(generation) {
      this.abort ||= new AbortController();
      const session = this.session, signal = this.abort.signal;
      if (!this.enginePromise) {
        const promise = (async () => {
          const { GarmentRenderer } = await import('@incorrect/vto-renderer');
          if (!this.opened || session !== this.session) throw new Error('cancelled');
          this.engine?.dispose();
          this.freshCanvas();
          const engine = new GarmentRenderer(this.canvas, {lowPower: this.lowPower});
          this.engine = engine;
          this.resize();
          const key = this.modelKey, revision = this.modelRevision;
          await engine.load(this.modelUrl(), signal);
          if (session === this.session && revision === this.modelRevision && engine === this.engine && key === this.modelKey) this.loadedModelKey = key;
        })().catch(e => {
          if (this.enginePromise === promise) this.enginePromise = null;
          throw e;
        });
        this.enginePromise = promise;
      }
      if (!this.workerPromise) {
        const promise = this.makeWorker(session, signal).catch(e => {
          if (this.workerPromise === promise) this.workerPromise = null;
          throw e;
        });
        this.workerPromise = promise;
      }
      if (!this.segPromise) this.segPromise = this.makeSegWorker(session, signal).catch(() => {
        if (session !== this.session) return;
        this.segmentationUnavailable();
      });
      await Promise.all([this.enginePromise, this.workerPromise, this.segPromise]);
      return this.opened && generation === this.generation;
    }

    segmentationUnavailable() {
      this.segWorker?.terminate();this.segWorker=null;this.segReady=false;
      this.segPending=false;this.segPromise=null;this.segReference=null;
      this.q('occlusion-note').hidden=false;
      if (this.lastResult) {
        delete this.lastResult.foreground;this.lastResult.segComplete=true;
        this.q('busy').hidden=true;this.refit();
      }
    }

    async makeSegWorker(session, signal) {
      const {warpForeground} = await import('@incorrect/vto-foreground');
      this.warpForeground = warpForeground;
      if (typeof OffscreenCanvas === 'undefined') {
        const {createSegmentationProcessor} = await import('@incorrect/vto-segmentation');
        if (!this.opened || session !== this.session) throw new Error('cancelled');
        const bridge = {postMessage: data => processor.postMessage(data), terminate: () => processor.close()};
        const processor = createSegmentationProcessor({send: data => bridge.onmessage?.({data}), createCanvas: () => document.createElement('canvas')});
        this.segWorker = bridge;
      } else {
        const response = await fetch(this.config.workerUrl, {signal});
        if (!response.ok) throw new Error('segmentation');
        const blob = URL.createObjectURL(new Blob([await response.text()], {type:'text/javascript'}));
        if (!this.opened || session !== this.session) { URL.revokeObjectURL(blob);throw new Error('cancelled'); }
        this.segWorker = new Worker(blob);URL.revokeObjectURL(blob);
      }
      await new Promise((resolve,reject) => {
        this.rejectSeg = reject;
        this.segTimeout = setTimeout(() => reject(new Error('segmentation')),60000);
        this.segWorker.onmessage = ({data}) => {
          if (session !== this.session) return;
          if (data.kind === 'ready') {
            clearTimeout(this.segTimeout);this.rejectSeg=null;this.segReady=true;
            this.q('occlusion-note').hidden=true;resolve();return;
          }
          this.segPending=false;
          if (data.kind === 'error') {
            if (data.id !== undefined && data.id !== this.generation) {
              if (this.lastResult) this.requestSegmentation(this.lastResult);
              return;
            }
            clearTimeout(this.segTimeout);this.rejectSeg=null;reject(new Error('segmentation'));
            this.segmentationUnavailable();return;
          }
          if (data.id === this.generation) {
            if(Number.isFinite(data.ms))this.segMs=this.segMs==null?data.ms:this.segMs*.8+data.ms*.2;
            this.segReference=data;
            if (this.mode === 'photo' && this.lastResult) {
              this.lastResult.foreground=data;this.lastResult.segComplete=true;
              this.q('busy').hidden=true;this.prepareForeground(this.lastResult);this.refit();
            }
          } else if (this.lastResult) this.requestSegmentation(this.lastResult);
        };
        this.segWorker.onerror = () => {
          if (session !== this.session) return;
          clearTimeout(this.segTimeout);this.rejectSeg=null;reject(new Error('segmentation'));
          this.segmentationUnavailable();
        };
        this.segWorker.postMessage({kind:'init',task:'segment',
          vision:new URL(this.config.visionUrl,location.href).href,
          processor:new URL(this.config.segmentationUrl,location.href).href,
          occlusion:new URL(this.config.occlusionUrl,location.href).href,
          wasm:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
          segmentationModel:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'});
      });
    }

    async requestSegmentation(data) {
      if (!this.segReady || this.segPending || !data.landmarks) return;
      const now=performance.now();
      if (this.mode === 'camera' && now-(this.lastSegRequest||0)<Math.max(this.lowPower?900:700,(this.segMs||0)*2.5)) return;
      this.segPending=true;this.lastSegRequest=now;
      const generation=this.generation,session=this.session;
      try {
        const bitmap=await createImageBitmap(data.bitmap);
        if (!this.opened || generation!==this.generation || session!==this.session || !this.segWorker) {
          bitmap.close();if(session===this.session){this.segPending=false;if(this.lastResult)this.requestSegmentation(this.lastResult);}return;
        }
        this.segWorker.postMessage({kind:'frame',id:generation,bitmap,landmarks:data.landmarks,
          frameTime:data.frameTime,still:this.mode==='photo'},[bitmap]);
      } catch {
        if (session !== this.session || generation !== this.generation) return;
        this.segPending=false;
        if(this.mode==='photo'&&data===this.lastResult){data.segComplete=true;this.q('busy').hidden=true;this.refit();}
      }
    }

    async makeWorker(session, signal) {
      if (typeof OffscreenCanvas === 'undefined') {
        const { createPoseProcessor } = await import('@incorrect/vto-pose-processor');
        if (!this.opened || session !== this.session) throw new Error('cancelled');
        this.worker?.terminate();
        const bridge = { postMessage: data => processor.postMessage(data), terminate: () => processor.close() };
        const processor = createPoseProcessor({ send: data => bridge.onmessage?.({ data }), createCanvas: () => document.createElement('canvas') });
        this.worker = bridge;
        this.frameInterval = 125;
      } else {
        const response = await fetch(this.config.workerUrl, { signal });
        if (!response.ok) throw new Error('engineError');
        const blob = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }));
        if (!this.opened || session !== this.session) { URL.revokeObjectURL(blob); throw new Error('cancelled'); }
        this.worker?.terminate();
        this.worker = new Worker(blob);
        URL.revokeObjectURL(blob);
        this.frameInterval = this.lowPower ? 83 : 67;
      }
      await new Promise((resolve, reject) => {
        this.rejectWorker = reject;
        this.workerTimeout = setTimeout(() => { this.worker?.terminate(); reject(new Error('engineError')); }, 60000);
        this.worker.onmessage = ({ data }) => {
          if (session !== this.session) { data.bitmap?.close(); return; }
          if (data.kind === 'ready') { clearTimeout(this.workerTimeout); this.rejectWorker = null; resolve(); }
          else if (data.kind === 'error') {
            if (data.id !== undefined && data.id !== this.generation) return;
            clearTimeout(this.workerTimeout);
            this.worker?.terminate();
            this.worker = null;
            this.workerPromise = null;
            this.rejectWorker = null;
            reject(new Error('engineError'));
            this.fail('engineError');
          } else {
            this.onPose(data);
          }
        };
        this.worker.onerror = () => {
          if (session !== this.session) return;
          clearTimeout(this.workerTimeout);
          this.worker?.terminate();
          this.worker = null;
          this.workerPromise = null;
          this.rejectWorker = null;
          reject(new Error('engineError'));
          this.fail('engineError');
        };
        this.worker.postMessage({
          kind: 'init',
          vision: new URL(this.config.visionUrl, location.href).href,
          processor: new URL(this.config.processorUrl, location.href).href,
          wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
          model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_'+(this.mode==='photo'?'full':'lite')+'/float16/1/pose_landmarker_'+(this.mode==='photo'?'full':'lite')+'.task',
          videoModel: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          photoModel: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
        });
      });
    }

    begin(mode) {
      const generation = ++this.generation;
      cancelAnimationFrame(this.raf);
      cancelAnimationFrame(this.previewRaf);
      this.stopStream();
      this.mode = mode;
      this.poseMs=null;this.segMs=null;
      this.failed = false;
      this.pending = false;
      this.lastResult = null;
      this.segReference=null;this.lastSegRequest=0;
      this.foregroundCtx.clearRect(0, 0, this.foreground.width, this.foreground.height);
      this.engine?.reset();
      this.q('save').disabled = true;
      this.bitmap?.close();
      this.bitmap = null;
      this.ctx.clearRect(0, 0, this.media.width, this.media.height);
      this.q('choices').hidden = true;
      const statusPill = this.q('status-pill');
      if (statusPill) statusPill.hidden = false;
      const stageActions = this.dialog.querySelector('.vto-stage-actions');
      if (stageActions) stageActions.hidden = false;
      const switchers = this.q('source-switchers');
      if (switchers) switchers.hidden = false;
      this.q('busy').hidden = false;
      this.q('flip').hidden = mode !== 'camera';
      this.status('loading');
      return generation;
    }

    async startCamera() {
      if (!this.opened) return;
      const generation = this.begin('camera');
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('cameraUnavailable');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: this.facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: {ideal:24,max:30} }
        });
        if (!this.opened || generation !== this.generation) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        this.stream = stream;
        this.video.srcObject = stream;
        await this.video.play();
        this.mirror = (stream.getVideoTracks()[0].getSettings().facingMode || this.facing) === 'user';
        const preview=()=>{
          if (!this.opened || generation!==this.generation || this.failed || this.lastResult) return;
          const now=performance.now();
          if(now-(this.lastPreviewTime||0)>66){this.paintMedia(this.video);this.lastPreviewTime=now;}
          this.previewRaf=requestAnimationFrame(preview);
        };
        preview();
        if (!await this.prepare(generation)) return;
        this.q('busy').hidden = true;
        this.status('searching');
        this.lastVideoTime = -1;
        this.lastFrameTime = 0;
        const loop = async time => {
          if (!this.opened || generation !== this.generation || this.failed) return;
          this.raf = requestAnimationFrame(loop);
          if (this.pending || time - this.lastFrameTime < this.frameInterval || this.video.currentTime === this.lastVideoTime || this.video.readyState < 2) return;
          this.lastFrameTime = time;
          this.lastVideoTime = this.video.currentTime;
          this.pending = true;
          try {
            // Some cameras negotiate above the requested ideal resolution.
            // Bound the transferred/displayed frame even when that happens.
            const scale=Math.min(1,640/Math.max(this.video.videoWidth,this.video.videoHeight));
            const bitmap = await createImageBitmap(this.video,{
              resizeWidth:Math.max(1,Math.round(this.video.videoWidth*scale)),
              resizeHeight:Math.max(1,Math.round(this.video.videoHeight*scale))
            });
            if (!this.opened || generation !== this.generation) { bitmap.close(); return; }
            this.postFrame(bitmap, generation, false);
          } catch (e) {
            if (this.opened && generation === this.generation) this.fail('cameraError');
          }
        };
        this.raf = requestAnimationFrame(loop);
      } catch (error) {
        if (!this.opened || generation !== this.generation) return;
        this.stopStream();
        this.fail(['NotAllowedError', 'PermissionDeniedError'].includes(error.name) ? 'cameraDenied' :
          error.message === 'cameraUnavailable' ? 'cameraUnavailable' : 'engineError');
      }
    }

    async startPhoto(file) {
      if (!this.opened) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
        this.fail('invalidPhoto');
        return;
      }
      const generation = this.begin('photo');
      this.mirror = false;
      let bitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        if (Math.max(bitmap.width, bitmap.height) > 1800) {
          const factor = 1800 / Math.max(bitmap.width, bitmap.height);
          const smaller = await createImageBitmap(bitmap, {
            resizeWidth: Math.round(bitmap.width * factor),
            resizeHeight: Math.round(bitmap.height * factor)
          });
          bitmap.close();
          bitmap = smaller;
        }
        if (!this.opened || generation !== this.generation) { bitmap.close(); return; }
        this.paintMedia(bitmap);
        if (!await this.prepare(generation)) { bitmap.close(); return; }
        this.pending = true;
        this.postFrame(bitmap, generation, true);
        bitmap = null;
      } catch (error) {
        bitmap?.close();
        if (this.opened && generation === this.generation) console.warn('Virtual try-on photo setup:', error.name, error.message);
        if (this.opened && generation === this.generation) this.fail(error.name === 'InvalidStateError' ? 'invalidPhoto' : 'engineError');
      }
    }

    postFrame(bitmap, generation, still) {
      this.worker.postMessage({ kind: 'frame', id: generation, bitmap, still, timestamp: performance.now() }, [bitmap]);
    }

    onPose(data) {
      if (!this.opened || data.id !== this.generation || this.failed) { data.bitmap?.close(); return; }
      this.pending = false;
      cancelAnimationFrame(this.previewRaf);
      if (this.mode === 'camera' && Number.isFinite(data.ms)) {
        this.poseMs = this.poseMs == null ? Math.min(data.ms,100) : this.poseMs * .9 + data.ms * .1;
        // Leave idle time for cooling instead of immediately saturating a CPU
        // fallback. GPU/Lite can sustain the frame cap with substantially less work.
        this.frameInterval = Math.max(typeof OffscreenCanvas === 'undefined' ? 125 : this.lowPower ? 83 : 67, Math.min(1000, this.poseMs * 2.2));
      }
      this.bitmap?.close();
      this.bitmap = data.bitmap;
      this.lastResult = data;
      this.requestSegmentation(data);
      this.prepareForeground(data);
      this.q('busy').hidden = true;
      this.resize();
    }

    resize() {
      if (!this.opened) return;
      const width = Math.max(1, this.stage.clientWidth), height = Math.max(1, this.stage.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, this.lowPower ? 1 : 1.5);
      const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
      if (this.media.width !== pw || this.media.height !== ph) {
        this.media.width = pw;
        this.media.height = ph;
      }
      if (this.foreground.width !== pw || this.foreground.height !== ph) {
        this.foreground.width = pw; this.foreground.height = ph;
      }
      this.engine?.resize(width, height);
      this.refit();
    }

    paintMedia(b) {
      const w=this.stage.clientWidth,h=this.stage.clientHeight;
      const sw=b.videoWidth||b.width,sh=b.videoHeight||b.height;
      if(!w||!h||!sw||!sh)return;
      const scale=Math.min(w/sw,h/sh);
      this.rect={x:(w-sw*scale)/2,y:(h-sh*scale)/2,width:sw*scale,height:sh*scale};
      const r = this.rect, ctx = this.ctx;
      ctx.setTransform(this.media.width / w, 0, 0, this.media.height / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (this.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(b, r.x, r.y, r.width, r.height);
      ctx.restore();
    }

    refit() {
      if (!this.bitmap || !this.engine) return;
      const w=this.stage.clientWidth,h=this.stage.clientHeight;
      this.paintMedia(this.bitmap);const r=this.rect;
      if (this.loadedModelKey !== this.modelKey) {
        this.engine.hide();this.q('save').disabled=true;
        this.foregroundCtx.clearRect(0,0,this.foreground.width,this.foreground.height);
        return;
      }
      if (this.mode === 'photo' && this.segWorker && !this.lastResult.segComplete && this.lastResult.landmarks) {
        this.engine.hide();this.q('busy').hidden=false;this.q('save').disabled=true;return;
      }
      const fit = this.engine.fit(this.lastResult, r, {
        mirror: this.mirror,
        still: this.mode === 'photo',
        garment: this.measurements,
        ratios: this.ratios,
        bodyShoulder: this.bodyShoulder,
        bodyChest: this.bodyChest,
        shoulderLift: 0.022
      });
      const fg = this.foregroundCtx;
      fg.setTransform(this.foreground.width / w, 0, 0, this.foreground.height / h, 0, 0);
      fg.clearRect(0, 0, w, h);
      if (fit && this.lastResult.foreground) {
        fg.save(); if (this.mirror) { fg.translate(w, 0); fg.scale(-1, 1); }
        fg.drawImage(this.cutout, r.x, r.y, r.width, r.height); fg.restore();
      }
      this.q('save').disabled = !fit;
      this.status(fit ? 'tracking' : 'searching');
    }

    prepareForeground(data) {
      let mask = data.foreground;
      if (this.mode === 'camera' && this.segReference && this.warpForeground) {
        const r=this.segReference;
        if(this.warpCanvas.width!==r.width||this.warpCanvas.height!==r.height){this.warpCanvas.width=r.width;this.warpCanvas.height=r.height;}
        this.warpCtx.drawImage(data.bitmap,0,0,r.width,r.height);
        mask={width:r.width,height:r.height,alpha:this.warpForeground(r,data.landmarks,this.warpCtx.getImageData(0,0,r.width,r.height).data,data.frameTime,data.person)};
        data.foreground=mask;
      }
      if (!mask) return;
      if(this.maskCanvas.width!==mask.width||this.maskCanvas.height!==mask.height){this.maskCanvas.width=mask.width;this.maskCanvas.height=mask.height;}
      const image = this.maskCtx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.alpha.length; i++) image.data[i * 4 + 3] = mask.alpha[i];
      this.maskCtx.putImageData(image, 0, 0);
      const factor=Math.min(1,(this.mode==='photo'?1800:640)/Math.max(data.bitmap.width,data.bitmap.height));
      const width=Math.round(data.bitmap.width*factor),height=Math.round(data.bitmap.height*factor);
      if(this.cutout.width!==width||this.cutout.height!==height){this.cutout.width=width;this.cutout.height=height;}
      const ctx = this.cutoutCtx;
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(data.bitmap, 0, 0,width,height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.maskCanvas, 0, 0, this.cutout.width, this.cutout.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    save() {
      if (this.q('save').disabled || !this.engine) return;
      const output = document.createElement('canvas');
      output.width = this.media.width;
      output.height = this.media.height;
      const ctx = output.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(this.media, 0, 0);
      this.engine.render();
      ctx.drawImage(this.canvas, 0, 0, output.width, output.height);
      ctx.drawImage(this.foreground, 0, 0, output.width, output.height);
      output.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url;
        link.download = 'incorrect-society-' + this.modelKey + '-try-on.jpg';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/jpeg', 0.94);
    }
  }

  function init(root = document) {
    root.querySelectorAll('[data-vto-dialog]').forEach(el => {
      if (!instances.has(el)) instances.set(el, new TryOn(el));
    });
  }

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-vto-open]');
    if (!opener) return;
    const instance = instances.get(document.getElementById(opener.getAttribute('aria-controls')));
    for (const other of instances.values()) if (other !== instance && other.opened) other.close();
    instance?.open(opener);
  });

  document.addEventListener('shopify:section:load', e => init(e.target));
  document.addEventListener('shopify:section:unload', e => {
    for (const [el, instance] of instances) if (e.target.contains(el)) { instance.destroy(); instances.delete(el); }
  });

  window.IncorrectTryOn = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init()); else init();
})();
