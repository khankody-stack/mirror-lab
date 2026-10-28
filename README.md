# mirror-lab
spooky face game

Run locally with `python3 -m http.server 8000`, then open
`http://localhost:8000`. Click Preview Camera after MediaPipe is ready and allow
camera access. Deployed sites must use HTTPS for webcam access.

MediaPipe's browser module and WASM files are pinned together to `0.10.21`.
Version `0.10.22` was never published and returns HTTP 404 from jsDelivr.
The module, WASM runtime, and face model require an internet connection.
If loading fails, the page displays the error; check failed requests in the
browser's Network panel and reload after resolving the connection issue.

The mouth meter smooths the gap between three pairs of inner-lip landmarks,
normalized to mouth width, and shows tenths of a percent. For a personal range,
hold your mouth closed briefly and click
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

- Mouth: calibrated lip opening, using the same smoothed signal as the live mouth meter.
- Teeth: approximate connected bright bands contrasted against the mouth cavity,
  sampled from the raw video in a mouth-aligned crop. Uniform bright regions,
  red lips, low contrast, and isolated highlights are rejected.
- Head movement: angular speed from MediaPipe's facial transformation matrix over
  a short time window. A landmark-based fallback is available. Small jitter,
  tracking jumps, and reacquisition do not earn movement points.
- Eyes: three eyelid gaps per eye normalized to eye width, with blink suppression.
  In Settings, set relaxed eyes to 0%, then wide eyes to 100%, for your own range.

The four bars show live intensity even in preview; adjacent point totals show
the points accumulated during a round. Expression smoothing uses elapsed time
so the response is consistent across frame rates. Small or partially visible
faces are excluded. Both mouth and eye calibration reject unstable captures
and remain fixed during a round. Calibration lasts until reload.

Scores accumulate over time, not frame count. Missing or stale tracking earns no
points. Hiding the tab cancels an active round; Stop Camera cancels an unfinished
round and releases devices. Teeth estimates depend on lighting and are not a
trained teeth classifier. Move comfortably; vigorous movement is not necessary.
Microphone loudness remains a separate optional meter.

Frame capture timestamps include synchronous inference time in the scoring
interval, so a slow CPU does not discard most of the round. Head movement also
supports frame gaps up to 500 ms. Signals expire after 500 ms without a new
frame, and tracking loss clears them immediately. Results report the percentage
of the round with usable tracking. Mouth and head together can earn 500 points;
teeth and eyes contribute the remaining 500.

Vampire, Possessed, and Jack-o'-lantern canvas filters follow the face; they do
not modify the raw video used for scoring. No camera frames are uploaded.
Eye effects are clipped to tracked eyelid contours, and vampire irises follow
the tracked iris centers. Fangs are shaded and clipped inside the opening mouth.
Possessed makeup adds cloudy eyes and branching cheek veins. Pumpkin makeup
uses the face outline, translucent shading, curved ribs, and carved mouth details.
Textures are deterministic so they do not flicker between frames. All artwork
is drawn locally without additional image downloads.
The HTML declares UTF-8 to prevent garbled Halloween symbols.

Run checks with Node 22+: `node --test tests/*.test.mjs`.

The desktop layout prioritizes the camera, with filter cards along the bottom
left and scare meters on the right. Settings in the top right contains mouth
and eye calibration, microphone controls, and instructions; press Escape to close it.
On phones the meters stack below the camera and filter strip. Video and overlay
use matching aspect-preserving sizing so filters stay aligned when resized.
