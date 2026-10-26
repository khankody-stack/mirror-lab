
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");

let stream = null;
let faceLandmarker = null;
let running = false;
let loading = false;

// Start the webcam
async function startCamera() {
    if (running) return;

    try {
        statusText.innerText = "Starting camera...";

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        running = true;
        statusText.innerText = "Camera working!";

        // Start the drawing loop
        detectFace();

        // Load MediaPipe separately
        if (!faceLandmarker && !loading) {
            loadMediaPipe();
        }

    } catch (error) {
        console.error(error);
        statusText.innerText = "Camera error: " + error.message;
    }
}

// Load MediaPipe

async function loadMediaPipe() {
    loading = true;
    statusText.innerText = "Loading MediaPipe...";

    try {
        const module = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs"
        );

        const mediapipe = module.default || module;

        const vision = await mediapipe.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );

        faceLandmarker = await mediapipe.FaceLandmarker.createFromOptions(
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

        if (running) {
            statusText.innerText = "Face tracking is running!";
        }

    } catch (error) {
        console.error("MediaPipe error:", error);

        if (running) {
            statusText.innerText =
                "MediaPipe failed: " + error.message;
        }
    }

    loading = false;
}



let lastVideoTime = -1;

function detectFace() {
    if (!running) return;

    // Match canvas size to webcam
    if (canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight) {

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceLandmarker && video.readyState >= 2) {

        // Only process new video frames
        if (video.currentTime !== lastVideoTime) {

            lastVideoTime = video.currentTime;

            const results = faceLandmarker.detectForVideo(
                video,
                performance.now()
            );

            console.log("Faces found:", results.faceLandmarks.length);

            if (results.faceLandmarks.length > 0) {

                const landmarks = results.faceLandmarks[0];

                statusText.innerText =
                    "Face detected! Landmarks: " + landmarks.length;

                // Draw green landmark dots
                for (let i = 0; i < landmarks.length; i++) {

                    let x = landmarks[i].x * canvas.width;
                    let y = landmarks[i].y * canvas.height;

                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, 2 * Math.PI);
                    ctx.fillStyle = "#00ff00";
                    ctx.fill();
                }

            } else {
                statusText.innerText = "No face detected";
            }
        }
    }

    requestAnimationFrame(detectFace);
}

// Stop the webcam
function stopCamera() {
    running = false;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    statusText.innerText = "Camera is off";
}
