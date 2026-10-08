/** Gentle, dependency-free cues. Call unlock() directly from a user gesture. */
const MAX_GAIN = 0.12;
const FADE_SECONDS = 0.025;
const VALID_PHASES = new Set(['inhale', 'holdIn', 'exhale', 'holdOut', 'ready', 'complete']);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Frequencies and durations are deliberately gentle; cues never contain speech. */
export function cueSpec(phaseId, tone = 'soft') {
  if (!VALID_PHASES.has(phaseId)) return [];
  const bell = tone === 'bell';
  const base = {
    inhale: [{ from: 330, to: 440, duration: 0.7, offset: 0, level: 0.8 }],
    exhale: [{ from: 392, to: 262, duration: 0.9, offset: 0, level: 0.8 }],
    holdIn: [{ from: 392, to: 392, duration: 0.28, offset: 0, level: 0.45 }],
    holdOut: [{ from: 262, to: 262, duration: 0.28, offset: 0, level: 0.4 }],
    ready: [{ from: 330, to: 330, duration: 0.32, offset: 0, level: 0.45 }],
    complete: [
      { from: 330, to: 330, duration: 0.42, offset: 0, level: 0.55 },
      { from: 440, to: 440, duration: 0.5, offset: 0.5, level: 0.5 },
    ],
  }[phaseId];
  return base.map((note) => ({
    ...note,
    attack: bell ? 0.035 : 0.075,
    partials: bell
      ? [{ ratio: 1, weight: 0.84 }, { ratio: 2.005, weight: 0.12 }, { ratio: 3, weight: 0.04 }]
      : [{ ratio: 1, weight: 1 }],
  }));
}

export class SoftAudio {
  constructor({ contextFactory } = {}) {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    this._factory = typeof contextFactory === 'function'
      ? contextFactory
      : typeof AudioContext === 'function' ? () => new AudioContext() : null;
    this._context = null;
    this._master = null;
    this._voices = new Set();
    this._volume = 25;
    this._tone = 'soft';
    this._epoch = 0;
    this._unlocked = false;
    this._failed = false;
    this._disposed = false;
  }

  get available() {
    return Boolean(this._factory) && !this._failed && !this._disposed
      && this._context?.state !== 'closed';
  }

  get ready() {
    return this.available && this._unlocked && this._context?.state === 'running';
  }

  get status() {
    if (this._disposed) return 'disposed';
    if (!this.available) return 'unavailable';
    if (this.ready) return 'ready';
    if (this._context && this._context.state !== 'running') return 'suspended';
    return 'locked';
  }

  async unlock() {
    if (!this.available) return false;
    const epoch = ++this._epoch;
    try {
      // Construction and resume both happen synchronously before the first await,
      // preserving the browser's user-activation window on mobile.
      if (!this._context) {
        this._context = this._factory();
        this._master = this._context.createGain();
        this._master.gain.setValueAtTime(this._volume / 60 * MAX_GAIN, this._context.currentTime);
        this._master.connect(this._context.destination);
      }
      if (this._context.state !== 'running') await this._context.resume();
      if (epoch !== this._epoch || this._disposed) return false;
      this._unlocked = this._context.state === 'running';
      return this.ready;
    } catch {
      if (epoch === this._epoch) this._unlocked = false;
      // A blocked resume can be retried by another tap. A broken constructor
      // cannot provide cues, but must not prevent the breathing exercise.
      if (!this._context || !this._master) this._failed = true;
      return false;
    }
  }

  setVolume(value) {
    const numeric = Number(value);
    this._volume = Number.isFinite(numeric) ? clamp(numeric, 0, 60) : 0;
    if (this._master && this._context?.state !== 'closed') {
      const now = this._context.currentTime;
      try {
        this._hold(this._master.gain, now, MAX_GAIN);
        this._master.gain.linearRampToValueAtTime(this._volume / 60 * MAX_GAIN, now + 0.04);
      } catch { /* Audio may have been interrupted by the operating system. */ }
    }
    return this._volume;
  }

  setTone(value) {
    this._tone = value === 'bell' ? 'bell' : 'soft';
    return this._tone;
  }

  cue(phaseId) {
    if (!this.ready || this._volume === 0) return false;
    const notes = cueSpec(phaseId, this._tone);
    if (!notes.length) return false;
    const context = this._context;
    const now = context.currentTime;
    const hadVoices = this._voices.size > 0;
    this._stopVoices();
    // A replacement cue waits for the old cue's tiny fade, avoiding stacked
    // tones even if a control is tapped repeatedly.
    const start = now + (hadVoices ? FADE_SECONDS + 0.005 : 0.005);
    try {
      for (const note of notes) {
        for (const partial of note.partials) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const voice = { oscillator, gain, peak: note.level * partial.weight, stopping: false };
          this._voices.add(voice);
          oscillator.onended = () => this._clean(voice);
          const at = start + note.offset;
          const end = at + note.duration;
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(note.from * partial.ratio, at);
          oscillator.frequency.exponentialRampToValueAtTime(note.to * partial.ratio, end);
          gain.gain.setValueAtTime(0, now);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(voice.peak, at + note.attack);
          gain.gain.exponentialRampToValueAtTime(0.001, end - 0.025);
          gain.gain.linearRampToValueAtTime(0, end);
          oscillator.connect(gain);
          gain.connect(this._master);
          oscillator.start(at);
          oscillator.stop(end + 0.005);
        }
      }
      return true;
    } catch {
      this._stopVoices();
      this._unlocked = false;
      return false;
    }
  }

  stop() {
    ++this._epoch;
    this._unlocked = false;
    this._stopVoices();
  }

  async dispose() {
    if (this._disposed) return;
    this.stop();
    this._disposed = true;
    try { await this._context?.close(); } catch { /* Closing is best-effort. */ }
    for (const voice of this._voices) this._clean(voice);
    try { this._master?.disconnect(); } catch { /* Already disconnected. */ }
  }

  _hold(param, now, ceiling) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(now);
    } else {
      const value = Number.isFinite(param.value) ? clamp(param.value, 0, ceiling) : 0;
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    }
  }

  _stopVoices() {
    if (!this._context) return;
    const now = this._context.currentTime;
    for (const voice of this._voices) {
      if (voice.stopping) continue;
      voice.stopping = true;
      try {
        if (this._context.state !== 'running') {
          voice.oscillator.stop(now);
          this._clean(voice);
          continue;
        }
        this._hold(voice.gain.gain, now, voice.peak);
        voice.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
        voice.oscillator.stop(now + FADE_SECONDS);
      } catch {
        this._clean(voice);
      }
    }
  }

  _clean(voice) {
    voice.oscillator.onended = null;
    try { voice.oscillator.disconnect(); } catch { /* Already disconnected. */ }
    try { voice.gain.disconnect(); } catch { /* Already disconnected. */ }
    this._voices.delete(voice);
  }
}
