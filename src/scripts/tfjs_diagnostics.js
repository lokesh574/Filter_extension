/**
 * TFJS Diagnostics Helper
 * Provides enhanced logging and debugging for the TFJS fallback path
 */

const TFJSDiagnostics = {
    logPredictions: function (predictions, context = '') {
        if (!predictions) {
            console.warn(`[${context}] Predictions is null/undefined`);
            return;
        }
        if (!Array.isArray(predictions)) {
            console.error(`[${context}] Predictions is not an array:`, typeof predictions, predictions);
            return;
        }
        console.log(`[${context}] Predictions count: ${predictions.length}`);
        if (predictions.length === 0) {
            console.warn(`[${context}] No predictions detected`);
            return;
        }

        const pred = predictions[0];
        const shape = {
            hasScaledMesh: !!pred.scaledMesh && Array.isArray(pred.scaledMesh),
            scaledMeshLen: pred.scaledMesh && Array.isArray(pred.scaledMesh) ? pred.scaledMesh.length : null,
            hasKeypoints: !!pred.keypoints && Array.isArray(pred.keypoints),
            keypointsLen: pred.keypoints && Array.isArray(pred.keypoints) ? pred.keypoints.length : null,
            hasAnnotations: !!pred.annotations,
            hasAnnotationsSilhouette: pred.annotations && !!pred.annotations.silhouette,
            hasBbox: !!pred.bbox,
            allKeys: Object.keys(pred)
        };
        console.log(`[${context}] First prediction shape:`, shape);

        if (pred.scaledMesh && pred.scaledMesh[0]) {
            console.log(`[${context}] ScaledMesh[0]:`, pred.scaledMesh[0]);
        }
        if (pred.keypoints && pred.keypoints[0]) {
            console.log(`[${context}] Keypoints[0]:`, pred.keypoints[0]);
        }
    },

    logLandmarks: function (landmarks, faceIndex = 0) {
        if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) {
            console.warn(`[LANDMARKS] Face ${faceIndex}: Invalid or empty landmarks`);
            return;
        }
        console.log(`[LANDMARKS] Face ${faceIndex}: Count=${landmarks.length}, First={${landmarks[0].x}, ${landmarks[0].y}, ${landmarks[0].z}}`);
    },

    checkDrawingUtilsCall: function (results, filterName) {
        if (!results) {
            console.error('[DRAW] results is null/undefined');
            return false;
        }
        if (!results.multiFaceLandmarks) {
            console.error('[DRAW] results.multiFaceLandmarks is missing');
            return false;
        }
        if (!Array.isArray(results.multiFaceLandmarks)) {
            console.error('[DRAW] results.multiFaceLandmarks is not an array:', typeof results.multiFaceLandmarks);
            return false;
        }
        console.log(`[DRAW] Calling DrawingUtils.draw with ${results.multiFaceLandmarks.length} faces, filter="${filterName}"`);
        return true;
    }
};

export default TFJSDiagnostics;
