
const video = document.getElementById("webcam");
const statusText = document.getElementById("status");

let stream = null;

async function startCamera() {
    statusText.innerText = "Starting camera...";

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        statusText.innerText = "Camera is working!";
    } catch (error) {
        statusText.innerText = "Error: " + error.message;
        console.error(error);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    statusText.innerText = "Camera is off";
}

window.startCamera = startCamera;
window.stopCamera = stopCamera;
