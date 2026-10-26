
import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");

let stream = null;
let faceLandmarker = null;
let running = false;

// Start camera first
window.startCamera = async function() {
    try {
        status.innerText = "Starting camera...";

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        running = true;
        status.innerText = "Camera started! Loading MediaPipe...";

        // Start webcam before loading MediaPipe
        detectFace();

        if (!faceLandmarker) {
            await loadMediaPipe();
        }

        status.innerText = "Face tracking is running";

    } catch (error) {
        console.error(error);
        status.innerText = "Error: " + error.message;
    }
};

// Load MediaPipe
async function loadMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            },
            runningMode: "VIDEO",
            numFaces: 1
        }
    );
}

// Detect landmarks
function detectFace() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceLandmarker && video.readyState >= 2) {

        const results = faceLandmarker.detectForVideo(
            video,
            performance.now()
        );

        if (results.faceLandmarks.length > 0) {

            const landmarks = results.faceLandmarks[0];

            for (let i = 0; i < landmarks.length; i++) {

                let x = landmarks[i].x * canvas.width;
                let y = landmarks[i].y * canvas.height;

                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
                ctx.fillStyle = "#00ff88";
                ctx.fill();
            }
        }
    }

    requestAnimationFrame(detectFace);
}

// Stop camera
window.stopCamera = function() {
    running = false;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    status.innerText = "Camera is off";
};

