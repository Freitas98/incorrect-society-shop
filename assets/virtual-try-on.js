/* On-device camera/photo try-on. No frame or photo is sent to a server. */
(() => {
  'use strict';
  if (window.IncorrectTryOn) return;
  const instances = new Map();

  const SIZE_SCALE_MAP = {
    'xs': { ease: 0.93, lengthScale: 0.95 },
    's':  { ease: 0.96, lengthScale: 0.97 },
    'm':  { ease: 1.00, lengthScale: 1.00 },
    'l':  { ease: 1.06, lengthScale: 1.04 },
    'xl': { ease: 1.12, lengthScale: 1.08 },
    '2xl': { ease: 1.18, lengthScale: 1.12 },
    'xxl': { ease: 1.18, lengthScale: 1.12 }
  };

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
      this.currentEase = 1.0;
      this.currentLengthScale = 1.0;

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

    getSizeScale(sizeStr) {
      if (!sizeStr) return { ease: 1.0, lengthScale: 1.0 };
      const clean = String(sizeStr).trim().toLowerCase();
      if (SIZE_SCALE_MAP[clean]) return SIZE_SCALE_MAP[clean];
      if (/\bxs\b/i.test(clean)) return SIZE_SCALE_MAP.xs;
      if (/\b2xl|xxl\b/i.test(clean)) return SIZE_SCALE_MAP['2xl'];
      if (/\bxl\b/i.test(clean)) return SIZE_SCALE_MAP.xl;
      if (/\bl\b/i.test(clean)) return SIZE_SCALE_MAP.l;
      if (/\bm\b/i.test(clean)) return SIZE_SCALE_MAP.m;
      if (/\bs\b/i.test(clean)) return SIZE_SCALE_MAP.s;
      return { ease: 1.0, lengthScale: 1.0 };
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

        btn.addEventListener('click', () => {
          this.selectVariant(variant.id);
        });
        container.appendChild(btn);
      });

      const selected = variants.find(v => v.id === this.selectedVariantId);
      if (label && selected) {
        label.textContent = selected.title || selected.options?.[0] || '';
      }
      const sizeName = selected?.title || selected?.options?.[0] || '';
      const scale = this.getSizeScale(sizeName);
      this.currentEase = scale.ease;
      this.currentLengthScale = scale.lengthScale;
      this.updateAddCartState();
    }

    selectVariant(variantId) {
      this.selectedVariantId = variantId;
      const container = this.q('sizes');
      if (container) {
        container.querySelectorAll('.vto-size-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-variant-id') === String(variantId));
        });
      }
      const label = this.dialog.querySelector('[data-vto-active-size-label]');
      const selected = this.activeVariants.find(v => v.id === variantId);
      if (label && selected) {
        label.textContent = selected.title || selected.options?.[0] || '';
      }
      const sizeName = selected?.title || selected?.options?.[0] || '';
      const scale = this.getSizeScale(sizeName);
      this.currentEase = scale.ease;
      this.currentLengthScale = scale.lengthScale;
      this.updateAddCartState();
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
        btn.disabled = false;
        if (textEl) textEl.textContent = this.text.addToCart || 'Add to cart';
        if (priceEl && variant.priceFormatted) priceEl.textContent = variant.priceFormatted;
        if (stockBadge) {
          stockBadge.textContent = 'AVAILABLE';
          stockBadge.classList.remove('out-of-stock');
        }
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

      // Switch 3D model if different
      if (item.model && item.model !== this.modelKey && this.config.models[item.model]) {
        this.modelKey = item.model;
        if (this.engine) {
          this.q('busy').hidden = false;
          try {
            await this.engine.load(new URL(this.config.models[this.modelKey], location.href).href, this.abort?.signal);
            this.refit();
          } catch (e) {
            console.warn('Virtual try-on model switch error:', e);
          } finally {
            this.q('busy').hidden = true;
          }
        }
      }
    }

    async addToCart() {
      if (!this.selectedVariantId) return;
      const btn = this.q('add-cart');
      const textEl = this.dialog.querySelector('[data-vto-cart-cta-text]');
      const toast = this.dialog.querySelector('[data-vto-cart-toast]');
      if (!btn || btn.disabled) return;

      const origText = textEl ? textEl.textContent : '';
      btn.disabled = true;
      if (textEl) textEl.textContent = this.text.addingToCart || 'Adding...';

      const formData = new FormData();
      formData.append('id', String(this.selectedVariantId));
      formData.append('quantity', '1');

      try {
        let cartData;
        if (window.addToCartAndUpdate) {
          cartData = await window.addToCartAndUpdate(formData);
        } else {
          const res = await fetch((window.Shopify?.routes?.root || '/') + 'cart/add.js', {
            method: 'POST',
            body: formData
          });
          cartData = await res.json();
        }

        btn.classList.add('added');
        if (textEl) textEl.textContent = this.text.addedToCart || 'Added to cart ✓';

        if (toast) {
          const variant = this.activeVariants.find(v => v.id === this.selectedVariantId);
          toast.hidden = false;
          toast.textContent = `${this.activeProduct.title} (${variant?.title || ''}) — ${this.text.addedToCart || 'Added to bag'}`;
          setTimeout(() => { toast.hidden = true; }, 4000);
        }

        setTimeout(() => {
          btn.classList.remove('added');
          btn.disabled = false;
          if (textEl) textEl.textContent = this.text.addToCart || 'Add to cart';
        }, 2200);
      } catch (err) {
        console.error('Add to cart error in try-on:', err);
        btn.disabled = false;
        if (textEl) textEl.textContent = origText;
      }
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

    open(opener) {
      if (this.opened) return;
      this.opener = opener;
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
      this.stopStream();
      this.abort?.abort();
      this.abort = null;
      clearTimeout(this.workerTimeout);
      this.rejectWorker?.(new Error('cancelled'));
      this.rejectWorker = null;
      this.worker?.terminate();
      this.worker = null;
      this.engine?.dispose();
      this.engine = null;
      this.enginePromise = null;
      this.workerPromise = null;
      this.pending = false;
      this.lastResult = null;
      this.mode = null;
      this.bitmap?.close();
      this.bitmap = null;
      this.ctx.clearRect(0, 0, this.media.width, this.media.height);
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
          const engine = new GarmentRenderer(this.canvas);
          this.engine = engine;
          this.resize();
          await engine.load(new URL(this.config.models[this.modelKey], location.href).href, signal);
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
      await Promise.all([this.enginePromise, this.workerPromise]);
      return this.opened && generation === this.generation;
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
        this.frameInterval = 50;
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
          model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
        });
      });
    }

    begin(mode) {
      const generation = ++this.generation;
      cancelAnimationFrame(this.raf);
      this.stopStream();
      this.mode = mode;
      this.failed = false;
      this.pending = false;
      this.lastResult = null;
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
          video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!this.opened || generation !== this.generation) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        this.stream = stream;
        this.video.srcObject = stream;
        await this.video.play();
        this.mirror = (stream.getVideoTracks()[0].getSettings().facingMode || this.facing) === 'user';
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
            const bitmap = await createImageBitmap(this.video);
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
      this.bitmap?.close();
      this.bitmap = data.bitmap;
      this.lastResult = data;
      this.q('busy').hidden = true;
      this.resize();
    }

    resize() {
      if (!this.opened) return;
      const width = Math.max(1, this.stage.clientWidth), height = Math.max(1, this.stage.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
      if (this.media.width !== pw || this.media.height !== ph) {
        this.media.width = pw;
        this.media.height = ph;
      }
      this.engine?.resize(width, height);
      this.refit();
    }

    refit() {
      if (!this.bitmap || !this.engine) return;
      const w = this.stage.clientWidth, h = this.stage.clientHeight, b = this.bitmap, scale = Math.min(w / b.width, h / b.height);
      this.rect = { x: (w - b.width * scale) / 2, y: (h - b.height * scale) / 2, width: b.width * scale, height: b.height * scale };
      const r = this.rect, ctx = this.ctx;
      ctx.setTransform(this.media.width / w, 0, 0, this.media.height / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (this.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(b, r.x, r.y, r.width, r.height);
      ctx.restore();
      const fit = this.engine.fit(this.lastResult, r, {
        mirror: this.mirror,
        still: this.mode === 'photo',
        ease: this.currentEase || 1.0,
        lengthScale: this.currentLengthScale || 1.0
      });
      this.q('save').disabled = !fit;
      this.status(fit ? 'tracking' : 'searching');
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
