/**
 * On-device audio monitoring. Sound is analysed here and never recorded, stored or sent:
 * only events such as VOICE_DETECTED or MIC_BLOCKED leave the computer.
 */

export interface AudioFrame {
  /** Level of the 300-3400 Hz speech band, in dBFS. */
  voiceDb: number;
  /** Spectral flatness of that band, 0 (tonal, like a voice) to 1 (flat, like fan noise). */
  flatness: number;
  /** Overall input level in dBFS; -Infinity when the device sends digital silence. */
  totalDb: number;
}

export interface AudioEvent {
  code: 'VOICE_DETECTED' | 'MIC_BLOCKED';
  message: string;
  confidence?: number;
}

export interface VoiceDetectorOptions {
  frameMs: number;
  /** Background noise is learned for this long before anything can be flagged. */
  calibrateMs: number;
  windowMs: number;
  /** Speech must fill this much of the window to raise VOICE_DETECTED. */
  triggerMs: number;
  /** How far above the background the speech band must be to count as voice. */
  marginDb: number;
  maxFlatness: number;
  /** Below this the microphone is treated as sending nothing at all. */
  deadDb: number;
  deadMs: number;
}

export const DEFAULT_AUDIO_OPTIONS: VoiceDetectorOptions = {
  frameMs: 100,
  calibrateMs: 20_000,
  windowMs: 10_000,
  triggerMs: 6_000,
  marginDb: 12,
  maxFlatness: 0.45,
  deadDb: -100,
  deadMs: 10_000,
};

/** Decides when sound becomes an event. Pure: feed it frames, it returns at most one event per frame. */
export class VoiceDetector {
  private readonly o: VoiceDetectorOptions;
  private readonly windowFrames: number;
  private readonly triggerFrames: number;
  private calibration: number[] = [];
  private floorDb: number | null = null;
  private window: boolean[] = [];
  private voiced = 0;
  private deadFrames = 0;
  private blocked = false;

  constructor(options: Partial<VoiceDetectorOptions> = {}) {
    this.o = { ...DEFAULT_AUDIO_OPTIONS, ...options };
    this.windowFrames = Math.round(this.o.windowMs / this.o.frameMs);
    this.triggerFrames = Math.round(this.o.triggerMs / this.o.frameMs);
  }

  /** The learned background level, or null while still calibrating. */
  get noiseFloorDb(): number | null {
    return this.floorDb;
  }

  push(frame: AudioFrame): AudioEvent | null {
    if (frame.totalDb <= this.o.deadDb) {
      this.deadFrames++;
      if (!this.blocked && this.deadFrames * this.o.frameMs >= this.o.deadMs) {
        this.blocked = true;
        return { code: 'MIC_BLOCKED', message: 'The microphone has sent no sound for 10 seconds. It may be muted or disconnected.' };
      }
      return null;
    }
    this.deadFrames = 0;
    this.blocked = false;

    if (this.floorDb === null) {
      this.calibration.push(frame.voiceDb);
      if (this.calibration.length * this.o.frameMs >= this.o.calibrateMs) {
        const sorted = [...this.calibration].sort((a, b) => a - b);
        this.floorDb = sorted[Math.floor(sorted.length / 2)] ?? frame.voiceDb;
        this.calibration = [];
      }
      return null;
    }

    const isVoice = frame.voiceDb > this.floorDb + this.o.marginDb && frame.flatness < this.o.maxFlatness;
    // Follow slow changes in the room (a fan switching on) using only frames that are not speech.
    if (!isVoice) this.floorDb += (frame.voiceDb - this.floorDb) * 0.01;

    this.window.push(isVoice);
    if (isVoice) this.voiced++;
    if (this.window.length > this.windowFrames && this.window.shift()) this.voiced--;

    if (this.voiced >= this.triggerFrames) {
      const seconds = Math.round((this.voiced * this.o.frameMs) / 1000);
      const confidence = Math.round((this.voiced / this.windowFrames) * 100) / 100;
      // Start a fresh window so one long conversation is reported once per window, not every frame.
      this.window = [];
      this.voiced = 0;
      return { code: 'VOICE_DETECTED', message: `Speech was detected for ${seconds} of the last ${this.o.windowMs / 1000} seconds.`, confidence };
    }
    return null;
  }
}

/** Turns one analyser snapshot into an AudioFrame. Exported for tests. */
export function measure(freqDb: Float32Array, timeData: Float32Array, sampleRate: number): AudioFrame {
  const binHz = sampleRate / 2 / freqDb.length;
  const lo = Math.max(1, Math.floor(300 / binHz));
  const hi = Math.min(freqDb.length - 1, Math.ceil(3400 / binHz));
  let sum = 0;
  let logSum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    const power = Math.max(10 ** ((freqDb[i] ?? -Infinity) / 10), 1e-12);
    sum += power;
    logSum += Math.log(power);
    n++;
  }
  const mean = n ? sum / n : 1e-12;
  let squares = 0;
  for (const s of timeData) squares += s * s;
  const rms = timeData.length ? Math.sqrt(squares / timeData.length) : 0;
  return {
    voiceDb: 10 * Math.log10(mean),
    flatness: n ? Math.exp(logSum / n) / mean : 1,
    totalDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
  };
}

/**
 * Opens the microphone and runs the detector until the returned function is called.
 * Browser processing is turned off so levels stay comparable over the whole exam.
 */
export function startAudioMonitor(onEvent: (e: AudioEvent) => void, options: Partial<VoiceDetectorOptions> = {}): () => void {
  const detector = new VoiceDetector(options);
  const frameMs = options.frameMs ?? DEFAULT_AUDIO_OPTIONS.frameMs;
  let stopped = false;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let timer = 0;
  let lostReported = false;

  const lost = (message: string) => {
    if (stopped || lostReported) return;
    lostReported = true;
    onEvent({ code: 'MIC_BLOCKED', message });
  };

  void navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
    .then((s) => {
      if (stopped) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      const track = s.getAudioTracks()[0];
      track?.addEventListener('ended', () => lost('The microphone was disconnected during the exam.'));
      track?.addEventListener('mute', () => lost('The microphone was muted during the exam.'));
      track?.addEventListener('unmute', () => { lostReported = false; });

      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      ctx.createMediaStreamSource(s).connect(analyser);
      const freq = new Float32Array(analyser.frequencyBinCount);
      const time = new Float32Array(analyser.fftSize);
      timer = window.setInterval(() => {
        analyser.getFloatFrequencyData(freq);
        analyser.getFloatTimeDomainData(time);
        const event = detector.push(measure(freq, time, ctx?.sampleRate ?? 48_000));
        if (event) onEvent(event);
      }, frameMs);
    })
    .catch(() => lost('The microphone could not be opened during the exam.'));

  return () => {
    stopped = true;
    window.clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
  };
}
