
import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");

let faceLandmarker = null;
let stream = null;
let running = false;
let lastVideoTime = -1;

// Load MediaPipe
async function loadMediaPipe() {
    try {
        statusText.innerText = "Loading MediaPipe...";

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numFaces: 1
            }
        );

        statusText.innerText = "MediaPipe ready";
    } catch (error) {
        statusText.innerText = "MediaPipe error: " + error.message;
        console.error(error);
    }
}

// Start camera
window.startCamera = async function() {
    try {
        if (running) return;

        if (!faceLandmarker) {
            statusText.innerText = "MediaPipe not ready";
            return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        lastVideoTime = -1;
        running = true;

        statusText.innerText = "Face tracking running";

        trackFace();

    } catch (error) {
        statusText.innerText = "Camera error: " + error.message;
        console.error(error);
    }
};

// Stop camera
window.stopCamera = function() {
    running = false;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    statusText.innerText = "Camera stopped";
};

// Track face
function trackFace() {
    if (!running) return;

    if (video.readyState >= 2 &&
        video.currentTime !== lastVideoTime) {

        lastVideoTime = video.currentTime;

        const results = faceLandmarker.detectForVideo(
            video,
            performance.now()
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const face of results.faceLandmarks) {
            for (const point of face) {

                const x = point.x * canvas.width;
                const y = point.y * canvas.height;

                ctx.beginPath();
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
                ctx.fillStyle = "lime";
                ctx.fill();
            }
        }
    }

    requestAnimationFrame(trackFace);
}

// Load MediaPipe when page opens
loadMediaPipe();
