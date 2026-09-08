/**
 * Tactile ASMR Sound Engine for DancingPistons.
 * Referenced and adapted from SUM10's pure Web Audio API mechanical sound architecture.
 * Synthesizes ceramic switches, domino clacks, and tactile piston impulses.
 * Zero external audio files, ultra-low latency.
 */
export class SoundEffects {
    constructor() {
        this.ctx = null;
        this.mode = (function() {
            try {
                const saved = localStorage.getItem('dancing_pistons_audio');
                if (saved === 'muted' || saved === 'off' || saved === 'crisp') return saved;
                return 'crisp';
            } catch (_) {
                return 'crisp';
            }
        })();

        this.lastSweepTime = 0;
        this.minSweepInterval = 35; // ms limit between sweep clicks for smooth domino sound
    }

    get enabled() {
        return this.mode !== 'off';
    }

    getLabel() {
        if (this.mode === 'crisp') return 'Crisp Ceramic ASMR';
        if (this.mode === 'muted') return 'Soft Felt / Muted';
        return 'Audio Off';
    }

    getIcon() {
        if (this.mode === 'crisp') return '🔊';
        if (this.mode === 'muted') return '🔉';
        return '🔇';
    }

    cycleMode() {
        if (this.mode === 'crisp') {
            this.mode = 'muted';
        } else if (this.mode === 'muted') {
            this.mode = 'off';
        } else {
            this.mode = 'crisp';
        }

        try {
            localStorage.setItem('dancing_pistons_audio', this.mode);
        } catch (_) {}

        if (this.mode !== 'off') {
            this._ensureAudio();
            this.playClick(2400, 0.25);
        }
        return this.mode;
    }

    _ensureAudio() {
        if (!this.enabled) return;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Core tactile micro-click generator from SUM10:
     * Synthesizes physical impulse transient + high-frequency friction burst.
     */
    _createClick(time, freq = 2400, duration = 0.016, volume = 0.35) {
        if (this.mode === 'off' || !this.ctx) return;

        const isMuted = this.mode === 'muted';
        const actualFreq = isMuted ? freq * 0.58 : freq;
        const actualVol = isMuted ? volume * 0.50 : volume;
        const actualDur = isMuted ? duration * 0.85 : duration;

        // 1. Physical impulse transient (mechanical click)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = isMuted ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(actualFreq, time);
        osc.frequency.exponentialRampToValueAtTime(actualFreq * 0.28, time + actualDur);
        gain.gain.setValueAtTime(actualVol, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + actualDur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + actualDur);

        // 2. Friction texture burst (micro-snap in crisp, gentle felt contact in muted)
        const bufLen = Math.max(16, Math.floor(this.ctx.sampleRate * actualDur));
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        const decayRate = isMuted ? 0.002 : 0.0035;
        for (let i = 0; i < bufLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * decayRate));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;

        const filter = this.ctx.createBiquadFilter();
        if (isMuted) {
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(850, time);
        } else {
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1400, time);
        }

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(actualVol * (isMuted ? 0.35 : 0.65), time);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + actualDur);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(time);
    }

    /**
     * General click for UI or direct activation
     */
    playClick(freq = 2400, volume = 0.25) {
        if (!this.enabled) return;
        this._ensureAudio();
        if (!this.ctx) return;
        this._createClick(this.ctx.currentTime, freq, 0.015, volume);
    }

    /**
     * Mouse sweep over pistons (like running fingers over tactile plastic keys)
     */
    playPistonSweep(elevationRatio = 0.5) {
        if (!this.enabled) return;
        const nowMs = performance.now();
        if (nowMs - this.lastSweepTime < this.minSweepInterval) return;
        this.lastSweepTime = nowMs;

        this._ensureAudio();
        if (!this.ctx) return;

        const baseFreq = 2200 + elevationRatio * 900;
        const volume = 0.15 + elevationRatio * 0.18;
        this._createClick(this.ctx.currentTime, baseFreq, 0.012, volume);
    }

    /**
     * Ripple trigger impulse (double ceramic tap when clicking to send a wave)
     */
    playRippleImpulse(power = 1.0) {
        if (!this.enabled) return;
        this._ensureAudio();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const freq1 = 2600 * power;
        const freq2 = 3100 * power;

        // Primary strike
        this._createClick(now, freq1, 0.020, 0.38);
        // Resonant echo tap
        this._createClick(now + 0.032, freq2, 0.016, 0.28);
    }
}
