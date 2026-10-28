
import { ScareRound, CATEGORIES, clamp, teethVisibility, facePose, movementScore } from './scare-game.mjs';
import { drawFilter } from './spooky-filters.mjs';

// Keep the browser module and WASM files on the same published release.
const MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const startButton = document.getElementById("startBtn");
const previewButton = document.getElementById('previewBtn');
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
const mouthClosedButton = document.getElementById("mouthClosedBtn");
const mouthOpenButton = document.getElementById("mouthOpenBtn");
let mouthClosed = 0;
let mouthOpen = 1;
let mouthSamples = [];
let mouthSmoothed = null;
let mouthLastTime = null;
const round = new ScareRound();
const gameButton = document.getElementById('gameStart');
const roundOverlay = document.getElementById('roundOverlay');
const gameStatus = document.getElementById('gameStatus');
const filterSelect = document.getElementById('faceFilter');
const teethCanvas = document.createElement('canvas');
teethCanvas.width = 48;
teethCanvas.height = 32;
let previousPose = null;
let previousPoseTime = null;
let motionLevel = 0;
let teethLevel = 0;
let lastTeethTime = -Infinity;

function startGame() {
    if (!running || ['countdown', 'playing'].includes(round.phase)) return;
    round.start(performance.now());
    previousPose = null;
    motionLevel = 0;
    renderGame(performance.now());
}

function renderGame(now) {
    const busy = ['countdown', 'playing'].includes(round.phase);
    gameButton.disabled = !running || busy;
    startButton.disabled = !faceLandmarker || busy;
    previewButton.disabled = !faceLandmarker || busy;
    gameButton.textContent = round.phase === 'finished' ? 'Play Again' : 'Start Scare Round';
    mouthClosedButton.disabled ||= busy;
    mouthOpenButton.disabled ||= busy;
    roundOverlay.hidden = round.phase !== 'countdown';
    if (round.phase === 'countdown') {
        roundOverlay.textContent = Math.max(1, Math.ceil((round.begins - now)/1000));
        gameStatus.textContent = 'Get ready! Look at the mirror.';
    } else if (round.phase === 'playing') {
        const seconds = Math.max(0, Math.ceil((round.ends - now)/1000));
        gameStatus.textContent = `${seconds}s left - ${round.metrics ? 'give us your scariest face!' : 'come back into view to score!'}`;
    } else if (round.phase === 'finished') {
        const title = round.total >= 750 ? 'Nightmare legend!' : round.total >= 450 ? 'Certified haunter!' : 'A little spooky - try again!';
        gameStatus.textContent = `Round complete. ${title}`;
    }
    const scores = round.scores;
    for (const key of CATEGORIES) {
        const name = key[0].toUpperCase() + key.slice(1);
        document.getElementById(`game${name}`).value = scores[key];
        document.getElementById(`score${name}`).textContent = `${scores[key]} / 250`;
    }
    document.getElementById('totalScore').textContent = round.total;
}

function updateGameTracking(results, now) {
    const face = results.faceLandmarks[0];
    if (!face) {
        previousPose = null;
        previousPoseTime = null;
        motionLevel = 0;
        teethLevel = 0;
        round.observe(null, now);
        return;
    }
    const categories = results.faceBlendshapes?.[0]?.categories ?? [];
    const score = name => categories.find(c => c.categoryName === name)?.score ?? 0;
    const pose = facePose(face, canvas.width, canvas.height);
    const dt = previousPoseTime === null ? 0 : (now - previousPoseTime)/1000;
    const movement = movementScore(previousPose, pose, dt);
    motionLevel += (movement-motionLevel) * (dt > 0 ? 1-Math.exp(-dt/0.12) : 1);
    previousPose = pose;
    previousPoseTime = now;
    if (now-lastTeethTime >= 100) {
        teethLevel = teethVisibility(video, face, teethCanvas);
        lastTeethTime = now;
    }
    const eyeRatio = (top, bottom, left, right) => {
        const distance = (a,b) => Math.hypot((face[a].x-face[b].x)*canvas.width, (face[a].y-face[b].y)*canvas.height);
        return distance(top,bottom)/Math.max(1,distance(left,right));
    };
    const eyeOpening = (eyeRatio(159,145,33,133)+eyeRatio(386,374,362,263))/2;
    round.observe({
        mouth: clamp((score('jawOpen')-mouthClosed)/(mouthOpen-mouthClosed)),
        teeth: teethLevel,
        motion: motionLevel,
        eyes: clamp((eyeOpening-0.12)/0.22)
    }, now);
    drawFilter(ctx, face, filterSelect.value, canvas.width, canvas.height);
}

function resetMouthTracking() {
    mouthSamples = [];
    mouthSmoothed = null;
    mouthLastTime = null;
    mouthClosedButton.disabled = true;
    mouthOpenButton.disabled = true;
    setMeter("mouth", 0);
}

function updateMouthMeter(score, now) {
    if (!Number.isFinite(score)) {
        resetMouthTracking();
        document.getElementById("mouthStatus").textContent = "No face detected";
        return;
    }
    mouthSamples.push({ score, time: now });
    mouthSamples = mouthSamples.filter(sample => now - sample.time <= 350);
    const ready = mouthSamples.length >= 3 && now - mouthSamples[0].time >= 200;
    mouthClosedButton.disabled = !ready;
    mouthOpenButton.disabled = !ready;
    // Time-based smoothing reduces jitter without depending on camera frame rate.
    const alpha = mouthLastTime === null ? 1 : 1 - Math.exp(-(now - mouthLastTime) / 70);
    mouthSmoothed = mouthSmoothed === null ? score : mouthSmoothed + alpha * (score - mouthSmoothed);
    mouthLastTime = now;
    setMeter("mouth", 100 * (mouthSmoothed - mouthClosed) / (mouthOpen - mouthClosed));
    document.getElementById("mouthStatus").textContent = "Tracking mouth opening";
}

function calibrateMouth(endpoint) {
    if (['countdown', 'playing'].includes(round.phase)) return;
    if (!running || mouthSamples.length < 3 || performance.now() - mouthSamples.at(-1).time > 250) return;
    const average = mouthSamples.reduce((sum, sample) => sum + sample.score, 0) / mouthSamples.length;
    const closed = endpoint === "closed" ? average : mouthClosed;
    const open = endpoint === "open" ? average : mouthOpen;
    if (open - closed < 0.1) {
        document.getElementById("mouthCalibration").textContent = "Keep your mouth closed for 0%, or open wider for 100%, then try again.";
        return;
    }
    mouthClosed = closed;
    mouthOpen = open;
    mouthSmoothed = average;
    setMeter("mouth", 100 * (average - closed) / (open - closed));
    document.getElementById("mouthCalibration").textContent = endpoint === "closed"
        ? "Closed mouth saved. Now hold your mouth wide open briefly and set 100%."
        : "Wide open saved. You can recalibrate either endpoint anytime.";
}

function setMeter(name, value) {
    const clamped = Math.max(0, Math.min(100, value));
    const percent = name === "mouth" ? clamped.toFixed(1) : Math.round(clamped);
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
        previewButton.disabled = false;
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
        previewButton.disabled = true;
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
        gameButton.disabled = false;
        lastVideoTime = -1;
        status.textContent = "Face tracking running";
        gameStatus.textContent = 'Choose your filter, calibrate if needed, then start a scare round.';

        detectFace();
    } catch (error) {
        if (request !== cameraRequest) return;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        status.textContent = "Camera error";
        console.error(error);
    } finally {
        if (request === cameraRequest) {
            startButton.disabled = false;
            previewButton.disabled = false;
        }
    }
}

// Detect and draw face landmarks
function detectFace() {
    if (!running) return;
    const now = performance.now();
    round.tick(now);

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const results = faceLandmarker.detectForVideo(
            video,
            performance.now()
        );

        const jawOpen = results.faceLandmarks.length
            ? results.faceBlendshapes?.[0]?.categories.find(category => category.categoryName === "jawOpen")?.score
            : undefined;
        updateMouthMeter(jawOpen, performance.now());

        updateGameTracking(results, performance.now());
    }

    renderGame(performance.now());
    animationFrame = requestAnimationFrame(detectFace);
}

// Stop webcam
function stopCamera() {
    if (round.phase !== 'finished') round.reset();
    previousPose = null;
    previousPoseTime = null;
    cameraRequest++;
    startButton.disabled = !faceLandmarker;
    running = false;
    cancelAnimationFrame(animationFrame);
    stopMicrophone();
    resetMouthTracking();
    document.getElementById("mouthStatus").textContent = "Camera stopped";

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    status.textContent = "Camera stopped";
    renderGame(performance.now());
    gameStatus.textContent = 'Camera stopped. Start the game when you are ready.';
}

document.getElementById("startBtn")
    .addEventListener("click", async () => { await startCamera(); startGame(); });
gameButton.addEventListener('click', startGame);
previewButton.addEventListener('click', startCamera);

document.getElementById("stopBtn")
    .addEventListener("click", stopCamera);

loadMediaPipe();
micButton.addEventListener("click", toggleMicrophone);
mouthClosedButton.addEventListener("click", () => calibrateMouth("closed"));
mouthOpenButton.addEventListener("click", () => calibrateMouth("open"));
window.addEventListener("pagehide", stopCamera);
document.addEventListener('visibilitychange', () => {
    if (document.hidden && ['countdown', 'playing'].includes(round.phase)) {
        round.reset();
        gameStatus.textContent = 'Round cancelled while the tab was hidden. Start a new round to play.';
        renderGame(performance.now());
    }
});
