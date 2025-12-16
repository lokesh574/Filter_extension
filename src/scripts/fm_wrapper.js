import DrawingUtils from "./drawing_utils";
import Controls from "./controls";
import { VIDEO_WIDTH, VIDEO_HEIGHT } from './video_dimensions'
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
// Static imports as a fallback for TFJS in extension environment
import * as tfStatic from '@tensorflow/tfjs';
import * as faceLandmarksStatic from '@tensorflow-models/face-landmarks-detection';

class FM {
  constructor(filterName) {
    this.videoElement = document.querySelector("#video");
    this.canvasElement = document.querySelector("#game-canvas");
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.filterName = filterName || "none";
    this.camera = null;
    this.faceMeshReady = false;
    this.faceMeshFailed = false;

    this.initCamera();
    this.bindControls.apply(this);
  }

  async initCamera() {
    try {
      console.log('=== STARTING CAMERA INITIALIZATION ===');

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      console.log('MediaDevices available:', !!navigator.mediaDevices);
      console.log('GetUserMedia available:', !!navigator.mediaDevices.getUserMedia);
      console.log('Secure context:', window.isSecureContext);

      // Request basic camera permission
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480
        },
        audio: false
      });

      console.log('✓ Camera stream obtained:', stream);
      console.log('Video tracks:', stream.getVideoTracks().length);

      // Setup video element
      console.log('Setting up video element...');
      this.videoElement.srcObject = stream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      // Wait for video to load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video metadata load timeout after 10 seconds'));
        }, 10000);

        this.videoElement.onloadedmetadata = () => {
          clearTimeout(timeout);
          console.log('✓ Video metadata loaded');
          console.log('Video dimensions:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
          resolve();
        };

        this.videoElement.onerror = (err) => {
          clearTimeout(timeout);
          console.error('Video element error:', err);
          reject(new Error('Video element failed to load'));
        };
      });

      // Ensure video plays
      try {
        await this.videoElement.play();
        console.log('✓ Video playing successfully');
      } catch (playError) {
        console.warn('Video play failed, will retry:', playError.message);
      }

      // Setup canvas
      console.log('Setting up canvas...');
      this.canvasElement.width = this.videoElement.videoWidth || 640;
      this.canvasElement.height = this.videoElement.videoHeight || 480;
      this.canvasElement.style.display = 'block';
      console.log('Canvas size set to:', this.canvasElement.width, 'x', this.canvasElement.height);

      // Start basic video rendering loop (without MediaPipe for now)
      this.startBasicVideoLoop();

      console.log('✓ BASIC CAMERA SETUP COMPLETE');

      // Now try MediaPipe
      setTimeout(() => this.setupMediaPipe(), 1000);

    } catch (error) {
      console.error('=== CAMERA INITIALIZATION FAILED ===');
      console.error('Error type:', typeof error);
      console.error('Error constructor:', error.constructor.name);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error constraint:', error.constraint);
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('Error stack:', error.stack);

      this.showCameraError(error);
    }
  }

  startBasicVideoLoop() {
    console.log('Starting basic video rendering loop...');
    const renderFrame = () => {
      if (this.videoElement && this.videoElement.videoWidth > 0) {
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
      }
      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  }

  async setupMediaPipe() {
    try {
      console.log('=== SETTING UP MEDIAPIPE ===');

      // Quick CSP check: if the environment blocks dynamic eval/new Function,
      // MediaPipe's wasm glue will fail. Detect that and skip MediaPipe to use TFJS fallback.
      const supportsEval = (() => {
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function('return 1');
          return fn() === 1;
        } catch (e) {
          return false;
        }
      })();
      if (!supportsEval) {
        console.info('CSP prevents dynamic evaluation (unsafe-eval). Skipping MediaPipe initialization and using TFJS fallback.');
        this.faceMeshFailed = true;
        try {
          await this.initTfjsFallback();
          console.log('TFJS fallback initialized (CSP path)');
        } catch (tfErr) {
          console.error('TFJS fallback failed under CSP detection:', tfErr);
        }
        return;
      }

      // Handle different possible export shapes from the bundled module
      let FaceMeshConstructor = FaceMesh;
      if (!FaceMeshConstructor) {
        throw new Error('FaceMesh import is undefined');
      }
      // If the import is an object namespace, try common properties
      if (typeof FaceMeshConstructor !== 'function') {
        FaceMeshConstructor = FaceMesh.FaceMesh || FaceMesh.default || FaceMesh;
      }

      console.log('Using FaceMesh constructor:', typeof FaceMeshConstructor);

      // Preflight check: ensure required MediaPipe files are reachable. If they fail, fall back to CDN.
      // In some contexts (non-extension or test), `chrome.runtime` may be undefined — fall back to a relative origin URL.
      const runtimeGetUrl = (path) => {
        try {
          if (window.chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') return chrome.runtime.getURL(path);
        } catch (e) {
          // ignore
        }
        // fallback to relative path under current origin
        const base = (window.location && window.location.origin) ? window.location.origin : '';
        // If app is served from filesystem (file://) location.origin may be 'null', so use empty base.
        return base + '/' + path.replace(/^\/+/, '');
      };
      const mediapipeBase = runtimeGetUrl('dist/node_modules/@mediapipe/face_mesh/');
      let useCdn = false;
      const expectedFiles = [
        'face_mesh_solution_simd_wasm_bin.js',
        'face_mesh_solution_wasm_bin.js',
        'face_mesh_solution_simd_wasm_bin.wasm',
        'face_mesh_solution_wasm_bin.wasm',
        'face_mesh_solution_packed_assets.data',
        'face_mesh_solution_packed_assets_loader.js'
      ];

      try {
        const checks = await Promise.all(expectedFiles.map(async (f) => {
          const url = mediapipeBase + f;
          try {
            const res = await fetch(url, { method: 'GET' });
            console.log('Preflight fetch', f, '->', url, 'status', res.status);
            return { file: f, ok: res.ok, status: res.status };
          } catch (fetchErr) {
            console.warn('Preflight fetch error for', url, fetchErr);
            return { file: f, ok: false, error: fetchErr };
          }
        }));

        const failed = checks.filter(c => !c.ok);
        if (failed.length) {
          console.error('MediaPipe asset preflight found missing files:', failed);
          console.error('These assets must be present in the extension `dist` folder and listed in manifest.web_accessible_resources.');
          // Do not fallback to CDN inside the extension — CSP blocks external scripts. Throw to skip MediaPipe setup.
          throw new Error('Required MediaPipe assets missing in extension dist; see console for details');
        }
      } catch (preErr) {
        console.warn('Preflight check threw an error, falling back to CDN:', preErr);
        useCdn = true;
      }

      this.faceMesh = new FaceMeshConstructor({
        // Prevent the loader from trying to fetch a graph file that's not present in dist
        graph: undefined,
        locateFile: (file) => {
          // CopyPlugin placed mediapipe files under dist/node_modules/@mediapipe/face_mesh/
          // If the loader requests SIMD variants that use dynamic eval, force the non-SIMD filename
          let requested = file;
          if (requested && requested.indexOf('simd') !== -1) {
            requested = requested.replace('face_mesh_solution_simd_wasm_bin', 'face_mesh_solution_wasm_bin');
            requested = requested.replace('solution_simd_wasm_bin', 'solution_wasm_bin');
          }
          const url = runtimeGetUrl(`dist/node_modules/@mediapipe/face_mesh/${requested}`);
          console.log('Loading MediaPipe file:', file, '=>', url);
          return url;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      this.faceMesh.onResults(this.drawFaces.bind(this));
      console.log('✓ MediaPipe Face Mesh configured');

      // If the solution exposes an initialize() method, call it to ensure WASM and assets are loaded
      try {
        if (typeof this.faceMesh.initialize === 'function') {
          console.log('Calling faceMesh.initialize() to load WASM/assets...');
          await this.faceMesh.initialize();
          console.log('faceMesh.initialize() completed');
        }
        this.faceMeshReady = true;
      } catch (initErr) {
        console.error('faceMesh initialize failed:', initErr);
        this.faceMeshFailed = true;
        // Abort setting up the Camera to use faceMesh
        console.warn('MediaPipe will be disabled due to initialization failure.');
        // Try a TFJS fallback for face landmarks to keep filters working under extension CSP
        try {
          console.log('Attempting TFJS fallback for face landmarks...');
          await this.initTfjsFallback();
          console.log('TFJS fallback initialized');
        } catch (tfErr) {
          console.error('TFJS fallback failed:', tfErr);
        }
        return;
      }
      // Diagnostics: ensure send exists
      try {
        console.log('faceMesh.send typeof:', typeof this.faceMesh.send);
        if (this.faceMesh && this.faceMesh.send) {
          try {
            console.log('faceMesh.send toString:', this.faceMesh.send.toString().slice(0, 300));
          } catch (sErr) {
            console.warn('Could not stringify faceMesh.send:', sErr);
          }
        }
        console.log('faceMesh keys:', Object.getOwnPropertyNames(this.faceMesh));
        try {
          console.log('faceMesh prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.faceMesh)));
        } catch (protoErr) {
          console.warn('Could not enumerate faceMesh prototype keys:', protoErr);
        }
      } catch (diagErr) {
        console.warn('FaceMesh diagnostics failed:', diagErr);
      }

      // Setup MediaPipe camera
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          try {
            // If TFJS fallback is ready, run that inference path (no MediaPipe WASM/eval needed)
            if (this.tfjsReady) {
              await this.runTfjsInference();
              return;
            }

            if (this.faceMeshFailed) return;
            if (!this.faceMeshReady) {
              // Not ready yet; skip sending this frame
              return;
            }
            if (!this.faceMesh || typeof this.faceMesh.send !== 'function') {
              console.error('faceMesh.send is not a function; skipping send. faceMesh:', this.faceMesh);
              this.faceMeshFailed = true;
              return;
            }
            await this.faceMesh.send({ image: this.videoElement });
          } catch (frameError) {
            console.error('Frame processing error:', frameError);
            if (frameError && frameError.stack) {
              console.error('Frame error stack:', frameError.stack);
            }
            try {
              if (this.faceMesh && this.faceMesh.send) {
                try {
                  console.log('faceMesh.send exists; toString snippet:', this.faceMesh.send.toString().slice(0, 200));
                } catch (tErr) {
                  console.warn('Could not toString faceMesh.send during frame error:', tErr);
                }
              }
              console.log('faceMesh keys during frame error:', Object.getOwnPropertyNames(this.faceMesh || {}));
            } catch (dErr) {
              console.warn('Diagnostic dump during frame error failed:', dErr);
            }
            try {
              console.error('faceMesh dump:', this.faceMesh);
            } catch (dErr) {
              console.error('Failed to dump faceMesh during frame error:', dErr);
            }
            // Prevent further noisy errors
            this.faceMeshFailed = true;
          }
        },
        width: this.canvasElement.width,
        height: this.canvasElement.height
      });

      this.camera.start();
      console.log('✓ MediaPipe camera started');

    } catch (error) {
      console.error('MediaPipe setup failed:', error);
      // If preflight failed, it already logged missing files. Do not attempt to start camera/send frames.
      console.warn('Continuing with basic video feed only; face mesh will be disabled until assets are present in dist.');
      return;
    }
  }

  // TFJS fallback: load a JS-only face landmarks model and provide results compatible with DrawingUtils
  async initTfjsFallback() {
    try {
      // Try dynamic import first (preserves lazy loading). If it fails in the extension environment,
      // fall back to the static imports bundled by Webpack (`tfStatic`, `faceLandmarksStatic`).
      let tf = null;
      let facemeshMod = null;
      try {
        tf = await import('@tensorflow/tfjs');
        await import('@tensorflow/tfjs-backend-webgl');
        facemeshMod = await import('@tensorflow-models/face-landmarks-detection');
        console.log('TFJS fallback: dynamic import succeeded');
      } catch (dynErr) {
        console.warn('TFJS dynamic import failed, using static imports bundled at build time:', dynErr);
        tf = tfStatic;
        facemeshMod = faceLandmarksStatic;
      }

      console.log('TFJS fallback: modules imported:', { tf: !!tf, faceLandmarksMod: !!facemeshMod, keys: Object.keys(facemeshMod || {}) });

      // Set backend to webgl if available
      try {
        if (tf.setBackend) {
          await tf.setBackend('webgl');
          console.log('TFJS backend set to webgl');
        }
      } catch (e) {
        console.warn('Could not set webgl backend, continuing with default', e);
      }
      try { if (tf.ready) await tf.ready(); } catch (e) { console.warn('tf.ready() failed', e); }

      // The face-landmarks-detection package can export either a legacy `load()` API or a newer `createDetector()` API.
      let loadFn = facemeshMod && facemeshMod.load;
      if (!loadFn && facemeshMod && facemeshMod.default) loadFn = facemeshMod.default.load;

      const createDetector = facemeshMod.createDetector || (facemeshMod.default && facemeshMod.default.createDetector);
      const SupportedModels = facemeshMod.SupportedModels || (facemeshMod.default && facemeshMod.default.SupportedModels) || facemeshMod.SupportedPackages || null;
      console.log('TFJS fallback: createDetector present?', !!createDetector, 'SupportedModels:', SupportedModels ? Object.keys(SupportedModels) : SupportedModels);

      // Prefer the newer detector API when available
      if (createDetector && SupportedModels) {
        try {
          console.log('TFJS fallback: createDetector available. SupportedModels keys:', Object.keys(SupportedModels));
          // prefer MediaPipeFaceMesh if the enum exists, otherwise take first value
          let modelToken = null;
          if (SupportedModels.MediaPipeFaceMesh) modelToken = SupportedModels.MediaPipeFaceMesh;
          else if (SupportedModels.mediapipeFacemesh) modelToken = SupportedModels.mediapipeFacemesh;
          else if (SupportedModels.MediaPipe) modelToken = SupportedModels.MediaPipe;
          else {
            const vals = Object.values(SupportedModels);
            modelToken = vals && vals.length ? vals[0] : null;
          }
          console.log('TFJS fallback: selected modelToken for createDetector:', modelToken);
          const detectorConfig = { runtime: 'tfjs', maxFaces: 1 };
          this.tfModel = await createDetector(modelToken, detectorConfig);
          this.tfjsIsDetector = true;
          console.log('TFJS fallback: detector created using model token:', modelToken);
        } catch (detErr) {
          console.warn('TFJS fallback: createDetector failed, will try legacy load():', detErr);
        }
      }

      // If detector not created, try legacy load() API
      if (!this.tfModel && loadFn) {
        // Try to find package token
        const supportedPkgs = facemeshMod.SupportedPackages || (facemeshMod.default && facemeshMod.default.SupportedPackages) || {};
        const pkg = supportedPkgs.mediapipeFacemesh || supportedPkgs.mediapipe || supportedPkgs.tfjs || supportedPkgs.TFJS || 'tfjs';
        console.log('TFJS fallback: falling back to legacy load() with token:', pkg);
        this.tfModel = await loadFn(pkg);
        this.tfjsIsDetector = false;
        console.log('TFJS fallback: legacy model loaded');
      }

      if (!this.tfModel) {
        console.error('TFJS fallback: could not initialize model. Module keys:', Object.keys(facemeshMod || {}));
        throw new Error('face-landmarks-detection.load not found on module');
      }

      this.faceMeshReady = false; // keep MediaPipe flag false
      this.tfjsReady = true;
      // show debug overlay to indicate TFJS fallback active
      this.showDebugOverlay = true;

      // Replace camera onFrame handler to use TFJS if MediaPipe not available
      if (this.camera) {
        const originalOnFrame = this.camera.onFrame;
        // We don't replace the Camera implementation; instead, the existing camera calls our onFrame logic which checks flags.
      }
    } catch (err) {
      this.tfjsReady = false;
      console.error('Failed to initialize TFJS fallback:', err);
      throw err;
    }
  }

  async runTfjsInference() {
    if (!this.tfModel || !this.videoElement) return;
    try {
      let predictions = null;
      try {
        if (this.tfjsIsDetector && typeof this.tfModel.estimateFaces !== 'function') {
          // New detector API uses detect() not estimateFaces
          if (typeof this.tfModel.estimateFaces === 'function') {
            predictions = await this.tfModel.estimateFaces({ input: this.videoElement });
          } else if (typeof this.tfModel.detect === 'function') {
            predictions = await this.tfModel.detect(this.videoElement);
          } else if (typeof this.tfModel.estimateFaces === 'function') {
            predictions = await this.tfModel.estimateFaces(this.videoElement);
          } else {
            // last resort
            predictions = await this.tfModel.estimateFaces({ input: this.videoElement });
          }
        } else if (typeof this.tfModel.estimateFaces === 'function') {
          predictions = await this.tfModel.estimateFaces({ input: this.videoElement });
        } else if (typeof this.tfModel.detect === 'function') {
          predictions = await this.tfModel.detect(this.videoElement);
        } else {
          // can't call model
          throw new Error('TFJS model has no detect/estimateFaces method');
        }
      } catch (callErr) {
        console.warn('TFJS inference: primary call failed, trying alternate invocation shapes:', callErr);
        // try alternating shapes
        try { predictions = await this.tfModel.detect(this.videoElement); } catch (e) { /* ignore */ }
        try { if (!predictions) predictions = await this.tfModel.estimateFaces({ input: this.videoElement }); } catch (e) { /* ignore */ }
      }

      console.log('TFJS inference: predictions count:', Array.isArray(predictions) ? predictions.length : 'non-array', predictions && predictions[0] ? Object.keys(predictions[0]) : null);

      // Convert TFJS predictions to MediaPipe-style results object with multiFaceLandmarks
      const results = { multiFaceLandmarks: [] };
      const vw = this.videoElement.videoWidth || this.canvasElement.width || VIDEO_WIDTH || 640;
      const vh = this.videoElement.videoHeight || this.canvasElement.height || VIDEO_HEIGHT || 480;

      for (const pred of (predictions || [])) {
        // Legacy shape: pred.scaledMesh (array of [x,y,z])
        if (pred.scaledMesh && Array.isArray(pred.scaledMesh)) {
          const landmarks = pred.scaledMesh.map(p => ({ x: (p[0] / vw), y: (p[1] / vh), z: (p[2] || 0) }));
          results.multiFaceLandmarks.push(landmarks);
          continue;
        }

        // Newer detector shape: pred.keypoints or pred.keypoints3D (array of {x,y,z?})
        if (pred.keypoints && Array.isArray(pred.keypoints) && pred.keypoints.length) {
          // keypoints may be absolute pixels; normalize
          const landmarks = pred.keypoints.map(k => ({ x: (k.x / vw), y: (k.y / vh), z: (k.z || 0) }));
          results.multiFaceLandmarks.push(landmarks);
          continue;
        }

        // Some detector outputs nest annotations or scaledMesh under different props
        if (pred.annotations && pred.annotations.silhouette) {
          // produce a coarse landmark set from silhouette
          const landmarks = pred.annotations.silhouette.map(p => ({ x: (p[0] / vw), y: (p[1] / vh), z: (p[2] || 0) }));
          results.multiFaceLandmarks.push(landmarks);
          continue;
        }
      }
      if (!results.multiFaceLandmarks.length) {
        console.log('TFJS inference: no landmarks detected this frame');
      } else {
        console.log('TFJS inference: constructed multiFaceLandmarks[0] length:', results.multiFaceLandmarks[0].length);
      }
      // Hand off to drawing utils
      DrawingUtils.draw(this.canvasCtx, results, this.filterName);

      // Draw debug overlay if requested
      if (this.showDebugOverlay) {
        this.drawOverlay({ faces: results.multiFaceLandmarks.length, model: this.tfjsIsDetector ? 'detector' : 'legacy' });
      }
    } catch (err) {
      console.error('TFJS inference error:', err);
    }
  }

  drawOverlay(info) {
    try {
      const ctx = this.canvasCtx;
      const canvas = ctx.canvas;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(10, 10, 220, 64);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.fillText(`TFJS: ${this.tfjsReady ? 'ready' : 'not ready'}`, 18, 32);
      ctx.fillText(`Model: ${info.model || 'n/a'}`, 18, 50);
      ctx.fillText(`Faces: ${info.faces}`, 120, 32);
      ctx.restore();
    } catch (e) {
      console.warn('Overlay draw failed', e);
    }
  }

  /* recall facemesh onResults function with the updated callback function
  to draw the new filter on the canvas */
  changeFilter(filterName) {
    this.filterName = filterName;
    if (this.faceMesh && typeof this.faceMesh.onResults === 'function') {
      try {
        this.faceMesh.onResults(this.drawFaces.bind(this));
      } catch (e) {
        console.warn('changeFilter: faceMesh.onResults threw:', e);
      }
    } else {
      console.log('changeFilter: faceMesh not available; filter set to', filterName);
    }
  }

  bindControls() {
    Controls.toggleVideo();
    Controls.bindFilterSelect(this);
    Controls.bindOnCanPlay();
    Controls.bindTakePicture();
    Controls.bindClearInstructions();

    // Add video monitoring
    this.monitorVideo();
  }

  monitorVideo() {
    setInterval(() => {
      if (this.videoElement) {
        console.log('Video status:', {
          readyState: this.videoElement.readyState,
          paused: this.videoElement.paused,
          ended: this.videoElement.ended,
          videoWidth: this.videoElement.videoWidth,
          videoHeight: this.videoElement.videoHeight,
          currentTime: this.videoElement.currentTime
        });
      }
    }, 5000); // Log every 5 seconds
  }

  /* callback for facemesh onResults function to operate on the resulting
  face detections */
  drawFaces(detections) {
    try {
      console.log('DrawFaces called with detections:', detections ? 'present' : 'null');

      // Always draw the video feed first, even without detections
      this.canvasCtx.save();
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

      // Draw video frame
      if (this.videoElement && this.videoElement.videoWidth > 0) {
        this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        console.log('Video frame drawn to canvas');
      } else {
        console.warn('Video element not ready or has no dimensions');
      }

      this.canvasCtx.restore();

      // Then apply face mesh and filters if detections exist
      if (detections) {
        DrawingUtils.draw(this.canvasCtx, detections, this.filterName);
      }

    } catch (drawError) {
      console.error('Error in drawFaces:', drawError);
    }
  }

  showCameraError(error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); color: white; padding: 30px; border-radius: 15px; text-align: center; z-index: 1000; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

    console.log('Camera error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      constraint: error.constraint
    });

    let errorMessage = 'Camera access is required for Filter.io to work.';
    let troubleshooting = '';

    if (error.name === 'NotAllowedError') {
      errorMessage = 'Camera access was denied.';
      troubleshooting = 'Please click the camera icon in your address bar and allow camera access, then refresh this page.';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No camera found on this device.';
      troubleshooting = 'Please ensure a camera is connected and try again.';
    } else if (error.name === 'NotReadableError') {
      errorMessage = 'Camera is already in use.';
      troubleshooting = 'Please close other applications that might be using your camera and try again.';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = 'Camera constraints could not be satisfied.';
      troubleshooting = 'Your camera may not support the required video format.';
    } else if (error.message && error.message.includes('secure context')) {
      errorMessage = 'Camera access requires a secure connection.';
      troubleshooting = 'Please ensure you are using HTTPS or localhost.';
    } else {
      errorMessage = `Camera error: ${error.message || error.name || 'Unknown error'}`;
      troubleshooting = 'Please check your camera settings and browser permissions.';
    }

    const title = document.createElement('h3');
    title.textContent = 'Camera Access Required';
    title.style.marginTop = '0';

    const message = document.createElement('p');
    message.textContent = errorMessage;
    message.style.fontSize = '16px';
    message.style.marginBottom = '10px';

    const troubleshootingText = document.createElement('p');
    troubleshootingText.textContent = troubleshooting;
    troubleshootingText.style.fontSize = '14px';
    troubleshootingText.style.color = '#ccc';
    troubleshootingText.style.marginBottom = '20px';

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.style.cssText = 'padding: 12px 24px; margin-right: 10px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;';
    retryBtn.addEventListener('click', () => {
      location.reload();
    });

    const permissionBtn = document.createElement('button');
    permissionBtn.textContent = 'Check Permissions';
    permissionBtn.style.cssText = 'padding: 12px 24px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;';
    permissionBtn.addEventListener('click', () => {
      // Try to trigger permission dialog again
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => location.reload())
        .catch(err => console.log('Permission retry failed:', err));
    });

    errorDiv.appendChild(title);
    errorDiv.appendChild(message);
    errorDiv.appendChild(troubleshootingText);
    errorDiv.appendChild(retryBtn);
    errorDiv.appendChild(permissionBtn);

    document.body.appendChild(errorDiv);
  }
}

export default FM;