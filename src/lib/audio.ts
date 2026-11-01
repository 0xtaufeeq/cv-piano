export type InstrumentId = "harmonium" | "glass" | "santoor" | "bansuri";

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  hint: string;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: "harmonium", name: "Harmonium", hint: "Reedy, sustained" },
  { id: "glass", name: "Glass", hint: "Soft synth" },
  { id: "santoor", name: "Santoor", hint: "Struck, ringing" },
  { id: "bansuri", name: "Bansuri", hint: "Breathy flute" },
];

interface Voice {
  release(): void;
}

const VOICE_PEAK = 0.24;

/** Freezes a param at its current value; Firefox lacks cancelAndHoldAtTime. */
function holdAt(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
  } else {
    const value = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(value, time);
  }
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly wet: GainNode;
  private readonly master: GainNode;
  private readonly droneBus: GainNode;
  private readonly voices = new Map<number, Voice>();
  private noise: AudioBuffer | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneSweep: OscillatorNode | null = null;
  instrument: InstrumentId = "harmonium";

  constructor() {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    const ctx = this.ctx;

    this.bus = ctx.createGain();
    this.droneBus = ctx.createGain();
    this.droneBus.gain.value = 0;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.6);

    // Eight voices can stack up, so everything goes through a limiter.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;

    this.bus.connect(limiter);
    this.bus.connect(reverb);
    this.droneBus.connect(limiter);
    this.droneBus.connect(reverb);
    reverb.connect(this.wet);
    this.wet.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setVolume(value: number): void {
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.03);
  }

  setReverb(value: number): void {
    this.wet.gain.setTargetAtTime(value * 0.7, this.ctx.currentTime, 0.05);
  }

  noteOn(id: number, freq: number): void {
    this.voices.get(id)?.release();
    this.voices.set(id, this.build(freq));
  }

  noteOff(id: number): void {
    this.voices.get(id)?.release();
    this.voices.delete(id);
  }

  allOff(): void {
    for (const voice of this.voices.values()) voice.release();
    this.voices.clear();
  }

  /** Tanpura-style drone on the tonic and its fifth. */
  setDrone(on: boolean, tonicFreq: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freqs = [tonicFreq / 2, (tonicFreq / 2) * 1.5, tonicFreq, tonicFreq / 4];

    if (!on) {
      this.droneBus.gain.setTargetAtTime(0, now, 0.25);
      for (const osc of this.droneOscs) osc.stop(now + 1.5);
      this.droneSweep?.stop(now + 1.5);
      this.droneOscs = [];
      this.droneSweep = null;
      return;
    }

    if (this.droneOscs.length > 0) {
      this.droneOscs.forEach((osc, i) => osc.frequency.setTargetAtTime(freqs[i], now, 0.08));
      return;
    }

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    filter.connect(this.droneBus);

    // Slow filter sweep gives the drone the shimmer of plucked strings.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.13;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 350;
    sweep.connect(sweepDepth);
    sweepDepth.connect(filter.frequency);
    sweep.start();
    this.droneSweep = sweep;

    const levels = [0.5, 0.3, 0.22, 0.35];
    this.droneOscs = freqs.map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1.5) * 3;
      const level = ctx.createGain();
      level.gain.value = levels[i];
      osc.connect(level);
      level.connect(filter);
      osc.start();
      return osc;
    });
    this.droneBus.gain.setTargetAtTime(0.085, now, 0.6);
  }

  dispose(): void {
    this.allOff();
    void this.ctx.close();
  }

  private build(freq: number): Voice {
    switch (this.instrument) {
      case "harmonium":
        return this.harmonium(freq);
      case "glass":
        return this.glass(freq);
      case "santoor":
        return this.santoor(freq);
      case "bansuri":
        return this.bansuri(freq);
    }
  }

  private osc(type: OscillatorType, freq: number, detune = 0): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    return osc;
  }

  private level(value: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = value;
    return gain;
  }

  /** Wraps sources in an envelope and returns the voice handle. */
  private voice(
    sources: AudioScheduledSourceNode[],
    input: AudioNode,
    shape: (gain: AudioParam, now: number) => void,
    releaseTime: number,
  ): Voice {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    shape(env.gain, now);
    input.connect(env);
    env.connect(this.bus);
    for (const source of sources) source.start(now);

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const t = ctx.currentTime;
        holdAt(env.gain, t);
        env.gain.setTargetAtTime(0, t, releaseTime / 4);
        for (const source of sources) source.stop(t + releaseTime + 0.1);
        setTimeout(() => env.disconnect(), (releaseTime + 0.3) * 1000);
      },
    };
  }

  private harmonium(freq: number): Voice {
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(5200, freq * 7);
    filter.Q.value = 0.6;

    const reeds = [this.osc("sawtooth", freq, -7), this.osc("sawtooth", freq, 7)];
    const bass = this.osc("square", freq / 2);
    const mix = this.level(0.34);
    const bassMix = this.level(0.12);
    for (const reed of reeds) reed.connect(mix);
    bass.connect(bassMix);
    mix.connect(filter);
    bassMix.connect(filter);

    return this.voice(
      [...reeds, bass],
      filter,
      (gain, now) => {
        gain.linearRampToValueAtTime(VOICE_PEAK, now + 0.045);
        gain.setTargetAtTime(VOICE_PEAK * 0.85, now + 0.045, 0.3);
      },
      0.22,
    );
  }

  private glass(freq: number): Voice {
    const body = this.osc("triangle", freq);
    const shimmer = this.osc("sine", freq * 2, 5);
    const mix = this.level(0.7);
    const shimmerMix = this.level(0.45);
    body.connect(mix);
    shimmer.connect(shimmerMix);
    shimmerMix.connect(mix);

    return this.voice(
      [body, shimmer],
      mix,
      (gain, now) => {
        gain.linearRampToValueAtTime(VOICE_PEAK * 1.2, now + 0.03);
        gain.setTargetAtTime(VOICE_PEAK * 0.6, now + 0.03, 0.12);
      },
      0.3,
    );
  }

  private santoor(freq: number): Voice {
    const mix = this.level(1);
    const partials: Array<[number, number, number]> = [
      [1, 0.6, 0],
      [2, 0.28, 4],
      [3, 0.14, -3],
      [4.02, 0.07, 0],
    ];
    const sources = partials.map(([ratio, amount, detune]) => {
      const osc = this.osc(ratio === 1 ? "triangle" : "sine", freq * ratio, detune);
      const level = this.level(amount);
      osc.connect(level);
      level.connect(mix);
      return osc;
    });

    // Struck strings decay on their own; holding the pinch just lets them ring.
    return this.voice(
      sources,
      mix,
      (gain, now) => {
        gain.linearRampToValueAtTime(VOICE_PEAK * 1.5, now + 0.004);
        gain.setTargetAtTime(0.0001, now + 0.004, 0.55);
      },
      0.35,
    );
  }

  private bansuri(freq: number): Voice {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tone = this.osc("sine", freq);
    const edge = this.osc("triangle", freq * 2);
    const mix = this.level(0.85);
    const edgeMix = this.level(0.1);
    tone.connect(mix);
    edge.connect(edgeMix);
    edgeMix.connect(mix);

    // Vibrato fades in after the attack, the way a player settles into a note.
    const vibrato = this.osc("sine", 5.2);
    const depth = this.level(0);
    depth.gain.setValueAtTime(0, now + 0.25);
    depth.gain.linearRampToValueAtTime(freq * 0.006, now + 0.8);
    vibrato.connect(depth);
    depth.connect(tone.frequency);

    const breath = ctx.createBufferSource();
    breath.buffer = this.noiseBuffer();
    breath.loop = true;
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = "bandpass";
    breathBand.frequency.value = freq * 2.5;
    breathBand.Q.value = 1.2;
    const breathMix = this.level(0.09);
    breath.connect(breathBand);
    breathBand.connect(breathMix);
    breathMix.connect(mix);

    return this.voice(
      [tone, edge, vibrato, breath],
      mix,
      (gain, t) => {
        gain.linearRampToValueAtTime(VOICE_PEAK * 1.25, t + 0.09);
        gain.setTargetAtTime(VOICE_PEAK * 1.05, t + 0.09, 0.4);
      },
      0.2,
    );
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
      }
    }
    return buffer;
  }
}
