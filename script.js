
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
let animationFrame = null;
let lastVideoTime = -1;
let cameraRequest = 0;
let micStream = null;
let audioContext = null;
let analyser = null;
let audioSamples = null;
let audioFrame = null;
let micRequest = 0;
let screamLevel = 0;
const micButton = document.getElementById("micBtn");

function setMeter(name, value) {
    const percent = Math.round(Math.max(0, Math.min(100, value)));
    document.getElementById(`${name}Meter`).value = percent;
    document.getElementById(`${name}Value`).textContent = `${percent}%`;
}

async function toggleMicrophone() {
    if (micStream) {
        stopMicrophone();
        return;
    }
    const request = ++micRequest;
    micButton.disabled = true;
    document.getElementById("micStatus").textContent = "Waiting for microphone permission...";
    try {
        const captured = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        if (request !== micRequest) {
            captured.getTracks().forEach(track => track.stop());
            return;
        }
        micStream = captured;
        audioContext = new AudioContext();
        await audioContext.resume();
        if (request !== micRequest) return;
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        audioSamples = new Float32Array(analyser.fftSize);
        // No connection to the speakers: avoid microphone feedback.
        audioContext.createMediaStreamSource(micStream).connect(analyser);
        micButton.textContent = "Disable Microphone";
        updateScreamMeter();
    } catch (error) {
        if (request !== micRequest) return;
        stopMicrophone();
        document.getElementById("micStatus").textContent = `Microphone unavailable: ${error.message}. Camera tracking still works.`;
    } finally {
        if (request === micRequest) micButton.disabled = false;
    }
}

function updateScreamMeter() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(audioSamples);
    const rms = Math.sqrt(audioSamples.reduce((sum, sample) => sum + sample * sample, 0) / audioSamples.length);
    const sensitivity = Number(document.getElementById("sensitivity").value);
    const target = Math.min(100, Math.max(0, (rms - 0.005) * sensitivity * 250));
    screamLevel += (target - screamLevel) * (target > screamLevel ? 0.5 : 0.12);
    setMeter("scream", screamLevel);
    document.getElementById("micStatus").textContent = screamLevel > 75 ? "Scream level!" : screamLevel > 35 ? "Getting loud" : "Listening";
    audioFrame = requestAnimationFrame(updateScreamMeter);
}

function stopMicrophone() {
    micRequest++;
    cancelAnimationFrame(audioFrame);
    micStream?.getTracks().forEach(track => track.stop());
    micStream = null;
    if (audioContext) audioContext.close().catch(console.error);
    audioContext = null;
    analyser = null;
    audioSamples = null;
    screamLevel = 0;
    setMeter("scream", 0);
    micButton.disabled = false;
    micButton.textContent = "Enable Microphone";
    document.getElementById("micStatus").textContent = "Microphone off";
}

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
                outputFaceBlendshapes: true,
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

    const request = ++cameraRequest;
    try {
        startButton.disabled = true;
        const captured = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
        if (request !== cameraRequest) {
            captured.getTracks().forEach(track => track.stop());
            return;
        }
        stream = captured;

        video.srcObject = stream;
        await video.play();
        if (request !== cameraRequest) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        running = true;
        lastVideoTime = -1;
        status.textContent = "Face tracking running";

        detectFace();
    } catch (error) {
        if (request !== cameraRequest) return;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        status.textContent = "Camera error";
        console.error(error);
    } finally {
        if (request === cameraRequest) startButton.disabled = false;
    }
}

// Detect and draw face landmarks
function detectFace() {
    if (!running) return;

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const results = faceLandmarker.detectForVideo(
            video,
            performance.now()
        );

        const jawOpen = results.faceBlendshapes?.[0]?.categories.find(category => category.categoryName === "jawOpen")?.score ?? 0;
        setMeter("mouth", jawOpen * 100);
        document.getElementById("mouthStatus").textContent = results.faceLandmarks.length ? "Open your mouth to fill the meter." : "No face detected";

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

    animationFrame = requestAnimationFrame(detectFace);
}

// Stop webcam
function stopCamera() {
    cameraRequest++;
    startButton.disabled = !faceLandmarker;
    running = false;
    cancelAnimationFrame(animationFrame);
    stopMicrophone();
    setMeter("mouth", 0);
    document.getElementById("mouthStatus").textContent = "Camera stopped";

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
micButton.addEventListener("click", toggleMicrophone);
window.addEventListener("pagehide", stopCamera);
