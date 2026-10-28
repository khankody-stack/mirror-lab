export const clamp = value => Math.max(0, Math.min(1, value));
export const CATEGORIES = ['mouth', 'teeth', 'motion', 'eyes'];

// Integrate scores over wall time, not frame count, so faster cameras earn no advantage.
export class ScareRound {
    constructor() { this.reset(); }
    reset() {
        this.phase = 'idle';
        this.points = Object.fromEntries(CATEGORIES.map(key => [key, 0]));
        this.metrics = null;
        this.sampleTime = -Infinity;
    }
    start(now) {
        this.reset();
        this.phase = 'countdown';
        this.begins = now + 3000;
        this.ends = this.begins + 8000;
        this.lastTick = this.begins;
    }
    observe(metrics, now) { this.metrics = metrics; this.sampleTime = now; }
    tick(now) {
        if (this.phase === 'countdown' && now >= this.begins) this.phase = 'playing';
        if (this.phase !== 'playing') return;
        const end = Math.min(now, this.ends);
        // Never award points during missing frames, hidden tabs, or lost tracking.
        const from = Math.max(this.lastTick, this.sampleTime, this.begins);
        const to = Math.min(end, this.sampleTime + 200);
        if (this.metrics && to > from) {
            for (const key of CATEGORIES) this.points[key] += clamp(this.metrics[key] || 0) * (to - from) / 8000 * 250;
        }
        this.lastTick = end;
        if (now >= this.ends) this.phase = 'finished';
    }
    get scores() { return Object.fromEntries(CATEGORIES.map(key => [key, Math.round(this.points[key])])); }
    get total() { return Object.values(this.scores).reduce((sum, value) => sum + value, 0); }
}

// White/cream pixels inside the actual inner-lip contour are an approximate teeth cue.
// Read the raw video, never the filtered overlay.
export function teethVisibility(video, face, sampleCanvas) {
    const indices = [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
    const mouth = indices.map(i => face[i]);
    const left = Math.min(...mouth.map(p => p.x)) * video.videoWidth;
    const top = Math.min(...mouth.map(p => p.y)) * video.videoHeight;
    const width = (Math.max(...mouth.map(p => p.x)) * video.videoWidth) - left;
    const height = (Math.max(...mouth.map(p => p.y)) * video.videoHeight) - top;
    if (width < 4 || height < 3) return 0;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 48, 32);
    ctx.save();
    ctx.beginPath();
    mouth.forEach((p, i) => {
        const x = (p.x * video.videoWidth - left) / width * 48;
        const y = (p.y * video.videoHeight - top) / height * 32;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.clip();
    ctx.drawImage(video, left, top, width, height, 0, 0, 48, 32);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, 48, 32).data;
    let inside = 0, bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 200) continue;
        inside++;
        const [r,g,b] = [pixels[i], pixels[i+1], pixels[i+2]];
        if (Math.min(r,g,b) > 110 && (r+g+b)/3 > 145 && Math.max(r,g,b)-Math.min(r,g,b) < 75 && r < g * 1.35) bright++;
    }
    return inside ? clamp(bright / inside / 0.35) : 0;
}

export function facePose(face, width, height) {
    const left = face[33], right = face[263], nose = face[1];
    const dx = (right.x-left.x)*width, dy = (right.y-left.y)*height;
    const size = Math.max(1, Math.hypot(dx,dy));
    return { x: nose.x*width, y: nose.y*height, size,
        roll: Math.atan2(dy,dx),
        yaw: ((nose.x-(left.x+right.x)/2)*width*dx + (nose.y-(left.y+right.y)/2)*height*dy)/(size*size) };
}

export function movementScore(previous, current, dt) {
    if (!previous || dt <= 0 || dt > 0.2) return 0;
    const translation = Math.hypot(current.x-previous.x, current.y-previous.y) / current.size;
    const angle = Math.abs(Math.atan2(Math.sin(current.roll-previous.roll), Math.cos(current.roll-previous.roll)));
    const turn = Math.abs(current.yaw-previous.yaw);
    return clamp(((translation + angle*0.6 + turn*0.7)/dt - 0.12) / 2.5);
}
