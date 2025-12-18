import './scripts/mediapipe_shim';
import FM from './scripts/fm_wrapper'

window.addEventListener('DOMContentLoaded', async () => {
  const fm = new FM();
  // Expose instance for debugging in DevTools
  try {
    window.FM = fm;
    console.log('FM instance attached to window.FM for debugging');
  } catch (e) {
    console.warn('Could not attach FM to window for debugging:', e);
  }
});

// Provide convenient helpers for quick manual checks from DevTools
Object.defineProperty(window, 'FMHelpers', {
  get() {
    return {
      checkMediaPipe: () => window.FM ? window.FM.checkMediaPipeAvailability().then(() => ({ faceMeshReady: window.FM.faceMeshReady, faceMeshFailed: window.FM.faceMeshFailed, tfjsReady: window.FM.tfjsReady })).catch(e => ({ error: e })) : Promise.reject(new Error('FM not instantiated')),
      runTfjsOnce: () => window.FM ? window.FM.runTfjsInference() : Promise.reject(new Error('FM not instantiated')),
      startTfjsLoop: () => window.FM ? window.FM.startTfjsLoop() : null,
      stopTfjsLoop: () => window.FM ? window.FM.stopTfjsLoop() : null
    };
  }
});