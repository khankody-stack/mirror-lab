
// Keep the browser module and WASM files on the same published release.
const MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const startButton = document.getElementById("startBtn");
startButton.disabled = true;

let stream = null;
let faceLandmarker = null;
let running = false;

// Load MediaPipe
async function loadMediaPipe() {
    try {
        status.textContent = "Loading MediaPipe...";

        const { FaceLandmarker, FilesetResolver } = await import(
            `${MEDIAPIPE_BASE}/vision_bundle.mjs`
        );

        const vision = await FilesetResolver.forVisionTasks(
            `${MEDIAPIPE_BASE}/wasm`
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

        status.textContent = "MediaPipe ready";
        startButton.disabled = false;
    } catch (error) {
        status.textContent = `MediaPipe failed to load: ${error.message}. Check your connection and reload.`;
        console.error(error);
    }
}

// Start webcam
async function startCamera() {
    if (running) return;

    if (!faceLandmarker) {
        status.textContent = "MediaPipe is not ready";
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        running = true;
        status.textContent = "Face tracking running";

        detectFace();
    } catch (error) {
        status.textContent = "Camera error";
        console.error(error);
    }
}

// Detect and draw face landmarks
function detectFace() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (video.readyState >= 2) {
        const results = faceLandmarker.detectForVideo(
            video,
            performance.now()
        );

        for (const face of results.faceLandmarks) {
            for (const point of face) {
                const x = point.x * canvas.width;
                const y = point.y * canvas.height;

                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = "lime";
                ctx.fill();
            }
        }
    }

    requestAnimationFrame(detectFace);
}

// Stop webcam
function stopCamera() {
    running = false;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    status.textContent = "Camera stopped";
}

document.getElementById("startBtn")
    .addEventListener("click", startCamera);

document.getElementById("stopBtn")
    .addEventListener("click", stopCamera);

loadMediaPipe();
