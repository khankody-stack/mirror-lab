
let stream = null;

async function startCamera() {
    try {
        if (stream) {
            stopCamera();
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        document.getElementById("webcam").srcObject = stream;
        document.getElementById("status").innerText = "Camera is on";
    } catch (error) {
        document.getElementById("status").innerText =
            "Camera access failed: " + error.message;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    document.getElementById("webcam").srcObject = null;
    document.getElementById("status").innerText = "Camera is off";
}
