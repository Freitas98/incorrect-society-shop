/**
 * Incorrect Society - Virtual Try-On (AR / VR Mirror)
 * Real-time camera mirror with interactive garment overlay, size scaling,
 * front/back view toggle, color swatch switching, photo capture & direct checkout.
 */

(function () {
  'use strict';

  function initVirtualTryOn() {
    const modal = document.getElementById('VirtualTryOnModal');
    const openBtn = document.getElementById('btn-trigger-vto');

    if (!modal || !openBtn) return;

    // Prevent duplicate initializations
    if (modal.dataset.vtoInitialized === 'true') return;
    modal.dataset.vtoInitialized = 'true';

    // Elements
    const viewport = document.getElementById('vto-viewport');
    const video = document.getElementById('vto-video');
    const canvas = document.getElementById('vto-canvas');
    const garmentLayer = document.getElementById('vto-garment-layer');
    const garmentImg = document.getElementById('vto-garment-img');
    const guide = document.getElementById('vto-guide');
    const statusPill = document.getElementById('vto-status-pill');
    const flipCamBtn = document.getElementById('vto-flip-cam');
    const permissionCard = document.getElementById('vto-permission-card');
    const reqCamBtn = document.getElementById('vto-request-cam-btn');
    const flashEl = document.getElementById('vto-flash');
    const takePhotoBtn = document.getElementById('vto-take-photo-btn');
    const addCartBtn = document.getElementById('vto-add-cart-btn');

    // Snapshot Elements
    const snapshotOverlay = document.getElementById('vto-snapshot-overlay');
    const snapshotImg = document.getElementById('vto-snapshot-img');
    const downloadBtn = document.getElementById('vto-download-btn');
    const retakeBtn = document.getElementById('vto-retake-btn');

    // Controls
    const closeBtns = modal.querySelectorAll('[data-vto-close]');
    const viewBtns = modal.querySelectorAll('.vto-view-btn');
    const swatchBtns = modal.querySelectorAll('.vto-swatch-btn');
    const sizePills = modal.querySelectorAll('.vto-size-pill');

    // Garment Images Mapping
    const garmentImages = {
      burgundy: {
        front: modal.dataset.burgundyFront || '',
        back: modal.dataset.burgundyBack || ''
      },
      grey: {
        front: modal.dataset.greyFront || '',
        back: modal.dataset.greyBack || ''
      }
    };

    // Preload images to avoid flash on switch
    Object.values(garmentImages).forEach(item => {
      if (item.front) {
        const imgF = new Image();
        imgF.src = item.front;
      }
      if (item.back) {
        const imgB = new Image();
        imgB.src = item.back;
      }
    });

    // Size Scale Table (box-fit relative multipliers)
    const sizeScales = {
      XS: 0.88,
      S: 0.94,
      M: 1.02,
      L: 1.12,
      XL: 1.22,
      XXL: 1.30
    };

    // State
    let stream = null;
    let facingMode = 'user'; // 'user' (selfie) or 'environment' (rear)
    let currentShirt = modal.dataset.defaultShirt || 'grey';
    let currentView = 'front';
    let currentSize = 'M';
    let sizeScale = 1.02;
    let userScale = 1.0;
    let posX = 0;
    let posY = 0;
    let isModalOpen = false;

    // Gesture tracking variables
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialPosX = 0;
    let initialPosY = 0;
    let initialDistance = 0;
    let initialUserScale = 1.0;

    // Load variant data from page script
    let variantData = null;
    try {
      const dataEl = document.getElementById('variant-data');
      if (dataEl) {
        variantData = JSON.parse(dataEl.textContent);
      }
    } catch (e) {
      console.warn('Could not parse variant data:', e);
    }

    // ------------------------------------------------------------------------
    // Transform & Rendering Helpers
    // ------------------------------------------------------------------------
    function updateGarmentTransform() {
      if (!garmentLayer) return;
      const combinedScale = sizeScale * userScale;
      garmentLayer.style.transform = "translate(calc(-50% + " + posX + "px), calc(-35% + " + posY + "px)) scale(" + combinedScale + ")";
    }

    function updateGarmentSource() {
      if (!garmentImg) return;
      const src = garmentImages[currentShirt] && garmentImages[currentShirt][currentView];
      if (src && garmentImg.src !== src) {
        garmentImg.style.opacity = '0.5';
        garmentImg.src = src;
        garmentImg.onload = () => {
          garmentImg.style.opacity = '1';
        };
      }
    }

    function syncActiveSize(size) {
      currentSize = size;
      sizeScale = sizeScales[size] || 1.0;
      updateGarmentTransform();

      // Update UI pills
      sizePills.forEach(pill => {
        pill.classList.toggle('active', pill.dataset.size === size);
      });

      // Synchronize radio buttons on product page if they exist
      const pageRadio = document.querySelector('input[name^="option-"][value="' + size + '"]');
      if (pageRadio && !pageRadio.checked) {
        pageRadio.checked = true;
        pageRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }

      updateAddToCartButtonState();
    }

    function syncActiveShirt(colorKey) {
      currentShirt = colorKey;
      updateGarmentSource();

      swatchBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shirt === colorKey);
      });

      // Update title display in modal if applicable
      const titleEl = document.getElementById('vto-item-title');
      if (titleEl) {
        if (colorKey === 'burgundy') {
          titleEl.textContent = 'Secrets & Sins - Burgundy Tee';
        } else {
          titleEl.textContent = 'Secrets & Sins - Grey Tee';
        }
      }

      // Check if product page has color options and sync
      const colorRadio = document.querySelector('input[name^="option-"][value*="' + colorKey + '" i]');
      if (colorRadio && !colorRadio.checked) {
        colorRadio.checked = true;
        colorRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }

      updateAddToCartButtonState();
    }

    function syncActiveView(view) {
      currentView = view;
      updateGarmentSource();

      viewBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }

    function updateAddToCartButtonState() {
      if (!addCartBtn) return;
      const selector = document.querySelector('select.variant-selector');
      if (!selector) return;

      // Find current selected variant or match by size
      let targetVariant = null;
      if (variantData && variantData.variants) {
        targetVariant = variantData.variants.find(v => {
          const optMatch = [v.option1, v.option2, v.option3].filter(Boolean);
          const sizeMatch = optMatch.includes(currentSize);
          return sizeMatch;
        });
      }

      const isAvailable = targetVariant ? targetVariant.available : true;
      addCartBtn.disabled = !isAvailable;

      const textEl = addCartBtn.querySelector('.vto-add-text');
      if (textEl) {
        textEl.textContent = isAvailable ? 'Add to Cart' : 'Sold Out';
      }

      const priceEl = addCartBtn.querySelector('.vto-add-price');
      if (priceEl && targetVariant && targetVariant.priceHtml) {
        priceEl.innerHTML = targetVariant.priceHtml;
      }
    }

    // ------------------------------------------------------------------------
    // Camera Stream Management
    // ------------------------------------------------------------------------
    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showPermissionCard('Your browser does not support live camera access. Please use Chrome or Safari.');
        return;
      }

      if (stream) {
        stopCamera();
      }

      // Hide permission prompt if previously shown
      if (permissionCard) {
        permissionCard.style.display = 'none';
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: facingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        }
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();

        // Adjust mirror effect based on camera facing mode
        if (facingMode === 'user') {
          video.classList.remove('vto-video--rear');
        } else {
          video.classList.add('vto-video--rear');
        }

        // Show status badge briefly
        if (statusPill) {
          statusPill.classList.add('active');
          setTimeout(() => {
            if (statusPill) statusPill.classList.remove('active');
          }, 3500);
        }

        // Fade silhouette guide after 4s
        if (guide) {
          setTimeout(() => {
            if (guide) guide.classList.add('vto-guide--hidden');
          }, 4200);
        }
      } catch (err) {
        console.warn('Camera access denied or failed:', err);
        showPermissionCard('Please grant camera permissions to try on garments in real time.');
      }
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (video) {
        video.srcObject = null;
      }
    }

    async function toggleFlipCamera() {
      facingMode = facingMode === 'user' ? 'environment' : 'user';
      await startCamera();
    }

    function showPermissionCard(message) {
      if (permissionCard) {
        const desc = permissionCard.querySelector('p');
        if (desc && message) desc.textContent = message;
        permissionCard.style.display = 'flex';
      }
    }

    // ------------------------------------------------------------------------
    // Modal Open & Close Lifecycle
    // ------------------------------------------------------------------------
    function openModal() {
      if (isModalOpen) return;
      isModalOpen = true;

      // Lock background scrolling
      document.body.style.overflow = 'hidden';

      // Read current selected size from product page
      const checkedSize = document.querySelector('input[name^="option-"]:checked');
      if (checkedSize && sizeScales[checkedSize.value]) {
        syncActiveSize(checkedSize.value);
      } else {
        syncActiveSize('M');
      }

      // Reset transforms
      posX = 0;
      posY = 0;
      userScale = 1.0;
      updateGarmentTransform();
      updateGarmentSource();

      if (guide) guide.classList.remove('vto-guide--hidden');
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');

      // Start live camera
      startCamera();
    }

    function closeModal() {
      if (!isModalOpen) return;
      isModalOpen = false;

      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      stopCamera();

      // Close snapshot modal if open
      if (snapshotOverlay) {
        snapshotOverlay.style.display = 'none';
      }
    }

    // ------------------------------------------------------------------------
    // Touch & Mouse Gestures (Drag & Pinch to Scale)
    // ------------------------------------------------------------------------
    function getDistance(t1, t2) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onPointerDown(e) {
      if (e.target.closest('.vto-header') || e.target.closest('.vto-controls') || e.target.closest('.vto-view-toggle') || e.target.closest('.vto-shirt-toggle') || e.target.closest('.vto-snapshot-overlay')) {
        return;
      }

      if (e.touches && e.touches.length === 2) {
        // Pinch zoom start
        isDragging = false;
        initialDistance = getDistance(e.touches[0], e.touches[1]);
        initialUserScale = userScale;
        return;
      }

      // Single touch or mouse drag
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      dragStartX = clientX;
      dragStartY = clientY;
      initialPosX = posX;
      initialPosY = posY;

      // Hide alignment guide when user starts interacting
      if (guide) guide.classList.add('vto-guide--hidden');
    }

    function onPointerMove(e) {
      if (e.touches && e.touches.length === 2) {
        // Handle pinch scale
        const currentDist = getDistance(e.touches[0], e.touches[1]);
        if (initialDistance > 0) {
          const factor = currentDist / initialDistance;
          userScale = Math.min(Math.max(initialUserScale * factor, 0.55), 2.2);
          updateGarmentTransform();
        }
        return;
      }

      if (!isDragging) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - dragStartX;
      const deltaY = clientY - dragStartY;

      const maxLimitX = window.innerWidth * 0.45;
      const maxLimitY = window.innerHeight * 0.4;

      posX = Math.min(Math.max(initialPosX + deltaX, -maxLimitX), maxLimitX);
      posY = Math.min(Math.max(initialPosY + deltaY, -maxLimitY), maxLimitY);

      updateGarmentTransform();
    }

    function onPointerUp() {
      isDragging = false;
      initialDistance = 0;
    }

    // Wheel zoom on desktop
    function onWheel(e) {
      if (!isModalOpen) return;
      e.preventDefault();
      const zoomStep = e.deltaY * -0.0012;
      userScale = Math.min(Math.max(userScale + zoomStep, 0.55), 2.2);
      updateGarmentTransform();
    }

    // Double tap/click to reset garment placement
    let lastTapTime = 0;
    function onDoubleTap(e) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        posX = 0;
        posY = 0;
        userScale = 1.0;
        updateGarmentTransform();
      }
      lastTapTime = now;
    }

    // ------------------------------------------------------------------------
    // Camera Snapshot / Photo Capture
    // ------------------------------------------------------------------------
    function captureSnapshot() {
      if (!video || !video.videoWidth) return;

      // Trigger shutter flash
      if (flashEl) {
        flashEl.classList.add('active');
        setTimeout(() => flashEl.classList.remove('active'), 200);
      }

      // Create offscreen canvas with high resolution
      const captureCanvas = document.createElement('canvas');
      const targetW = 1080;
      const targetH = 1440; // 3:4 portrait
      captureCanvas.width = targetW;
      captureCanvas.height = targetH;
      const ctx = captureCanvas.getContext('2d');

      // 1. Draw video frame with cover aspect ratio
      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      const videoAspect = videoW / videoH;
      const targetAspect = targetW / targetH;

      let drawW, drawH, sx, sy, sWidth, sHeight;

      if (videoAspect > targetAspect) {
        sHeight = videoH;
        sWidth = videoH * targetAspect;
        sx = (videoW - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = videoW;
        sHeight = videoW / targetAspect;
        sx = 0;
        sy = (videoH - sHeight) / 2;
      }

      ctx.save();
      // If selfie mode, mirror horizontally
      if (facingMode === 'user') {
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
      ctx.restore();

      // 2. Draw Garment Layer
      if (garmentImg && garmentImg.complete && garmentImg.naturalWidth > 0) {
        const viewportRect = viewport.getBoundingClientRect();
        const garmentRect = garmentImg.getBoundingClientRect();

        // Calculate garment position relative to viewport (0 to 1)
        const relX = (garmentRect.left - viewportRect.left) / viewportRect.width;
        const relY = (garmentRect.top - viewportRect.top) / viewportRect.height;
        const relW = garmentRect.width / viewportRect.width;
        const relH = garmentRect.height / viewportRect.height;

        const gX = relX * targetW;
        const gY = relY * targetH;
        const gW = relW * targetW;
        const gH = relH * targetH;

        ctx.drawImage(garmentImg, gX, gY, gW, gH);
      }

      // 3. Watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '700 24px "Century Gothic", sans-serif';
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'center';
      ctx.fillText('INCORRECT SOCIETY', targetW / 2, targetH - 45);

      ctx.font = '500 14px "Century Gothic", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('SECRETS & SINS · VIRTUAL MIRROR', targetW / 2, targetH - 22);

      // Convert to JPEG data URL
      const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);

      if (snapshotImg) {
        snapshotImg.src = dataUrl;
      }
      if (downloadBtn) {
        downloadBtn.href = dataUrl;
        const filename = 'incorrect-society-' + currentShirt + '-' + currentSize.toLowerCase() + '.jpg';
        downloadBtn.setAttribute('download', filename);
      }
      if (snapshotOverlay) {
        snapshotOverlay.style.display = 'flex';
      }
    }

    // ------------------------------------------------------------------------
    // Add to Cart from Modal
    // ------------------------------------------------------------------------
    async function handleAddToCart() {
      if (!addCartBtn || addCartBtn.disabled) return;

      const originalText = addCartBtn.querySelector('.vto-add-text').textContent;
      const textEl = addCartBtn.querySelector('.vto-add-text');

      // Identify variant ID
      let variantId = null;
      if (variantData && variantData.variants) {
        const found = variantData.variants.find(v => {
          const opts = [v.option1, v.option2, v.option3].filter(Boolean);
          return opts.includes(currentSize);
        });
        if (found) variantId = found.id;
      }

      if (!variantId) {
        const selector = document.querySelector('select.variant-selector');
        if (selector) variantId = selector.value;
      }

      if (!variantId) {
        console.error('No variant ID found for addition.');
        return;
      }

      // Visual state
      addCartBtn.disabled = true;
      if (textEl) textEl.textContent = 'Adding...';

      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');

      try {
        const addPromise = window.addToCartAndUpdate
          ? window.addToCartAndUpdate(formData)
          : fetch('/cart/add.js', { method: 'POST', body: formData }).then(r => r.json());

        await addPromise;

        if (textEl) textEl.textContent = 'Added to Cart ✓';
        setTimeout(() => {
          addCartBtn.disabled = false;
          if (textEl) textEl.textContent = originalText;
        }, 2200);
      } catch (err) {
        console.error('Failed to add to cart:', err);
        if (textEl) textEl.textContent = 'Error Adding';
        setTimeout(() => {
          addCartBtn.disabled = false;
          if (textEl) textEl.textContent = originalText;
        }, 2200);
      }
    }

    // ------------------------------------------------------------------------
    // Event Listeners Registration
    // ------------------------------------------------------------------------
    openBtn.addEventListener('click', openModal);

    closeBtns.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    if (flipCamBtn) {
      flipCamBtn.addEventListener('click', toggleFlipCamera);
    }

    if (reqCamBtn) {
      reqCamBtn.addEventListener('click', startCamera);
    }

    // View toggle (Front / Back)
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        syncActiveView(btn.dataset.view);
      });
    });

    // Swatch toggle (Burgundy / Grey)
    swatchBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        syncActiveShirt(btn.dataset.shirt);
      });
    });

    // Size pills
    sizePills.forEach(pill => {
      pill.addEventListener('click', () => {
        syncActiveSize(pill.dataset.size);
      });
    });

    // Interactive Drag / Pinch listeners
    if (viewport) {
      viewport.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);

      viewport.addEventListener('touchstart', onPointerDown, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp, { passive: true });
      window.addEventListener('touchcancel', onPointerUp, { passive: true });

      viewport.addEventListener('wheel', onWheel, { passive: false });
      viewport.addEventListener('click', onDoubleTap);
    }

    // Shutter button
    if (takePhotoBtn) {
      takePhotoBtn.addEventListener('click', captureSnapshot);
    }

    // Snapshot Retake button
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        if (snapshotOverlay) snapshotOverlay.style.display = 'none';
      });
    }

    // Add to Cart in modal
    if (addCartBtn) {
      addCartBtn.addEventListener('click', handleAddToCart);
    }

    // Keyboard ESC to close
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isModalOpen) {
        if (snapshotOverlay && snapshotOverlay.style.display === 'flex') {
          snapshotOverlay.style.display = 'none';
        } else {
          closeModal();
        }
      }
    });

    // Listen to theme variant changes if user changes size outside modal
    document.querySelectorAll('input[name^="option-"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (sizeScales[radio.value]) {
          currentSize = radio.value;
          sizeScale = sizeScales[radio.value] || 1.0;
          updateGarmentTransform();
          sizePills.forEach(pill => {
            pill.classList.toggle('active', pill.dataset.size === radio.value);
          });
          updateAddToCartButtonState();
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirtualTryOn);
  } else {
    initVirtualTryOn();
  }

  // Support Shopify theme editor live reload
  document.addEventListener('shopify:section:load', function (event) {
    if (event.detail && event.detail.sectionId) {
      initVirtualTryOn();
    }
  });
})();
