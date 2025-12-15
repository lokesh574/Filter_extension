import DrawingUtils from "./drawing_utils";
import Controls from "./controls";
import { VIDEO_WIDTH, VIDEO_HEIGHT } from './video_dimensions'
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

class FM {
  constructor(filterName) {
    this.videoElement = document.querySelector("#video");
    this.canvasElement = document.querySelector("#game-canvas");
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.filterName = filterName || "none";
    this.camera = null;

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

      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          const url = chrome.runtime.getURL(`dist/${file}`);
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

      // Setup MediaPipe camera
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          try {
            await this.faceMesh.send({ image: this.videoElement });
          } catch (frameError) {
            console.error('Frame processing error:', frameError);
          }
        },
        width: this.canvasElement.width,
        height: this.canvasElement.height
      });

      this.camera.start();
      console.log('✓ MediaPipe camera started');

    } catch (error) {
      console.error('MediaPipe setup failed:', error);
      // Continue with basic video feed
    }
  }

  /* recall facemesh onResults function with the updated callback function
  to draw the new filter on the canvas */
  changeFilter(filterName) {
    this.filterName = filterName;
    this.faceMesh.onResults(this.drawFaces.bind(this));
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