// player.js - Audiobook player

import { formatTime, shuffleArray, showPlayerError, showToast, escapeHTML, sanitizeRichText, copyToClipboard } from './utils.js';
import { storage } from './storage.js';
import { Visualizer } from './visualizer.js';
import { updateAudiobookMeta, buildShareUrl } from './socialMeta.js';
import {
    metadataUrl, downloadUrl, coverUrl, detailsUrl, parseMetadataResponse, selectAudioFiles,
    fetchJSON, describeFetchError, joinValues, firstValue, asList
} from './archive.js';

const METADATA_TIMEOUT_MS = 20000;
const PROGRESS_SAVE_INTERVAL_MS = 5000;
const RESUME_THRESHOLD_SECONDS = 5;
const SKIP_BACK_SECONDS = 15;
const SKIP_FORWARD_SECONDS = 30;
const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const ICON_PLAY = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`;
const ICON_PAUSE = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`;
const ICON_VOLUME = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />`;
const ICON_MUTED = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9l4 6m0-6l-4 6" />`;

/**
 * Replace the whole player card with a fatal error (used when nothing can be played).
 */
export function renderPlayerFatalError(message) {
    const wrapper = document.getElementById('player-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = `
        <div class="bg-gray-800 border-2 border-red-900 rounded-lg p-6 text-center" role="alert">
            <svg class="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 class="text-xl font-bold text-red-400 mb-2">Error Loading Player</h3>
            <p class="text-gray-300 mb-4">${escapeHTML(message)}</p>
            <div class="flex flex-wrap gap-4 justify-center">
                <button type="button" id="reloadPlayer" class="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors">Try Again</button>
                <a href="index.html" class="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors inline-block">Return to Library</a>
            </div>
        </div>`;
    wrapper.querySelector('#reloadPlayer')?.addEventListener('click', () => location.reload());
}

export class Player {
    constructor({ onTrackChange } = {}) {
        this.onTrackChange = typeof onTrackChange === 'function' ? onTrackChange : () => {};

        this.identifier = null;
        this.book = { title: '', author: '', narrator: '', language: '' };
        this.playlist = [];
        this.originalPlaylist = [];
        this.currentIndex = 0;
        this.isShuffled = false;
        this.loopMode = 'none';
        this.playerState = 'paused';
        this.isLoadingTrack = false;
        this.isSeeking = false;
        this.pendingSeek = null;
        this.playbackRate = 1;
        this.volume = 1;
        this.lastVolume = 1;
        this.consecutiveErrors = 0;
        this.lastErrorIndex = -1;
        this.finished = false;
        this.lastProgressSave = 0;
        this.lastHighlighted = -1;

        this.audio = null;
        this.elements = {};
        this.visualizer = new Visualizer();
        this.keydownHandler = null;
    }

    /* -------------------------------------------------------------- */
    /* Initialisation                                                 */
    /* -------------------------------------------------------------- */

    async initialize(identifier, startTrack = null) {
        if (!identifier) {
            renderPlayerFatalError('No book selected. Please go back and choose an audiobook.');
            return false;
        }
        this.identifier = identifier;

        const bookTitleEl = document.getElementById('book-title');
        if (bookTitleEl) bookTitleEl.textContent = 'Loading Audiobook...';

        try {
            const { metadata, files } = await this.fetchMetadata(identifier);

            const title = firstValue(metadata.title, 'Unknown Book');
            const author = joinValues(metadata.creator) || 'Unknown Author';
            const narrator = joinValues(metadata.narrator) || joinValues(metadata.reader);
            const language = joinValues(metadata.language);
            this.book = { title, author, narrator, language };

            if (bookTitleEl) bookTitleEl.textContent = title;
            const archiveLink = document.getElementById('archive-link');
            if (archiveLink) archiveLink.href = detailsUrl(identifier);

            updateAudiobookMeta({ identifier, title, author, narrator, language, description: asList(metadata.description).join(' '), coverUrl: coverUrl(identifier) });

            const chapters = selectAudioFiles(files);
            if (chapters.length === 0) throw new Error('No playable audio files were found for this audiobook.');
            console.info(`Selected ${chapters.length} chapters out of ${files.length} files`);

            this.playlist = chapters.map((chapter, index) => ({
                title: chapter.title,
                url: downloadUrl(identifier, chapter.name),
                length: chapter.length,
                originalIndex: index
            }));
            this.originalPlaylist = [...this.playlist];

            this.updateBookInfo(metadata);
            // Only books that actually produced a playlist are remembered.
            storage.updateRecentlyViewed({ identifier, title, author });

            const prefs = storage.getPlayerPrefs();
            this.playbackRate = prefs.playbackRate;
            this.volume = prefs.volume;
            this.lastVolume = prefs.volume > 0 ? prefs.volume : 1;

            this.setupUI();
            this.setupMediaSession();

            const { index, seekTo } = this.resolveStartPosition(startTrack);
            this.loadTrack(index, { seekTo });
            if (seekTo !== null) {
                showToast(`Resumed at chapter ${index + 1}, ${formatTime(seekTo)}`, 'info', 3500);
            }
            return true;
        } catch (error) {
            console.error('Error initializing player:', error);
            const fetchFailure = ['TimeoutError', 'NetworkError', 'HttpError', 'ParseError'].includes(error.name);
            renderPlayerFatalError(fetchFailure ? describeFetchError(error) : (error.message || 'Unable to load audiobook'));
            return false;
        }
    }

    async fetchMetadata(identifier) {
        const data = await fetchJSON(metadataUrl(identifier), { attempts: 2, timeoutMs: METADATA_TIMEOUT_MS });
        return parseMetadataResponse(data);
    }

    /** Pick the starting chapter: URL parameter first, then saved progress. */
    resolveStartPosition(startTrack) {
        const progress = storage.getProgress(this.identifier);
        const total = this.playlist.length;
        let index = 0;
        if (Number.isInteger(startTrack) && startTrack >= 0 && startTrack < total) {
            index = startTrack;
        } else if (progress && progress.track < total) {
            index = progress.track;
        }
        const seekTo = progress && progress.track === index && progress.time >= RESUME_THRESHOLD_SECONDS ? progress.time : null;
        return { index, seekTo };
    }

    /* -------------------------------------------------------------- */
    /* UI wiring                                                      */
    /* -------------------------------------------------------------- */

    setupUI() {
        document.getElementById('loading-placeholder')?.remove();
        document.getElementById('custom-player')?.classList.remove('hidden');

        const byId = id => document.getElementById(id);
        this.audio = byId('audioElement');
        this.elements = {
            trackTitle: byId('trackTitle'),
            trackInfo: byId('trackInfo'),
            playPause: byId('playPause'),
            playIcon: byId('playIcon'),
            prev: byId('prevTrack'),
            next: byId('nextTrack'),
            skipBack: byId('skipBack'),
            skipForward: byId('skipForward'),
            progress: byId('trackProgress'),
            progressBar: byId('progressBar'),
            bufferBar: byId('bufferBar'),
            currentTime: byId('currentTime'),
            totalTime: byId('totalTime'),
            playlist: byId('playlistContainer'),
            playlistInfo: byId('playlistInfo'),
            mute: byId('muteButton'),
            volumeIcon: byId('volumeIcon'),
            volume: byId('volumeControl'),
            volumeBar: byId('volumeBar'),
            volumeGroup: byId('volumeGroup'),
            shuffle: byId('shuffleButton'),
            loop: byId('loopButton'),
            share: byId('shareButton'),
            nowPlayingDot: document.querySelector('.now-playing-dot'),
            nowPlayingLabel: byId('nowPlayingLabel'),
            speedButtons: Array.from(document.querySelectorAll('.speed-btn[data-speed]'))
        };
        const el = this.elements;

        el.playPause?.addEventListener('click', () => this.playPause());
        el.next?.addEventListener('click', () => this.nextTrack());
        el.prev?.addEventListener('click', () => this.prevTrack());
        el.skipBack?.addEventListener('click', () => this.skip(-SKIP_BACK_SECONDS));
        el.skipForward?.addEventListener('click', () => this.skip(SKIP_FORWARD_SECONDS));
        el.mute?.addEventListener('click', () => this.toggleMute());
        el.shuffle?.addEventListener('click', () => this.toggleShuffle());
        el.loop?.addEventListener('click', () => this.toggleLoop());
        el.share?.addEventListener('click', () => this.share());

        if (el.progress) {
            const SEEK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
            const endSeek = () => { this.isSeeking = false; };
            el.progress.addEventListener('pointerdown', () => { this.isSeeking = true; });
            el.progress.addEventListener('keydown', event => { if (SEEK_KEYS.has(event.key)) this.isSeeking = true; });
            el.progress.addEventListener('input', () => { this.isSeeking = true; this.previewSeek(); });
            el.progress.addEventListener('change', () => this.commitSeek());
            // A press that never changed the value (tap on the thumb, cancelled
            // touch, Tab away) must not leave the progress bar frozen.
            for (const type of ['pointerup', 'pointercancel', 'blur', 'keyup']) {
                el.progress.addEventListener(type, () => setTimeout(endSeek, 0));
            }
        }
        if (el.volume) {
            el.volume.addEventListener('input', () => this.setVolume(Number(el.volume.value) / 100, { persist: false }));
            el.volume.addEventListener('change', () => this.setVolume(Number(el.volume.value) / 100));
        }
        el.speedButtons.forEach(button => {
            button.addEventListener('click', () => this.setPlaybackRate(parseFloat(button.dataset.speed)));
        });

        if (el.playlist) {
            el.playlist.addEventListener('click', event => {
                const item = event.target.closest('[data-track-index]');
                if (item && el.playlist.contains(item)) this.selectTrack(parseInt(item.dataset.trackIndex, 10));
            });
        }

        if (this.audio) {
            const audio = this.audio;
            audio.addEventListener('timeupdate', () => this.handleTimeUpdate());
            audio.addEventListener('loadedmetadata', () => this.handleLoadedMetadata());
            audio.addEventListener('durationchange', () => this.updateTotalTime());
            audio.addEventListener('canplay', () => {
                this.isLoadingTrack = false;
                if (audio.paused && this.playerState === 'loading') this.updateState('paused');
            });
            audio.addEventListener('progress', () => this.updateBufferProgress());
            audio.addEventListener('playing', () => {
                this.isLoadingTrack = false;
                this.consecutiveErrors = 0;
                this.lastErrorIndex = -1;
                this.updateState('playing');
                this.ensureVisualizer();
                this.visualizer.setActive(true);
            });
            audio.addEventListener('pause', () => {
                this.updateState('paused');
                this.visualizer.setActive(false);
                this.saveProgress(true);
            });
            audio.addEventListener('waiting', () => { if (!audio.paused) this.updateState('loading'); });
            audio.addEventListener('ended', () => this.handleTrackEnd());
            audio.addEventListener('error', () => this.handleAudioError());
            audio.addEventListener('ratechange', () => this.syncSpeedButtons());
            audio.addEventListener('volumechange', () => this.updateVolumeUI());
        }

        // iOS keeps media volume under hardware control: the property reads
        // back 1 whatever is assigned. Hide the slider there instead of
        // showing one that snaps back.
        if (this.audio) {
            this.audio.volume = 0.37;
            this.volumeSettable = Math.abs(this.audio.volume - 0.37) < 0.01;
            if (!this.volumeSettable) this.elements.volumeGroup?.classList.add('hidden');
        }
        this.setVolume(this.volume, { persist: false });
        this.syncSpeedButtons();
        this.renderPlaylist();
        this.updatePlaylistInfo();
        this.updateControls();
        this.setupKeyboardControls();
    }

    /* -------------------------------------------------------------- */
    /* Loading and playback                                           */
    /* -------------------------------------------------------------- */

    loadTrack(index, { autoplay = false, seekTo = null } = {}) {
        const track = this.playlist[index];
        if (!track || !track.url || !this.audio) {
            showPlayerError('Invalid chapter or missing URL');
            return false;
        }

        this.currentIndex = index;
        this.pendingSeek = Number.isFinite(seekTo) && seekTo > 0 ? seekTo : null;
        this.isLoadingTrack = true;
        this.isSeeking = false;
        this.finished = false;
        this.playerState = autoplay ? 'loading' : 'paused';

        this.audio.src = track.url;
        this.audio.load();
        this.applyPlaybackRate();
        this.audio.volume = this.volume;

        if (this.elements.trackTitle) this.elements.trackTitle.textContent = track.title;
        if (this.elements.trackInfo) this.elements.trackInfo.textContent = `Chapter ${index + 1} of ${this.playlist.length}`;
        if (this.elements.progress) this.elements.progress.value = 0;
        if (this.elements.progressBar) this.elements.progressBar.style.width = '0%';
        if (this.elements.bufferBar) this.elements.bufferBar.style.width = '0%';
        if (this.elements.currentTime) this.elements.currentTime.textContent = formatTime(this.pendingSeek || 0);
        if (this.elements.totalTime) this.elements.totalTime.textContent = formatTime(track.length || 0);

        this.updateControls();
        this.highlightCurrentTrack();
        this.updateMediaSessionMetadata();
        this.onTrackChange(track.originalIndex);

        if (autoplay) this.play();
        return true;
    }

    async play({ quiet = false } = {}) {
        if (!this.audio) return false;
        if (this.audio.error) {
            // The element is stuck on a failed source; reload it instead of
            // letting play() reject silently.
            return this.retryCurrentTrack();
        }
        this.finished = false;
        this.updateState('loading');
        this.ensureVisualizer();
        try {
            await this.audio.play();
            return true;
        } catch (error) {
            if (error.name === 'AbortError') return false; // superseded by a newer load
            console.warn('Playback failed:', error);
            this.updateState('paused');
            if (error.name === 'NotAllowedError') {
                if (!quiet) showToast('Press play to start listening', 'info');
            } else if (!this.audio.error && error.name !== 'NotSupportedError') {
                // Media errors are reported once by handleAudioError.
                showToast('Playback failed. Try another chapter.', 'error');
            }
            return false;
        }
    }

    /**
     * Build the visualizer graph on a user gesture, never blocking playback.
     * The visualizer refuses to attach while the AudioContext is suspended,
     * so this is safe to call from any play path.
     */
    ensureVisualizer() {
        if (!this.audio) return;
        if (this.visualizer.isInitialized) {
            this.visualizer.resume();
            return;
        }
        this.visualizer.initialize(this.audio).catch(error => console.warn('Visualizer initialization failed:', error));
    }

    pause() {
        this.audio?.pause();
    }

    async playPause() {
        if (!this.audio) return;
        if (this.audio.paused) await this.play();
        else this.pause();
    }

    hasNext() {
        return this.currentIndex < this.playlist.length - 1 || this.loopMode === 'all';
    }

    hasPrev() {
        return this.currentIndex > 0 || this.loopMode === 'all';
    }

    nextTrack({ autoplay = true } = {}) {
        if (this.currentIndex < this.playlist.length - 1) {
            return this.loadTrack(this.currentIndex + 1, { autoplay });
        }
        if (this.loopMode === 'all' && this.playlist.length > 0) {
            return this.loadTrack(0, { autoplay });
        }
        showToast('This is the last chapter', 'info', 1500);
        return false;
    }

    prevTrack({ autoplay = true } = {}) {
        if (!this.audio) return false;
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            this.updateProgress();
            return true;
        }
        if (this.currentIndex > 0) {
            return this.loadTrack(this.currentIndex - 1, { autoplay });
        }
        if (this.loopMode === 'all' && this.playlist.length > 0) {
            return this.loadTrack(this.playlist.length - 1, { autoplay });
        }
        this.audio.currentTime = 0;
        this.updateProgress();
        return true;
    }

    selectTrack(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.playlist.length) return;
        if (index === this.currentIndex) {
            this.playPause();
            return;
        }
        this.loadTrack(index, { autoplay: true });
    }

    skip(seconds) {
        if (!this.audio) return;
        const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : Infinity;
        this.audio.currentTime = Math.min(Math.max(this.audio.currentTime + seconds, 0), duration);
        this.updateProgress();
    }

    retryCurrentTrack() {
        document.querySelectorAll('.player-error').forEach(el => el.remove());
        return this.loadTrack(this.currentIndex, { autoplay: true });
    }

    handleTrackEnd() {
        this.saveProgress(true);
        if (this.loopMode === 'one') {
            this.audio.currentTime = 0;
            this.play();
            return;
        }
        if (this.hasNext()) {
            this.nextTrack();
            return;
        }
        // The book is finished: forget the position so it leaves Continue
        // Listening, and keep later saves (pagehide) from resurrecting it.
        this.finished = true;
        this.updateState('paused');
        storage.clearProgress(this.identifier);
        showToast('You have reached the end of this audiobook', 'success', 4000);
    }

    handleAudioError() {
        const audio = this.audio;
        if (!audio || !audio.error || !audio.getAttribute('src')) return;
        this.isLoadingTrack = false;
        if (this.lastErrorIndex !== this.currentIndex) this.consecutiveErrors++;
        this.lastErrorIndex = this.currentIndex;
        this.updateState('paused');

        const codes = audio.error;
        let message = 'Audio playback error';
        switch (codes.code) {
            case codes.MEDIA_ERR_ABORTED: message = 'Playback was aborted'; break;
            case codes.MEDIA_ERR_NETWORK: message = 'Network error while loading this chapter'; break;
            case codes.MEDIA_ERR_DECODE: message = 'This chapter could not be decoded'; break;
            case codes.MEDIA_ERR_SRC_NOT_SUPPORTED: message = 'This chapter could not be loaded'; break;
        }
        console.error('Audio error:', codes.code, codes.message);

        if (this.consecutiveErrors >= 3) {
            message += '. Several chapters failed in a row; the recording may be incomplete on Archive.org.';
        }
        showPlayerError(message, { onRetry: () => this.retryCurrentTrack() });
    }

    /* -------------------------------------------------------------- */
    /* Progress, seeking, volume, speed                               */
    /* -------------------------------------------------------------- */

    handleLoadedMetadata() {
        this.updateTotalTime();
        this.applyPlaybackRate();
        if (this.pendingSeek !== null) {
            const duration = this.audio.duration;
            if (!Number.isFinite(duration) || this.pendingSeek < duration - 1) {
                this.audio.currentTime = this.pendingSeek;
            }
            this.pendingSeek = null;
        }
        this.updateProgress();
        this.updateMediaSessionPosition();
    }

    handleTimeUpdate() {
        this.updateProgress();
        this.saveProgress();
    }

    updateProgress() {
        if (!this.audio || this.isSeeking) return;
        const duration = this.audio.duration;
        const current = this.audio.currentTime;
        if (this.elements.currentTime) this.elements.currentTime.textContent = formatTime(current);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const pct = Math.min(100, (current / duration) * 100);
        {
            if (this.elements.progress) {
                this.elements.progress.value = pct;
                this.elements.progress.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
            }
            if (this.elements.progressBar) this.elements.progressBar.style.width = `${pct}%`;
        }
    }

    updateTotalTime() {
        if (!this.audio || !this.elements.totalTime) return;
        const duration = this.audio.duration;
        if (Number.isFinite(duration) && duration > 0) this.elements.totalTime.textContent = formatTime(duration);
    }

    previewSeek() {
        if (!this.audio || !this.elements.progress) return;
        const pct = Number(this.elements.progress.value);
        if (this.elements.progressBar) this.elements.progressBar.style.width = `${pct}%`;
        if (Number.isFinite(this.audio.duration) && this.elements.currentTime) {
            this.elements.currentTime.textContent = formatTime((pct / 100) * this.audio.duration);
        }
    }

    commitSeek() {
        this.isSeeking = false;
        if (!this.audio || !this.elements.progress) return;
        const duration = this.audio.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        this.finished = false;
        this.audio.currentTime = (Number(this.elements.progress.value) / 100) * duration;
        this.updateProgress();
        this.saveProgress(true);
    }

    updateBufferProgress() {
        if (!this.audio || !this.elements.bufferBar) return;
        const { buffered, duration } = this.audio;
        if (!buffered.length || !Number.isFinite(duration) || duration <= 0) return;
        try {
            const end = buffered.end(buffered.length - 1);
            this.elements.bufferBar.style.width = `${Math.min(100, (end / duration) * 100)}%`;
        } catch {
            // buffered ranges can be transiently invalid during a source change
        }
    }

    saveProgress(force = false) {
        if (!this.identifier || !this.audio || !this.playlist.length || this.finished) return;
        const now = Date.now();
        if (!force && now - this.lastProgressSave < PROGRESS_SAVE_INTERVAL_MS) return;
        // Until metadata has loaded the element reports 0; keep the position
        // that is still waiting to be applied instead of overwriting it.
        const time = this.pendingSeek !== null ? this.pendingSeek : (this.audio.currentTime || 0);
        if (!force && this.audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
        this.lastProgressSave = now;
        const track = this.playlist[this.currentIndex];
        storage.setProgress(this.identifier, {
            track: track ? track.originalIndex : 0,
            time,
            chapters: this.originalPlaylist.length
        });
        this.updateMediaSessionPosition();
    }

    setVolume(value, { persist = true } = {}) {
        const volume = Math.min(1, Math.max(0, Number(value) || 0));
        this.volume = volume;
        if (volume > 0) this.lastVolume = volume;
        if (this.audio) this.audio.volume = volume;
        this.updateVolumeUI();
        if (persist) storage.setPlayerPrefs({ volume });
    }

    toggleMute() {
        if (!this.audio) return;
        if (this.audio.muted || this.volume === 0) {
            this.audio.muted = false;
            if (this.volume === 0) this.setVolume(this.lastVolume > 0 ? this.lastVolume : 1);
        } else {
            this.audio.muted = true;
        }
        this.updateVolumeUI();
    }

    updateVolumeUI() {
        const volume = this.volume;
        const muted = !!(this.audio && this.audio.muted) || volume === 0;
        const pct = Math.round(volume * 100);
        if (this.elements.volumeBar) {
            this.elements.volumeBar.style.width = `${pct}%`;
            this.elements.volumeBar.classList.toggle('opacity-40', muted);
        }
        if (this.elements.volume && Number(this.elements.volume.value) !== pct) this.elements.volume.value = pct;
        if (this.elements.volumeIcon) this.elements.volumeIcon.innerHTML = muted ? ICON_MUTED : ICON_VOLUME;
        if (this.elements.mute) {
            this.elements.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
            this.elements.mute.setAttribute('aria-pressed', String(muted));
        }
    }

    setPlaybackRate(rate) {
        if (!Number.isFinite(rate) || rate < 0.5 || rate > 3) return;
        this.playbackRate = rate;
        this.applyPlaybackRate();
        this.syncSpeedButtons();
        storage.setPlayerPrefs({ playbackRate: rate });
        this.updateMediaSessionPosition();
    }

    /** load() resets playbackRate, so it is re-applied after every load and on loadedmetadata. */
    applyPlaybackRate() {
        if (!this.audio) return;
        this.audio.defaultPlaybackRate = this.playbackRate;
        this.audio.playbackRate = this.playbackRate;
    }

    cyclePlaybackRate(direction) {
        const index = SPEED_STEPS.findIndex(step => Math.abs(step - this.playbackRate) < 0.001);
        const next = SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, (index === -1 ? 1 : index) + direction))];
        this.setPlaybackRate(next);
        showToast(`Speed ${next}×`, 'info', 1200);
    }

    syncSpeedButtons() {
        const current = this.audio ? this.audio.playbackRate : this.playbackRate;
        this.elements.speedButtons?.forEach(button => {
            const active = Math.abs(parseFloat(button.dataset.speed) - current) < 0.001;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    /* -------------------------------------------------------------- */
    /* Shuffle, loop, share                                           */
    /* -------------------------------------------------------------- */

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        const current = this.playlist[this.currentIndex];
        this.playlist = this.isShuffled ? shuffleArray(this.originalPlaylist) : [...this.originalPlaylist];
        this.currentIndex = Math.max(0, this.playlist.findIndex(t => t === current));

        if (this.elements.shuffle) {
            this.elements.shuffle.classList.toggle('text-sky-400', this.isShuffled);
            this.elements.shuffle.setAttribute('aria-pressed', String(this.isShuffled));
            this.elements.shuffle.title = `Shuffle chapters (${this.isShuffled ? 'on' : 'off'})`;
        }
        this.lastHighlighted = -1;
        this.renderPlaylist();
        this.updateControls();
    }

    toggleLoop() {
        const modes = ['none', 'one', 'all'];
        const labels = { none: 'off', one: 'this chapter', all: 'whole book' };
        this.loopMode = modes[(modes.indexOf(this.loopMode) + 1) % modes.length];
        if (this.elements.loop) {
            this.elements.loop.classList.toggle('text-sky-400', this.loopMode !== 'none');
            this.elements.loop.setAttribute('aria-pressed', String(this.loopMode !== 'none'));
            this.elements.loop.setAttribute('aria-label', `Repeat: ${labels[this.loopMode]}`);
            this.elements.loop.title = `Repeat: ${labels[this.loopMode]}`;
            this.elements.loop.dataset.mode = this.loopMode;
        }
        showToast(`Repeat: ${labels[this.loopMode]}`, 'info', 1200);
        this.updateControls();
    }

    async share() {
        const track = this.playlist[this.currentIndex];
        const url = buildShareUrl(this.identifier, track ? track.originalIndex + 1 : null);
        const text = `${this.book.title} by ${this.book.author}`;
        if (navigator.share) {
            try {
                await navigator.share({ title: text, text, url });
                return;
            } catch (error) {
                if (error.name === 'AbortError') return;
            }
        }
        const copied = await copyToClipboard(url);
        if (copied) {
            showToast('Link copied to clipboard', 'success');
        } else {
            window.prompt('Copy this link to share the chapter:', url);
        }
    }

    /* -------------------------------------------------------------- */
    /* Rendering                                                      */
    /* -------------------------------------------------------------- */

    updateState(state) {
        this.playerState = state;
        this.updateControls();
        this.highlightCurrentTrack();
    }

    updateControls() {
        const el = this.elements;
        const playing = this.playerState === 'playing';
        if (el.playIcon) el.playIcon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
        if (el.playPause) {
            el.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
            el.playPause.title = playing ? 'Pause (Space)' : 'Play (Space)';
            el.playPause.dataset.state = this.playerState;
        }
        if (el.nowPlayingDot) el.nowPlayingDot.classList.toggle('paused', !playing);
        if (el.nowPlayingLabel) {
            el.nowPlayingLabel.textContent = playing ? 'Now Playing' : this.playerState === 'loading' ? 'Loading' : 'Paused';
        }
        const setDisabled = (button, disabled) => {
            if (!button) return;
            if (disabled && document.activeElement === button && el.playPause) el.playPause.focus();
            button.disabled = disabled;
            button.classList.toggle('opacity-50', disabled);
            button.classList.toggle('cursor-not-allowed', disabled);
        };
        setDisabled(el.next, !this.hasNext());
        setDisabled(el.prev, false);
    }

    renderPlaylist() {
        const container = this.elements.playlist;
        if (!container) return;
        container.innerHTML = this.playlist.map((track, i) => `
            <li class="playlist-row">
                <button type="button" class="playlist-item" data-track-index="${i}" aria-current="false">
                    <span class="playlist-number">${i + 1}.</span>
                    <span class="playlist-title">${escapeHTML(track.title)}</span>
                    <span class="playlist-indicator" aria-hidden="true"><i></i><i></i><i></i></span>
                    ${track.length ? `<span class="playlist-duration">${formatTime(track.length)}</span>` : ''}
                </button>
            </li>
        `).join('');
        this.updatePlaylistInfo();
        this.highlightCurrentTrack();
    }

    highlightCurrentTrack() {
        const container = this.elements.playlist;
        if (!container) return;
        const changed = this.lastHighlighted !== this.currentIndex;
        for (const item of container.querySelectorAll('.playlist-item')) {
            const index = parseInt(item.dataset.trackIndex, 10);
            const isCurrent = index === this.currentIndex;
            item.classList.toggle('active', isCurrent);
            item.setAttribute('aria-current', isCurrent ? 'true' : 'false');
            item.dataset.state = isCurrent ? this.playerState : '';
            if (isCurrent && changed) this.revealPlaylistItem(item);
        }
        this.lastHighlighted = this.currentIndex;
    }

    /** Scroll the chapter list (never the page) so the item is visible. */
    revealPlaylistItem(item) {
        const container = this.elements.playlist;
        if (!container) return;
        const delta = item.getBoundingClientRect().top - container.getBoundingClientRect().top;
        if (delta < 0) {
            container.scrollTop += delta;
        } else if (delta + item.offsetHeight > container.clientHeight) {
            container.scrollTop += delta + item.offsetHeight - container.clientHeight;
        }
    }

    updatePlaylistInfo() {
        if (!this.elements.playlistInfo) return;
        const count = this.playlist.length;
        const total = this.originalPlaylist.reduce((sum, t) => sum + (t.length || 0), 0);
        this.elements.playlistInfo.textContent = total > 0
            ? `${count} chapter${count === 1 ? '' : 's'} · ${formatTime(total)}`
            : `${count} chapter${count === 1 ? '' : 's'}`;
    }

    updateBookInfo(metadata) {
        const row = (label, value) => value
            ? `<p class="text-sm md:text-base text-gray-300"><strong class="text-gray-100">${label}:</strong> ${escapeHTML(value)}</p>`
            : '';
        const details = document.getElementById('book-details-content');
        if (details) {
            details.innerHTML = `
                <img id="book-cover" class="book-detail-cover" src="${coverUrl(this.identifier)}" alt="" width="120" height="180" loading="lazy" decoding="async">
                <div class="space-y-2 min-w-0">
                    ${row('Author', this.book.author)}
                    ${row('Narrator', this.book.narrator)}
                    ${row('Language', this.book.language)}
                    ${row('Recorded', firstValue(metadata.year) || firstValue(metadata.date).slice(0, 10))}
                    ${row('Runtime', firstValue(metadata.runtime))}
                    ${row('Chapters', String(this.originalPlaylist.length))}
                    ${row('Genre', joinValues(metadata.genre))}
                    ${row('Subjects', joinValues(metadata.subject).slice(0, 160))}
                </div>`;
            details.querySelector('#book-cover')?.addEventListener('error', event => { event.target.remove(); }, { once: true });
        }

        const about = document.getElementById('book-about-content');
        if (about) {
            const descriptions = asList(metadata.description);
            const notes = asList(metadata.notes);
            about.innerHTML = descriptions.length || notes.length
                ? `${descriptions.map(text => `<div class="rich-text">${sanitizeRichText(text)}</div>`).join('')}
                   ${notes.map(text => `<div class="rich-text mt-3 text-gray-400">${sanitizeRichText(text)}</div>`).join('')}`
                : '<p class="text-sm md:text-base text-gray-400">No additional information available</p>';
        }
    }

    /* -------------------------------------------------------------- */
    /* Keyboard and Media Session                                     */
    /* -------------------------------------------------------------- */

    setupKeyboardControls() {
        if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler);
        this.keydownHandler = event => {
            if (!this.audio || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
            const target = event.target;
            if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
            // Space/Enter on a focused control must keep its native meaning.
            if ((event.key === ' ' || event.key === 'Enter') && target.closest('button, a, summary')) return;

            switch (event.key.toLowerCase()) {
                case ' ':
                case 'k':
                    event.preventDefault();
                    this.playPause();
                    break;
                case 'arrowright':
                    event.preventDefault();
                    this.skip(5);
                    break;
                case 'arrowleft':
                    event.preventDefault();
                    this.skip(-5);
                    break;
                case 'j':
                    event.preventDefault();
                    this.skip(-SKIP_BACK_SECONDS);
                    break;
                case 'l':
                    event.preventDefault();
                    this.skip(SKIP_FORWARD_SECONDS);
                    break;
                case 'm':
                    event.preventDefault();
                    this.toggleMute();
                    break;
                case 'n':
                    event.preventDefault();
                    this.nextTrack();
                    break;
                case 'p':
                    event.preventDefault();
                    this.prevTrack();
                    break;
                case '<':
                case ',':
                    event.preventDefault();
                    this.cyclePlaybackRate(-1);
                    break;
                case '>':
                case '.':
                    event.preventDefault();
                    this.cyclePlaybackRate(1);
                    break;
            }
        };
        document.addEventListener('keydown', this.keydownHandler);
    }

    setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const set = (action, handler) => {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
        };
        set('play', () => this.play());
        set('pause', () => this.pause());
        set('previoustrack', () => this.prevTrack());
        set('nexttrack', () => this.nextTrack());
        set('seekbackward', details => this.skip(-(details?.seekOffset || SKIP_BACK_SECONDS)));
        set('seekforward', details => this.skip(details?.seekOffset || SKIP_FORWARD_SECONDS));
        set('seekto', details => {
            if (this.audio && details && Number.isFinite(details.seekTime)) {
                this.audio.currentTime = details.seekTime;
                this.updateProgress();
            }
        });
    }

    updateMediaSessionMetadata() {
        if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
        const track = this.playlist[this.currentIndex];
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track ? track.title : this.book.title,
                artist: this.book.author,
                album: this.book.title,
                artwork: [{ src: coverUrl(this.identifier), sizes: '180x180', type: 'image/jpeg' }]
            });
        } catch (error) {
            console.warn('Media Session metadata failed:', error);
        }
    }

    updateMediaSessionPosition() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !this.audio) return;
        const duration = this.audio.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate: this.audio.playbackRate,
                position: Math.min(this.audio.currentTime, duration)
            });
        } catch {
            // ignore invalid transient states
        }
    }

    /* -------------------------------------------------------------- */
    /* Teardown                                                       */
    /* -------------------------------------------------------------- */

    destroy() {
        this.saveProgress(true);
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
        try {
            this.visualizer.destroy();
        } catch (e) {
            console.error('Error destroying visualizer:', e);
        }
        if (this.audio) {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
    }
}
