export const clamp = value => Math.max(0, Math.min(1, value));
export const CATEGORIES = ['mouth', 'teeth', 'motion', 'eyes'];
import { TRACKING_TIMEOUT_MS } from './face-signals.mjs';

// Integrate scores over wall time, not frame count, so faster cameras earn no advantage.
export class ScareRound {
    constructor() { this.reset(); }
    reset() {
        this.phase = 'idle';
        this.points = Object.fromEntries(CATEGORIES.map(key => [key, 0]));
        this.metrics = null;
        this.sampleTime = -Infinity;
        this.trackedMs = 0;
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
        const to = Math.min(end, this.sampleTime + TRACKING_TIMEOUT_MS);
        if (this.metrics && to > from) {
            this.trackedMs += to-from;
            for (const key of CATEGORIES) this.points[key] += clamp(this.metrics[key] || 0) * (to - from) / 8000 * 250;
        }
        this.lastTick = end;
        if (now >= this.ends) this.phase = 'finished';
    }
    get scores() { return Object.fromEntries(CATEGORIES.map(key => [key, Math.round(this.points[key])])); }
    get total() { return Object.values(this.scores).reduce((sum, value) => sum + value, 0); }
    get trackingCoverage() { return Math.min(100, Math.round(this.trackedMs/8000*100)); }
}

export { TRACKING_TIMEOUT_MS, teethVisibility, teethFromPixels, facePose, movementScore, mouthOpenness, eyeOpenness, trackingIssue, normalizeExpression, rotationFromMatrix, HeadMotionTracker, SignalSmoother } from './face-signals.mjs';
