/**
 * Incorrect Society - Virtual Try-On 3D AR Mirror
 * Real-time body tracking with Google MediaPipe Pose and Three.js WebGL rendering.
 * Loads rigged 3D models (vto-secrets.glb & vto-sinners.glb) with PBR textures and bone articulation.
 */

(function () {
  'use strict';

  // CDN Dependencies
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  const GLTF_LOADER_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js';
  const POSE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';

  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function initVirtualTryOn() {
    const modal = document.getElementById('VirtualTryOnModal');
    const openBtn = document.getElementById('btn-trigger-vto');

    if (!modal || !openBtn) return;
    if (modal.dataset.vtoInitialized === 'true') return;
    modal.dataset.vtoInitialized = 'true';

    // DOM Elements
    const viewport = document.getElementById('vto-viewport');
    const video = document.getElementById('vto-video');
    const canvas = document.getElementById('vto-canvas');
    const garmentLayer = document.getElementById('vto-garment-layer');
    const guide = document.getElementById('vto-guide');
    const statusPill = document.getElementById('vto-status-pill');
    const loadingOverlay = document.getElementById('vto-loading-overlay');
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

    // 3D Model URLs
    const secretsGlbUrl = modal.dataset.secretsGlb || '';
    const sinnersGlbUrl = modal.dataset.sinnersGlb || '';

    // Size Box-Fit Scaling Table
    const sizeScales = {
      XS: 0.88,
      S: 0.94,
      M: 1.00,
      L: 1.08,
      XL: 1.16,
      XXL: 1.24
    };

    // State
    let isModalOpen = false;
    let stream = null;
    let facingMode = 'user'; // 'user' (front) or 'environment' (rear)
    let currentShirt = modal.dataset.defaultShirt || 'grey';
    let currentView = 'front';
    let currentSize = 'M';
    let sizeScale = 1.00;
    let userScale = 1.0;
    let manualRotY = 0;
    let manualPosX = 0;
    let manualPosY = 0;

    // Three.js State
    let renderer = null;
    let scene = null;
    let camera = null;
    let secretsModel = null;
    let sinnersModel = null;
    let currentActiveModel = null;
    let modelBones = { secrets: {}, sinners: {} };
    let is3DReady = false;
    let animFrameId = null;

    // Tracking Smoothing State
    const targetPos = { x: 0, y: -0.2, z: 0 };
    const currentPos = { x: 0, y: -0.2, z: 0 };
    const targetRot = { x: 0, y: 0, z: 0 };
    const currentRot = { x: 0, y: 0, z: 0 };
    let targetModelScale = 1.0;
    let currentModelScale = 1.0;
    let hasBodyLock = false;
    let lastDetectionTime = 0;

    // MediaPipe State
    let poseInstance = null;
    let isProcessingFrame = false;

    // Variant Data from Product Form
    let variantData = null;
    try {
      const dataEl = document.getElementById('variant-data');
      if (dataEl) variantData = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.warn('Could not parse variant data:', e);
    }

    // ------------------------------------------------------------------------
    // Dynamic Engine Loader (Three.js + MediaPipe)
    // ------------------------------------------------------------------------
    async function load3DEngine() {
      if (is3DReady) return;

      if (loadingOverlay) loadingOverlay.classList.add('active');

      try {
        // 1. Load Three.js core
        await loadScript(THREE_CDN);
        // 2. Load GLTFLoader
        await loadScript(GLTF_LOADER_CDN);
        // 3. Load MediaPipe Pose
        await loadScript(POSE_CDN);

        initThreeScene();
        await load3DModels();
        initMediaPipe();

        is3DReady = true;

        // Hide 2D fallback layer once 3D is active
        if (garmentLayer) garmentLayer.style.display = 'none';

        if (loadingOverlay) loadingOverlay.classList.remove('active');
        if (guide) guide.classList.remove('vto-guide--hidden');

        // Start render loop
        renderLoop();
      } catch (err) {
        console.error('Error initializing 3D try-on engine:', err);
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        // Keep 2D fallback visible if 3D fails
        if (garmentLayer) garmentLayer.style.display = 'block';
      }
    }

    // ------------------------------------------------------------------------
    // Three.js Scene Setup
    // ------------------------------------------------------------------------
    function initThreeScene() {
      const width = viewport.clientWidth || window.innerWidth;
      const height = viewport.clientHeight || window.innerHeight;

      scene = new THREE.Scene();

      // Camera: 50 deg FOV closely matches smartphone front cameras
      camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50);
      camera.position.set(0, 0, 2.2);

      // WebGL Renderer with alpha transparency over video
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      if (THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      // Studio Lighting for High Fabric Realism
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
      scene.add(ambientLight);

      // Key light: angled top-front
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
      keyLight.position.set(1.2, 2.0, 2.2);
      scene.add(keyLight);

      // Fill light: soft opposite side
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
      fillLight.position.set(-1.2, 0.8, 1.8);
      scene.add(fillLight);

      // Rim light: back accent for volumetric edge separation
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.85);
      rimLight.position.set(0, 1.8, -1.8);
      scene.add(rimLight);

      window.addEventListener('resize', onWindowResize);
    }

    function onWindowResize() {
      if (!renderer || !camera || !viewport) return;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    // ------------------------------------------------------------------------
    // Load 3D Models (secrets.glb & sinners.glb)
    // ------------------------------------------------------------------------
    function loadGLB(url) {
      return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(url, (gltf) => resolve(gltf), undefined, (err) => reject(err));
      });
    }

    async function load3DModels() {
      const loaderPromises = [];

      if (secretsGlbUrl) {
        loaderPromises.push(
          loadGLB(secretsGlbUrl).then(gltf => {
            secretsModel = gltf.scene;
            setupGarmentModel(secretsModel, 'secrets');
          }).catch(e => console.warn('Could not load secrets.glb:', e))
        );
      }

      if (sinnersGlbUrl) {
        loaderPromises.push(
          loadGLB(sinnersGlbUrl).then(gltf => {
            sinnersModel = gltf.scene;
            setupGarmentModel(sinnersModel, 'sinners');
          }).catch(e => console.warn('Could not load sinners.glb:', e))
        );
      }

      await Promise.all(loaderPromises);
      switchGarmentModel(currentShirt);
    }

    function setupGarmentModel(model, key) {
      modelBones[key] = {};

      model.traverse((child) => {
        if (child.isBone) {
          modelBones[key][child.name] = child;
        }
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
            child.material.roughness = 0.85;
          }
        }
      });

      // Wrap in a group with pivot compensation
      model.visible = false;
      scene.add(model);
    }

    function switchGarmentModel(colorKey) {
      currentShirt = colorKey;

      if (secretsModel) secretsModel.visible = (colorKey === 'grey');
      if (sinnersModel) sinnersModel.visible = (colorKey === 'burgundy');

      currentActiveModel = (colorKey === 'burgundy') ? sinnersModel : secretsModel;

      swatchBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shirt === colorKey);
      });

      const titleEl = document.getElementById('vto-item-title');
      if (titleEl) {
        titleEl.textContent = (colorKey === 'burgundy')
          ? 'Secrets & Sins - Burgundy Tee'
          : 'Secrets & Sins - Grey Tee';
      }

      updateAddToCartButtonState();
    }

    // ------------------------------------------------------------------------
    // Google MediaPipe Pose Setup
    // ------------------------------------------------------------------------
    function initMediaPipe() {
      if (typeof window.Pose === 'undefined') {
        console.warn('MediaPipe Pose library not found.');
        return;
      }

      poseInstance = new window.Pose({
        locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/' + file,
      });

      poseInstance.setOptions({
        modelComplexity: 1, // Balanced real-time on mobile
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      poseInstance.onResults(onPoseResults);
    }

    function onPoseResults(results) {
      isProcessingFrame = false;

      if (!results || !results.poseLandmarks) {
        hasBodyLock = false;
        return;
      }

      const lm = results.poseLandmarks;
      // Key Landmarks
      const leftShoulder = lm[11];
      const rightShoulder = lm[12];
      const leftElbow = lm[13];
      const rightElbow = lm[14];
      const leftHip = lm[23];
      const rightHip = lm[24];

      // Check shoulder visibility confidence
      if (!leftShoulder || !rightShoulder || (leftShoulder.visibility < 0.4 && rightShoulder.visibility < 0.4)) {
        hasBodyLock = false;
        return;
      }

      hasBodyLock = true;
      lastDetectionTime = Date.now();

      // Show Pose Tracking badge
      if (statusPill) statusPill.classList.add('active');

      // 1. Calculate Torso Dimensions & Angles
      const dx = leftShoulder.x - rightShoulder.x;
      const dy = leftShoulder.y - rightShoulder.y;
      const dz = (leftShoulder.z || 0) - (rightShoulder.z || 0);

      const shoulderWidth2D = Math.hypot(dx, dy);
      const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
      const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

      // Camera visible frustum dimensions at Z=0
      const frustumHeight = 2.0 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const frustumWidth = frustumHeight * camera.aspect;

      // 2. Map screen coordinates to Three.js World Space
      // Video is mirrored for front selfie camera
      let worldX;
      if (facingMode === 'user') {
        worldX = (0.5 - shoulderMidX) * frustumWidth;
      } else {
        worldX = (shoulderMidX - 0.5) * frustumWidth;
      }
      const worldY = (0.5 - shoulderMidY) * frustumHeight;

      // 3. Physical Fit Scaling
      // Model nominal shoulder width is ~0.65m; total height is ~0.68m
      const measuredShoulderWidthMeters = shoulderWidth2D * frustumWidth;
      const baseFitScale = (measuredShoulderWidthMeters / 0.64);
      targetModelScale = baseFitScale * sizeScale * userScale;

      // Model origin (Y=0) is at the hem; collar is at Y ~ 0.58 * scale
      targetPos.x = worldX + manualPosX;
      targetPos.y = worldY - (0.56 * targetModelScale) + manualPosY;
      targetPos.z = 0;

      // 4. Torso Orientation (Roll, Yaw, Pitch)
      // Roll (side tilt)
      let rollAngle = Math.atan2(dy, dx);
      if (facingMode === 'user') rollAngle = -rollAngle;
      targetRot.z = rollAngle;

      // Yaw (body turning left / right)
      const yawAngle = dz * 1.6;
      targetRot.y = yawAngle + (currentView === 'back' ? Math.PI : 0) + manualRotY;

      // Pitch (leaning forward / back)
      if (leftHip && rightHip && leftHip.visibility > 0.4) {
        const hipMidY = (leftHip.y + rightHip.y) / 2;
        const torsoH = hipMidY - shoulderMidY;
        targetRot.x = Math.max(Math.min((torsoH - 0.38) * 0.5, 0.3), -0.3);
      }

      // 5. Rig Sleeve Articulation
      const currentBones = (currentShirt === 'burgundy') ? modelBones.sinners : modelBones.secrets;
      if (currentBones) {
        // Left arm sleeve
        if (currentBones['upper_arm.L'] && leftElbow && leftElbow.visibility > 0.35) {
          const armDx = leftElbow.x - leftShoulder.x;
          const armDy = leftElbow.y - leftShoulder.y;
          const armAngle = Math.atan2(armDy, armDx) - 1.57;
          currentBones['upper_arm.L'].rotation.z = THREE.MathUtils.lerp(
            currentBones['upper_arm.L'].rotation.z,
            Math.max(Math.min(armAngle * 0.4, 0.6), -0.6),
            0.2
          );
        }
        // Right arm sleeve
        if (currentBones['upper_arm.R'] && rightElbow && rightElbow.visibility > 0.35) {
          const armDx = rightElbow.x - rightShoulder.x;
          const armDy = rightElbow.y - rightShoulder.y;
          const armAngle = -Math.atan2(armDy, -armDx) + 1.57;
          currentBones['upper_arm.R'].rotation.z = THREE.MathUtils.lerp(
            currentBones['upper_arm.R'].rotation.z,
            Math.max(Math.min(armAngle * 0.4, 0.6), -0.6),
            0.2
          );
        }
      }
    }

    // ------------------------------------------------------------------------
    // 60 FPS WebGL Render Loop with Damped Smoothing
    // ------------------------------------------------------------------------
    function renderLoop() {
      if (!isModalOpen) return;

      animFrameId = requestAnimationFrame(renderLoop);

      // Send video frames to MediaPipe Pose
      if (poseInstance && video && video.readyState >= 2 && !isProcessingFrame) {
        isProcessingFrame = true;
        poseInstance.send({ image: video }).catch(() => {
          isProcessingFrame = false;
        });
      }

      // If body is not in view, glide gently to center studio presentation
      if (!hasBodyLock || (Date.now() - lastDetectionTime > 1200)) {
        targetPos.x = manualPosX;
        targetPos.y = -0.22 + manualPosY;
        targetPos.z = 0;
        targetModelScale = 1.05 * sizeScale * userScale;
        targetRot.x = 0;
        targetRot.y = (currentView === 'back' ? Math.PI : 0) + manualRotY;
        targetRot.z = 0;
        if (statusPill) statusPill.classList.remove('active');
      }

      // Exponential Moving Average Smoothing
      const lerpSpeed = 0.22;
      currentPos.x += (targetPos.x - currentPos.x) * lerpSpeed;
      currentPos.y += (targetPos.y - currentPos.y) * lerpSpeed;
      currentPos.z += (targetPos.z - currentPos.z) * lerpSpeed;

      currentRot.x += (targetRot.x - currentRot.x) * lerpSpeed;
      currentRot.y += (targetRot.y - currentRot.y) * lerpSpeed;
      currentRot.z += (targetRot.z - currentRot.z) * lerpSpeed;

      currentModelScale += (targetModelScale - currentModelScale) * lerpSpeed;

      // Apply transforms to active 3D garment
      if (currentActiveModel) {
        currentActiveModel.position.set(currentPos.x, currentPos.y, currentPos.z);
        currentActiveModel.rotation.set(currentRot.x, currentRot.y, currentRot.z);
        currentActiveModel.scale.set(currentModelScale, currentModelScale, currentModelScale);
      }

      // Render Three.js Scene
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    }

    // ------------------------------------------------------------------------
    // Camera Stream Management
    // ------------------------------------------------------------------------
    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showPermissionCard('Camera access is not supported on this browser. Please use Chrome or Safari.');
        return;
      }

      if (stream) stopCamera();

      if (permissionCard) permissionCard.style.display = 'none';

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

        if (facingMode === 'user') {
          video.classList.remove('vto-video--rear');
        } else {
          video.classList.add('vto-video--rear');
        }

        // Initialize 3D Engine and Models
        await load3DEngine();
      } catch (err) {
        console.warn('Camera stream error:', err);
        showPermissionCard('Please enable camera permissions to try on the piece in real time.');
      }
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (video) video.srcObject = null;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    }

    async function toggleFlipCamera() {
      facingMode = (facingMode === 'user') ? 'environment' : 'user';
      await startCamera();
    }

    function showPermissionCard(msg) {
      if (permissionCard) {
        const desc = permissionCard.querySelector('p');
        if (desc && msg) desc.textContent = msg;
        permissionCard.style.display = 'flex';
      }
    }

    // ------------------------------------------------------------------------
    // Modal Lifecycle
    // ------------------------------------------------------------------------
    function openModal() {
      if (isModalOpen) return;
      isModalOpen = true;

      document.body.style.overflow = 'hidden';

      const checkedSize = document.querySelector('input[name^="option-"]:checked');
      if (checkedSize && sizeScales[checkedSize.value]) {
        syncActiveSize(checkedSize.value);
      } else {
        syncActiveSize('M');
      }

      manualPosX = 0;
      manualPosY = 0;
      manualRotY = 0;
      userScale = 1.0;

      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');

      startCamera();
    }

    function closeModal() {
      if (!isModalOpen) return;
      isModalOpen = false;

      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      stopCamera();

      if (snapshotOverlay) snapshotOverlay.style.display = 'none';
      if (statusPill) statusPill.classList.remove('active');
    }

    // ------------------------------------------------------------------------
    // Controls: Sizing, Color, and Front/Back View
    // ------------------------------------------------------------------------
    function syncActiveSize(size) {
      currentSize = size;
      sizeScale = sizeScales[size] || 1.0;

      sizePills.forEach(pill => {
        pill.classList.toggle('active', pill.dataset.size === size);
      });

      const pageRadio = document.querySelector('input[name^="option-"][value="' + size + '"]');
      if (pageRadio && !pageRadio.checked) {
        pageRadio.checked = true;
        pageRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }

      updateAddToCartButtonState();
    }

    function syncActiveView(view) {
      currentView = view;
      viewBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }

    function updateAddToCartButtonState() {
      if (!addCartBtn) return;
      const selector = document.querySelector('select.variant-selector');
      if (!selector) return;

      let targetVariant = null;
      if (variantData && variantData.variants) {
        targetVariant = variantData.variants.find(v => {
          const opts = [v.option1, v.option2, v.option3].filter(Boolean);
          return opts.includes(currentSize);
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
    // Touch & Mouse 3D Manipulation (Pan, Pinch & 360 Spin)
    // ------------------------------------------------------------------------
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startManualRotY = 0;
    let startManualPosX = 0;
    let startManualPosY = 0;
    let pinchDistance = 0;
    let startUserScale = 1.0;

    function getDistance(t1, t2) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    }

    function onPointerDown(e) {
      if (e.target.closest('.vto-header') || e.target.closest('.vto-controls') || e.target.closest('.vto-view-toggle') || e.target.closest('.vto-shirt-toggle') || e.target.closest('.vto-snapshot-overlay')) {
        return;
      }

      if (e.touches && e.touches.length === 2) {
        isDragging = false;
        pinchDistance = getDistance(e.touches[0], e.touches[1]);
        startUserScale = userScale;
        return;
      }

      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      dragStartX = clientX;
      dragStartY = clientY;
      startManualRotY = manualRotY;
      startManualPosX = manualPosX;
      startManualPosY = manualPosY;

      if (guide) guide.classList.add('vto-guide--hidden');
    }

    function onPointerMove(e) {
      if (e.touches && e.touches.length === 2) {
        const dist = getDistance(e.touches[0], e.touches[1]);
        if (pinchDistance > 0) {
          const factor = dist / pinchDistance;
          userScale = Math.min(Math.max(startUserScale * factor, 0.7), 1.6);
        }
        return;
      }

      if (!isDragging) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - dragStartX;
      const deltaY = clientY - dragStartY;

      // Horizontal drag rotates the 3D model in space
      manualRotY = startManualRotY + (deltaX * 0.008);
      // Vertical drag fine-tunes elevation
      manualPosY = startManualPosY - (deltaY * 0.0012);
    }

    function onPointerUp() {
      isDragging = false;
      pinchDistance = 0;
    }

    function onWheel(e) {
      if (!isModalOpen) return;
      e.preventDefault();
      userScale = Math.min(Math.max(userScale + (e.deltaY * -0.001), 0.7), 1.6);
    }

    let lastTap = 0;
    function onDoubleTap() {
      const now = Date.now();
      if (now - lastTap < 300) {
        manualRotY = 0;
        manualPosX = 0;
        manualPosY = 0;
        userScale = 1.0;
      }
      lastTap = now;
    }

    // ------------------------------------------------------------------------
    // Photo Snapshot (Video + 3D Garment Render + Branding)
    // ------------------------------------------------------------------------
    function captureSnapshot() {
      if (!video || !video.videoWidth || !renderer) return;

      if (flashEl) {
        flashEl.classList.add('active');
        setTimeout(() => flashEl.classList.remove('active'), 200);
      }

      const captureCanvas = document.createElement('canvas');
      const targetW = 1080;
      const targetH = 1440;
      captureCanvas.width = targetW;
      captureCanvas.height = targetH;
      const ctx = captureCanvas.getContext('2d');

      // 1. Draw Video Frame (with horizontal mirror for selfie)
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      const vAspect = vW / vH;
      const tAspect = targetW / targetH;

      let sW, sH, sx, sy;
      if (vAspect > tAspect) {
        sH = vH;
        sW = vH * tAspect;
        sx = (vW - sW) / 2;
        sy = 0;
      } else {
        sW = vW;
        sH = vW / tAspect;
        sx = 0;
        sy = (vH - sH) / 2;
      }

      ctx.save();
      if (facingMode === 'user') {
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, sW, sH, 0, 0, targetW, targetH);
      ctx.restore();

      // 2. Draw 3D Garment WebGL Layer
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0, targetW, targetH);

      // 3. Subtle Brand Watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.font = '700 24px "Century Gothic", sans-serif';
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'center';
      ctx.fillText('INCORRECT SOCIETY', targetW / 2, targetH - 45);

      ctx.font = '500 13px "Century Gothic", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('SECRETS & SINS · 3D VIRTUAL TRY-ON', targetW / 2, targetH - 22);

      const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.94);

      if (snapshotImg) snapshotImg.src = dataUrl;
      if (downloadBtn) {
        downloadBtn.href = dataUrl;
        downloadBtn.setAttribute('download', 'incorrect-society-' + currentShirt + '-' + currentSize.toLowerCase() + '.jpg');
      }
      if (snapshotOverlay) snapshotOverlay.style.display = 'flex';
    }

    // ------------------------------------------------------------------------
    // Add to Cart
    // ------------------------------------------------------------------------
    async function handleAddToCart() {
      if (!addCartBtn || addCartBtn.disabled) return;

      const textEl = addCartBtn.querySelector('.vto-add-text');
      const originalText = textEl ? textEl.textContent : 'Add to Cart';

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
        console.error('No variant ID resolved.');
        return;
      }

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
        console.error('Add to cart failed:', err);
        if (textEl) textEl.textContent = 'Error Adding';
        setTimeout(() => {
          addCartBtn.disabled = false;
          if (textEl) textEl.textContent = originalText;
        }, 2200);
      }
    }

    // ------------------------------------------------------------------------
    // Event Listeners
    // ------------------------------------------------------------------------
    openBtn.addEventListener('click', openModal);

    closeBtns.forEach(btn => btn.addEventListener('click', closeModal));

    if (flipCamBtn) flipCamBtn.addEventListener('click', toggleFlipCamera);
    if (reqCamBtn) reqCamBtn.addEventListener('click', startCamera);

    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => syncActiveView(btn.dataset.view));
    });

    swatchBtns.forEach(btn => {
      btn.addEventListener('click', () => switchGarmentModel(btn.dataset.shirt));
    });

    sizePills.forEach(pill => {
      pill.addEventListener('click', () => syncActiveSize(pill.dataset.size));
    });

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

    if (takePhotoBtn) takePhotoBtn.addEventListener('click', captureSnapshot);
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        if (snapshotOverlay) snapshotOverlay.style.display = 'none';
      });
    }

    if (addCartBtn) addCartBtn.addEventListener('click', handleAddToCart);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        if (snapshotOverlay && snapshotOverlay.style.display === 'flex') {
          snapshotOverlay.style.display = 'none';
        } else {
          closeModal();
        }
      }
    });

    document.querySelectorAll('input[name^="option-"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (sizeScales[radio.value]) {
          syncActiveSize(radio.value);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirtualTryOn);
  } else {
    initVirtualTryOn();
  }

  document.addEventListener('shopify:section:load', (event) => {
    if (event.detail && event.detail.sectionId) {
      initVirtualTryOn();
    }
  });
})();
