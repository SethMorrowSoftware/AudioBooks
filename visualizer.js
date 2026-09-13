// visualizer.js - Audio frequency visualizer drawn on a canvas

export class Visualizer {
    constructor() {
        this.canvas = null;
        this.canvasContext = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.animationId = null;
        this.isInitialized = false;
        this.isActive = false;
        this.gradient = null;
        this.width = 0;
        this.height = 0;
        this.handleResize = () => this.resizeCanvas();
        this.handleVisibility = () => {
            if (document.hidden) this.stopLoop();
            else if (this.isActive) this.startLoop();
        };
    }

    /**
     * Route the audio element through an analyser. Safe to call once; later
     * calls are ignored. Failures leave normal playback untouched.
     */
    async initialize(audioElement) {
        if (this.isInitialized) return;

        this.canvas = document.getElementById('visualizerCanvas');
        if (!this.canvas || !audioElement) return;

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            this.canvas.parentElement?.classList.add('hidden');
            return;
        }

        try {
            this.canvasContext = this.canvas.getContext('2d');
            this.audioContext = new AudioContextCtor();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.85;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);

            const source = this.audioContext.createMediaElementSource(audioElement);
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.resizeCanvas();
            window.addEventListener('resize', this.handleResize);
            document.addEventListener('visibilitychange', this.handleVisibility);
            this.isInitialized = true;
            this.drawFrame();
        } catch (error) {
            console.warn('Visualizer unavailable:', error);
            this.destroy();
        }
    }

    resizeCanvas() {
        if (!this.canvas || !this.canvasContext) return;
        const container = this.canvas.parentElement || this.canvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = Math.max(1, container.clientWidth);
        this.height = Math.max(1, container.clientHeight || this.canvas.clientHeight || 120);
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.height);
        this.gradient.addColorStop(0, '#0ea5e9');
        this.gradient.addColorStop(0.5, '#06b6d4');
        this.gradient.addColorStop(1, '#3b82f6');
    }

    /** Browsers start AudioContexts suspended until a user gesture. */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (error) {
                console.warn('Could not resume audio context:', error);
            }
        }
    }

    /** Start or stop animating; the loop only runs while audio is playing. */
    setActive(active) {
        this.isActive = !!active;
        if (this.isActive && !document.hidden) this.startLoop();
        else this.stopLoop();
    }

    startLoop() {
        if (!this.isInitialized || this.animationId !== null) return;
        const loop = () => {
            this.animationId = requestAnimationFrame(loop);
            this.drawFrame();
        };
        this.animationId = requestAnimationFrame(loop);
    }

    stopLoop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    drawFrame() {
        if (!this.isInitialized || !this.canvasContext || !this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        const ctx = this.canvasContext;
        const { width, height } = this;

        ctx.fillStyle = 'rgba(17, 24, 39, 0.25)';
        ctx.fillRect(0, 0, width, height);

        const bars = Math.max(1, Math.floor(this.bufferLength * 0.75));
        const barWidth = Math.max(1, width / bars - 1);
        ctx.fillStyle = this.gradient;

        for (let i = 0; i < bars; i++) {
            const barHeight = (this.dataArray[i] / 255) * height * 0.85;
            const x = i * (barWidth + 1);
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        }
    }

    destroy() {
        this.stopLoop();
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('visibilitychange', this.handleVisibility);

        if (this.audioContext) {
            this.audioContext.close().catch(err => {
                console.warn('Error closing audio context:', err);
            });
            this.audioContext = null;
        }
        this.analyser = null;
        this.isInitialized = false;
        this.isActive = false;
    }
}
