
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
    statusText.innerText = "Camera working! Loading MediaPipe...";

    try {
        const mediapipe = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm"
        );

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
                "Camera working, but MediaPipe failed: " + error.message;
        }
    }

    loading = false;
}

// Draw face landmarks
function detectFace() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceLandmarker && video.readyState >= 2) {
        try {
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
        } catch (error) {
            console.error("Detection error:", error);
            faceLandmarker = null;
            statusText.innerText = "Face tracking stopped. Camera still works.";
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
