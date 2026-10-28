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

The mouth meter smooths MediaPipe's jaw-open expression score and shows tenths
of a percent. For a personal range, hold your mouth closed briefly and click
Set closed mouth, then hold it wide open and click Set wide open. Calibration
averages recent readings and lasts until reload; percentages describe your
calibrated expression range, not a physical distance. Enable Microphone
for the scream meter, which measures relative loudness (not calibrated decibels
or scream recognition). Adjust Sensitivity for your microphone. Audio is
processed locally without recording or speaker playback. Stop Camera releases
both the camera and microphone; microphone access can also be disabled separately.

## Scare game

Start Game opens the camera, counts down 3 seconds, and runs an 8-second round.
Preview Camera lets you choose a filter and calibrate before playing. Play Again
starts a fresh round. Each category contributes up to 250 points (1000 total):

- Mouth: calibrated jaw opening.
- Teeth: approximate bright, neutral pixels within the inner-lip outline in raw video.
- Head movement: face-size-normalized movement, roll, and turning speed, with small jitter ignored.
- Eyes: eyelid opening relative to eye width.

Scores accumulate over time, not frame count. Missing or stale tracking earns no
points. Hiding the tab cancels an active round; Stop Camera cancels an unfinished
round and releases devices. Teeth estimates depend on lighting and are not a
trained teeth classifier. Move comfortably; vigorous movement is not necessary.
Microphone loudness remains a separate optional meter.

Vampire, Possessed, and Jack-o'-lantern canvas filters follow the face; they do
not modify the raw video used for scoring. No camera frames are uploaded.
The HTML declares UTF-8 to prevent garbled Halloween symbols.

Run checks with Node 22+: `node --test tests/*.test.mjs`.
