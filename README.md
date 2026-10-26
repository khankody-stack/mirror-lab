# mirror-lab
spooky face game

Run locally with `python3 -m http.server 8000`, then open
`http://localhost:8000`. Click Start Camera after MediaPipe is ready and allow
camera access. Deployed sites must use HTTPS for webcam access.

MediaPipe's browser module and WASM files are pinned together to `0.10.21`.
Version `0.10.22` was never published and returns HTTP 404 from jsDelivr.
The module, WASM runtime, and face model require an internet connection.
If loading fails, the page displays the error; check failed requests in the
browser's Network panel and reload after resolving the connection issue.

The mouth meter uses MediaPipe's jaw-open expression score. Enable Microphone
for the scream meter, which measures relative loudness (not calibrated decibels
or scream recognition). Adjust Sensitivity for your microphone. Audio is
processed locally without recording or speaker playback. Stop Camera releases
both the camera and microphone; microphone access can also be disabled separately.
