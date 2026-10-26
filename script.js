
const video = document.getElementById("webcam");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

let stream = null;

async function startCamera() {
    try {
        if (stream) return;

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        console.log("Camera started");
    } catch (error) {
        console.error("Camera error:", error);
        alert("Could not start camera: " + error.message);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    console.log("Camera stopped");
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
