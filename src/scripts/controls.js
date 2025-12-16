import VideoTools from './video_tools';
import CameraEffects from './camera_effects';

const Controls = {
  toggleVideo: function () {
    // Toggle webcam button removed for extension mode; keep function as a no-op.
    return;
  },

  timer: async function (time) {
    return new Promise(resolve => setTimeout(resolve, time));
  },

  bindOnCanPlay: function () {
    const videoElement = document.querySelector("#video");
    const canvasElement = document.querySelector("#game-canvas")
    // const canvasCtx = canvasElement.getContext('2d');

    videoElement.oncanplay = function () {
      // set opacity of visible elements to 0 to fade them in.
      videoElement.style.opacity = 0;
      canvasElement.style.opacity = 0;
      CameraEffects.fadeIn(videoElement); //video is playing in the background behind the canvas.
      CameraEffects.fadeIn(canvasElement)
    };
  },

  bindClearInstructions: function () {
    const doneButton = document.querySelector(".clear-instructions");
    const blur = document.querySelector(".blur");
    const instructions = document.querySelector(".instructions");

    doneButton.addEventListener('click', (e) => {
      instructions.style.display = "none";
      instructions.style.visbility = "hidden";
      blur.classList.remove("blur");

      //remove blur and unclickable attributes from content
      //make the instructions be hidden.
    });
  },

  toggleButtons: function () {
    //loop through all OTHER buttons, toggle them
    const offable = document.querySelectorAll('.off-able');
    offable.forEach(button => {
      button.toggleAttribute("disabled");
    });
  },

  bindTakePicture: function () {
    const captureButton = document.querySelector('.capture');
    captureButton.addEventListener('click', (e) => {
      VideoTools.captureImage();
    });
  },

  bindFilterSelect: function (faceMesh) {
    const filterOptions = document.querySelectorAll('.filter-select');
    filterOptions.forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        let filterOption = e.target;
        let filterName = filterOption.getAttribute("value");
        faceMesh.changeFilter(filterName);
      });
      opt.addEventListener('keypress', (e) => {
        let filterOption = e.target;
        let filterName = filterOption.getAttribute("value");
        faceMesh.changeFilter(filterName);
      });
    });
  }

}

export default Controls;