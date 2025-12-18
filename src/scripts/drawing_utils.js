import { VIDEO_HEIGHT, VIDEO_WIDTH, DEFAULT_SKEW } from "./video_dimensions";
import { drawConnectors, FACEMESH_TESSELATION, FACEMESH_RIGHT_EYE, FACEMESH_RIGHT_EYEBROW, FACEMESH_LEFT_EYE, FACEMESH_LEFT_EYEBROW, FACEMESH_LIPS } from '@mediapipe/drawing_utils';
// Preload filter assets to avoid per-frame image loading delays
const ASSET_FILES = {
  mask: 'assets/mask.png',
  nose: 'assets/nose.png',
  ears: 'assets/ears.png',
  flowers: 'assets/flowers.png',
  mustache: 'assets/mustache.png'
};
const ASSET_IMAGES = {};
for (const k of Object.keys(ASSET_FILES)) {
  const img = new Image();
  img.src = ASSET_FILES[k];
  ASSET_IMAGES[k] = img;
}

const DrawingUtils = {

  draw: function (canvasCtx, results, filterName) {

    canvasCtx.save(); //save the context of 2d plane before transforming it to draw
    let canvas = canvasCtx.canvas;
    canvasCtx.translate(canvas.width, 0); //mirror the canvas to match mirrored video
    canvasCtx.scale(-1, 1);

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    const vid = document.querySelector("#video");
    canvasCtx.drawImage(vid, 0, 0);

    if (results) {
      const landmarksArray = results.multiFaceLandmarks || [];
      const annotationsArray = results.multiFaceAnnotations || [];
      // iterate over each face
      for (let i = 0; i < landmarksArray.length; i++) {
        const landmarks = landmarksArray[i];
        const annotations = annotationsArray[i] || null;
        if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) {
          if (!annotations) {
            console.warn('DrawingUtils: received empty or invalid landmarks and no annotations for face index:', i);
            continue;
          }
          // When landmarks missing, try to build a landmarks array from annotations (coarse)
          const built = [];
          // try common annotation keys
          const keys = ['silhouette', 'lips', 'leftEye', 'rightEye', 'leftEyebrow', 'rightEyebrow', 'midwayBetweenEyes'];
          for (const k of keys) {
            if (annotations[k] && Array.isArray(annotations[k])) {
              for (const p of annotations[k]) built.push(p);
            }
          }
          if (built.length === 0) {
            console.warn('DrawingUtils: annotations present but could not construct landmarks for face', i);
            continue;
          }
          // Draw using coarse annotations (safer than passing a flattened landmarks array)
          try {
            this.drawFromAnnotations(canvasCtx, annotations, filterName);
          } catch (e) {
            console.error('DrawingUtils: error drawing from annotations for filter', filterName, e);
          }
          continue;
        }
        // call the specific drawing function with the landmarks per face
        const fn = this[filterName] || this.none;
        try {
          fn.call(this, canvasCtx, landmarks, filterName);
        } catch (e) {
          console.error('DrawingUtils: error in filter', filterName, e);
        }
      }
    }

    canvasCtx.restore(); //revert back to the last saved context on the stack
  },

  getVars: function (canvasCtx, landmarks) {
    let canvas = canvasCtx.canvas;
    // fallback if landmarks[1] is missing
    const ref = (landmarks && landmarks[1]) ? landmarks[1] : (landmarks && landmarks[0]) || { x: 0.5, y: 0.5, z: 0 };
    let xpos = ref.x * canvas.width;
    let ypos = ref.y * canvas.height;
    return { canvas, xpos, ypos };
  },

  nose: function (canvasCtx, landmarks) {
    let { canvas, xpos, ypos } = this.getVars(canvasCtx, landmarks);
    const img = ASSET_IMAGES.nose || new Image();
    const dim = 120;
    canvasCtx.drawImage(img, xpos - dim / 2, ypos - dim / 2, dim, dim);
  },

  mask: function (canvasCtx, landmarks) {
    let mutations = this.calculateSkew(landmarks);
    let { canvas, xpos, ypos, img } = this.getVars(canvasCtx, landmarks);
    const imgEl = ASSET_IMAGES.mask || new Image();
    const dim = canvas.width * Math.max(0.15, mutations.scale) * 2.2;
    // console.log(mutations.scale)
    canvasCtx.save();
    canvasCtx.translate(xpos, ypos);
    canvasCtx.rotate(mutations.roll * .9);
    canvasCtx.drawImage(imgEl, -(dim / 2), -(dim / 2) + 17, dim, dim);
    canvasCtx.restore();
  },

  ears: function (canvasCtx, landmarks) {
    let mutations = this.calculateSkew(landmarks);
    let { canvas, xpos, ypos } = this.getVars(canvasCtx, landmarks);
    const imgEl = ASSET_IMAGES.ears || new Image();
    const dim = canvas.width * Math.max(0.08, mutations.scale) * 1.4;
    // console.log(mutations.scale)
    canvasCtx.save();
    canvasCtx.translate(xpos, ypos);
    canvasCtx.rotate(mutations.roll * .9);
    canvasCtx.drawImage(imgEl, -(dim / 2), -(dim / 2) - 50, dim, (dim / 2.55));
    canvasCtx.restore();
  },

  flowers: function (canvasCtx, landmarks) {
    let mutations = this.calculateSkew(landmarks);
    let { canvas, xpos, ypos } = this.getVars(canvasCtx, landmarks);
    const imgEl = ASSET_IMAGES.flowers || new Image();
    const dim = canvas.width * Math.max(0.08, mutations.scale) * 1.7;
    // console.log(mutations.scale)
    canvasCtx.save();
    canvasCtx.translate(xpos, ypos);
    canvasCtx.rotate(mutations.roll * .9);
    canvasCtx.drawImage(imgEl, -(dim / 2), -(dim / 2) - 60, dim, (dim / 1.81));
    canvasCtx.restore();
  },

  mustache: function (canvasCtx, landmarks) {
    let mutations = this.calculateSkew(landmarks);
    let { canvas, xpos, ypos } = this.getVars(canvasCtx, landmarks);
    const imgEl = ASSET_IMAGES.mustache || new Image();
    const dim = canvas.width * Math.max(0.06, mutations.scale) * 1.2;
    // console.log(mutations.scale)
    canvasCtx.save();
    canvasCtx.translate(xpos, ypos);
    canvasCtx.rotate(mutations.roll * .9);
    canvasCtx.drawImage(imgEl, -(dim / 2), -(dim / 2) + 15, dim, (dim));
    canvasCtx.restore();
  },


  tessalate: function (canvasCtx, landmarks) {
    drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION,
      { color: '#C0C0C070', lineWidth: 1 });
    drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: 'yellow' });
    drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYEBROW, { color: '#FF3030' });
    drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: 'blue' });
    drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYEBROW, { color: '#30FF30' });
    drawConnectors(canvasCtx, landmarks, FACEMESH_LIPS, { color: 'red' });

  },

  none: function () {
    //empty callback for FM onResults 
  },

  calculateSkew: function (landmarks) {

    //use 0 for middle, 359 for top right, and 130 for top left.
    const leftEyeCorner = landmarks[130];
    const rightEyeCorner = landmarks[359];
    const upperLip = landmarks[164];

    //midpoint between eye landmarks
    const eyeMidPoint = {
      x: (rightEyeCorner.x + leftEyeCorner.x) / 2,
      y: (rightEyeCorner.y + leftEyeCorner.y) / 2,
      z: (rightEyeCorner.z + leftEyeCorner.z) / 2
    };

    //calculate angle in radians between eye connector and x-axis
    const roll = Math.atan2(
      (rightEyeCorner.y - leftEyeCorner.y),
      (rightEyeCorner.x - leftEyeCorner.x)
    );

    //get frame of reference to display slopes
    const originPoint = {
      x: upperLip.x,
      y: eyeMidPoint.y,
      z: upperLip.z
    };
    //calculate angle between face slope and y-axis
    const pitch = Math.atan2(
      (eyeMidPoint.z - upperLip.z),
      (eyeMidPoint.y - upperLip.y)
    );

    //calculate angle between (eyeMid -> upperlip) and z-axis
    const yaw = Math.atan2(
      (eyeMidPoint.z - upperLip.z),
      (eyeMidPoint.x - upperLip.x)
    );

    const scale = this.distance(rightEyeCorner, leftEyeCorner);

    //draw lines beteen key points.
    /*   drawConnectors(canvasCtx,
        {0: leftEyeCorner, 1: rightEyeCorner, 2: upperLip, 3: eyeMidPoint, 4: originPoint},
        [[0,1],[2,3],[2,4]],
        {color: 'red', lineWidth: 1}) */

    return { roll: roll, scale: scale }
  },

  distance: function (pos1, pos2) {
    // get ratio of video element since x and y coordinates are given assuming square element
    let aspectRatio = VIDEO_WIDTH / VIDEO_HEIGHT;

    return Math.sqrt(
      (pos1.x - pos2.x) ** 2 * aspectRatio +
      (pos1.y - pos2.y) ** 2 / aspectRatio +
      (pos1.z - pos2.z) ** 2
    );
  },


  // Draw a filter using coarse annotations map (normalized points arrays)
  drawFromAnnotations(canvasCtx, annotations, filterName) {
    // helper to average an annotation array
    const avgPoint = (arr) => {
      if (!arr || !arr.length) return null;
      let sx = 0, sy = 0, sz = 0;
      for (const p of arr) { sx += p.x; sy += p.y; sz += (p.z || 0); }
      return { x: sx / arr.length, y: sy / arr.length, z: sz / arr.length };
    };

    const leftEye = avgPoint(annotations.leftEye || annotations.left_eye || annotations.left_eye_upper || []);
    const rightEye = avgPoint(annotations.rightEye || annotations.right_eye || annotations.right_eye_upper || []);
    const nose = avgPoint(annotations.noseTip || annotations.nose_tip || annotations.midwayBetweenEyes || []);
    const lips = annotations.lips || null;

    // Fallbacks
    const canvas = canvasCtx.canvas;
    if (!leftEye || !rightEye) {
      console.warn('drawFromAnnotations: insufficient annotation points for filter', filterName);
      return;
    }

    const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2, z: (leftEye.z + rightEye.z) / 2 };
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    const dx = (rightEye.x - leftEye.x) * canvas.width;
    const dy = (rightEye.y - leftEye.y) * canvas.height;
    const scale = Math.sqrt(dx * dx + dy * dy) / canvas.width;

    // choose image based on filterName
    const imgKey = filterName === 'mask' ? 'mask' : (filterName === 'nose' ? 'nose' : (filterName === 'ears' ? 'ears' : (filterName === 'flowers' ? 'flowers' : (filterName === 'mustache' ? 'mustache' : null))));
    const img = imgKey ? (ASSET_IMAGES[imgKey] || new Image()) : null;

    // compute pixel position
    const xpos = eyeMid.x * canvas.width;
    const ypos = (nose ? nose.y : eyeMid.y) * canvas.height;

    // Basic drawing similar to mask
    try {
      const ctx = canvasCtx;
      ctx.save();
      ctx.translate(xpos, ypos);
      ctx.rotate(roll * 0.9);
      const dim = canvas.width * Math.max(0.12, scale) * (imgKey === 'mask' ? 2.2 : 1.2);
      if (img) ctx.drawImage(img, -(dim / 2), -(dim / 2) + (imgKey === 'mask' ? 17 : 0), dim, dim);
      ctx.restore();
    } catch (e) {
      console.warn('drawFromAnnotations draw error', e);
    }
  }

}
export default DrawingUtils;