/**
 * A position-aware generative score for Star Axis.
 *
 * No samples are downloaded. Wind, resonance, footsteps, and sparse stellar
 * tones are synthesized in the browser, allowing the score to respond to
 * location, movement, elevation, and light.
 */

import { PYRAMID_BASE_Y, PYRAMID_CENTER, STAIR_BASE, STAIR_TOP } from './staraxis/constants';

export type SoundscapeMode = 'day' | 'goldenHour' | 'night';

export interface SoundscapeFrame {
  x: number;
  y: number;
  z: number;
  dt: number;
  mode: SoundscapeMode;
  moving: boolean;
}

export interface SoundscapeSnapshot {
  started: boolean;
  audible: boolean;
  volume: number;
  place: string;
}

interface Layer {
  gain: GainNode;
  filter?: BiquadFilterNode;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function bellEnvelope(
  param: AudioParam,
  now: number,
  peak: number,
  attack: number,
  release: number,
): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(0.0001, now);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  param.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

export class StarAxisSoundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: Layer | null = null;
  private highAir: Layer | null = null;
  private earth: Layer | null = null;
  private chamber: Layer | null = null;
  private solar: Layer | null = null;
  private hourPulse: Layer | null = null;
  private reverbSend: GainNode | null = null;
  private reverbReturn: GainNode | null = null;

  private started = false;
  private audible = false;
  private volume = 0.72;
  private place = 'silent mesa';
  private listeners = new Set<(snapshot: SoundscapeSnapshot) => void>();

  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private hasLastPosition = false;
  private footTravel = 0;
  private nextFoot = 0.8;
  private lastUpdate = 0;
  private lastBellAt = 0;
  private bellIntensity = 0;
  private tunnelAmount = 0;

  onChange(listener: (snapshot: SoundscapeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): SoundscapeSnapshot {
    return {
      started: this.started,
      audible: this.audible,
      volume: this.volume,
      place: this.place,
    };
  }

  async start(): Promise<void> {
    if (!this.context) this.build();
    if (!this.context || !this.master) return;

    await this.context.resume();
    this.started = true;
    this.audible = true;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(this.outputGain(), now + 1.8);
    this.emit();
  }

  async toggle(): Promise<void> {
    if (!this.started) {
      await this.start();
      return;
    }
    if (!this.context || !this.master) return;

    if (this.context.state === 'suspended') await this.context.resume();
    this.audible = !this.audible;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(
      this.audible ? this.outputGain() : 0.0001,
      now + (this.audible ? 0.8 : 0.35),
    );
    this.emit();
  }

  setVolume(value: number): void {
    this.volume = clamp(value);
    if (this.context && this.master && this.audible) {
      this.master.gain.setTargetAtTime(this.outputGain(), this.context.currentTime, 0.08);
    }
    this.emit();
  }

  update(frame: SoundscapeFrame): void {
    const { x, y, z, dt, mode } = frame;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dz = z - this.lastZ;
    const distance = this.hasLastPosition ? Math.hypot(dx, dy, dz) : 0;
    const teleport = distance > 7;
    this.hasLastPosition = true;
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;

    const stairAxis = smoothstep(4.2, 1.8, Math.abs(x));
    const stairRun =
      smoothstep(STAIR_BASE.z + 2, STAIR_BASE.z - 1, z) *
      smoothstep(STAIR_TOP.z - 2, STAIR_TOP.z + 3, z);
    const tunnelDepth =
      stairAxis * stairRun * smoothstep(STAIR_BASE.z - 6, STAIR_TOP.z + 8, z);
    const aperture =
      stairAxis *
      smoothstep(STAIR_TOP.z + 7, STAIR_TOP.z + 2, z) *
      smoothstep(STAIR_TOP.z - 4, STAIR_TOP.z - 1, z);
    const pyramidDistance = Math.hypot(x - PYRAMID_CENTER.x, z - PYRAMID_CENTER.z);
    const solar = smoothstep(34, 10, pyramidDistance);
    const hour =
      smoothstep(5.5, 2.8, Math.abs(x - PYRAMID_CENTER.x)) *
      smoothstep(PYRAMID_CENTER.z - 14, PYRAMID_CENTER.z - 10, z) *
      smoothstep(PYRAMID_CENTER.z + 14, PYRAMID_CENTER.z + 10, z) *
      smoothstep(PYRAMID_BASE_Y - 2, PYRAMID_BASE_Y + 2, y) *
      smoothstep(PYRAMID_BASE_Y + 14, PYRAMID_BASE_Y + 10, y);
    const entry =
      smoothstep(14, 7, Math.abs(x)) *
      smoothstep(62, 51, z) *
      smoothstep(-1, 5, z);
    this.tunnelAmount = clamp(Math.max(tunnelDepth, aperture * 0.55));

    const nextPlace =
      hour > 0.45
        ? 'the hour chamber'
        : aperture > 0.56
          ? 'the Polaris aperture'
          : tunnelDepth > 0.28
            ? 'the star tunnel'
            : solar > 0.32
              ? 'the solar pyramid'
              : entry > 0.28
                ? 'the approach'
                : y > 55
                  ? 'the high air'
                  : 'the open mesa';
    if (nextPlace !== this.place) {
      this.place = nextPlace;
      this.emit();
    }

    if (!this.context || !this.started) return;
    const now = this.context.currentTime;

    // Audio-rate targets only need refreshing about ten times per second.
    if (now - this.lastUpdate > 0.09) {
      this.lastUpdate = now;
      const night = mode === 'night' ? 1 : 0;
      const gold = mode === 'goldenHour' ? 1 : 0;
      const height = smoothstep(4, 70, y);
      const enclosed = clamp(Math.max(this.tunnelAmount, hour));
      const movementAir = clamp(distance / Math.max(dt, 0.016) / 16);

      this.setLayer(this.wind, 0.055 + height * 0.035 + gold * 0.024 + movementAir * 0.018, 0.6);
      if (this.wind?.filter) {
        this.wind.filter.frequency.setTargetAtTime(
          460 + height * 500 - enclosed * 300 + gold * 150,
          now,
          0.7,
        );
      }
      this.setLayer(this.highAir, 0.012 + height * 0.032 + night * 0.007, 0.8);
      this.setLayer(this.earth, 0.026 + enclosed * 0.026 + night * 0.012, 1.4);
      this.setLayer(this.chamber, 0.003 + this.tunnelAmount * 0.075 + hour * 0.052, 0.9);
      this.setLayer(this.solar, 0.002 + solar * (0.018 + gold * 0.04) + aperture * 0.012, 1.1);
      this.setLayer(this.hourPulse, 0.0005 + hour * 0.035, 1.2);
      this.reverbSend?.gain.setTargetAtTime(0.08 + enclosed * 0.75, now, 0.8);
      this.reverbReturn?.gain.setTargetAtTime(0.05 + enclosed * 0.42, now, 0.9);
      this.bellIntensity = clamp(night * 0.55 + aperture * 0.9 + hour * 0.35 + gold * 0.12);
    }

    if (!teleport && frame.moving && distance < 2) {
      this.footTravel += distance;
      if (this.footTravel >= this.nextFoot) {
        this.footTravel = 0;
        this.nextFoot = 0.72 + Math.random() * 0.2;
        this.step(Math.max(this.tunnelAmount, hour) > 0.25 ? 'stone' : 'caliche', now);
      }
    } else if (!frame.moving) {
      this.footTravel = Math.min(this.footTravel, 0.35);
    }

    const bellInterval = 2.8 + Math.random() * 3.8;
    if (this.bellIntensity > 0.08 && now - this.lastBellAt > bellInterval) {
      this.lastBellAt = now;
      if (Math.random() < this.bellIntensity) this.starBell(now, mode);
    }
  }

  private outputGain(): number {
    // Perceptual taper with conservative headroom for headphones.
    return 0.42 * this.volume * this.volume;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private setLayer(layer: Layer | null, value: number, timeConstant: number): void {
    if (!layer || !this.context) return;
    layer.gain.gain.setTargetAtTime(Math.max(0.0001, value), this.context.currentTime, timeConstant);
  }

  private build(): void {
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    this.context = context;

    const master = context.createGain();
    master.gain.value = 0.0001;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.65;
    master.connect(compressor).connect(context.destination);
    this.master = master;

    const reverbSend = context.createGain();
    reverbSend.gain.value = 0.08;
    const convolver = context.createConvolver();
    convolver.buffer = this.impulse(4.8, 3.2);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.06;
    reverbSend.connect(convolver).connect(reverbReturn).connect(master);
    this.reverbSend = reverbSend;
    this.reverbReturn = reverbReturn;

    // Wide, surf-like mesa wind: slow modulation turns noise into long breaths.
    const windSource = this.loopingNoise('brown');
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.46;
    const windGain = context.createGain();
    windGain.gain.value = 0.055;
    windSource.connect(windFilter).connect(windGain).connect(master);
    windGain.connect(reverbSend);
    this.modulate(windGain.gain, 0.055, 0.022, 0.071);
    this.wind = { gain: windGain, filter: windFilter };

    // Fine airborne grit and altitude.
    const airSource = this.loopingNoise('white');
    const airHigh = context.createBiquadFilter();
    airHigh.type = 'highpass';
    airHigh.frequency.value = 2400;
    const airLow = context.createBiquadFilter();
    airLow.type = 'lowpass';
    airLow.frequency.value = 6900;
    const airGain = context.createGain();
    airGain.gain.value = 0.012;
    airSource.connect(airHigh).connect(airLow).connect(airGain).connect(master);
    this.modulate(airGain.gain, 0.014, 0.007, 0.113);
    this.highAir = { gain: airGain, filter: airLow };

    // An almost-felt fundamental: fifty years of labor under 26,000 years.
    const earthGain = context.createGain();
    earthGain.gain.value = 0.025;
    const earthLow = context.createBiquadFilter();
    earthLow.type = 'lowpass';
    earthLow.frequency.value = 180;
    earthLow.Q.value = 0.7;
    [36.71, 55.0, 73.42].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 2 ? 3 : -2;
      const partial = context.createGain();
      partial.gain.value = [0.34, 0.16, 0.08][index];
      oscillator.connect(partial).connect(earthLow);
      oscillator.start();
    });
    earthLow.connect(earthGain).connect(master);
    earthGain.connect(reverbSend);
    this.earth = { gain: earthGain, filter: earthLow };

    // Ross's hum, translated into open fifths that bloom in the tunnel.
    const chamberGain = context.createGain();
    chamberGain.gain.value = 0.001;
    const chamberFilter = context.createBiquadFilter();
    chamberFilter.type = 'lowpass';
    chamberFilter.frequency.value = 520;
    chamberFilter.Q.value = 1.4;
    [73.42, 110.0, 146.83, 220.0].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [-4, 2, 0, 5][index];
      const partial = context.createGain();
      partial.gain.value = [0.32, 0.19, 0.11, 0.045][index];
      oscillator.connect(partial).connect(chamberFilter);
      oscillator.start();
    });
    chamberFilter.connect(chamberGain).connect(master);
    chamberGain.connect(reverbSend);
    this.modulate(chamberGain.gain, 0.03, 0.014, 0.052);
    this.chamber = { gain: chamberGain, filter: chamberFilter };

    // Warm solar partials, strongest when the pyramid turns tangerine.
    const solarGain = context.createGain();
    solarGain.gain.value = 0.001;
    const solarFilter = context.createBiquadFilter();
    solarFilter.type = 'bandpass';
    solarFilter.frequency.value = 330;
    solarFilter.Q.value = 1.1;
    [110, 165, 247.5, 330].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index < 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      const partial = context.createGain();
      partial.gain.value = [0.13, 0.09, 0.045, 0.025][index];
      oscillator.connect(partial).connect(solarFilter);
      oscillator.start();
    });
    solarFilter.connect(solarGain).connect(master);
    solarGain.connect(reverbSend);
    this.solar = { gain: solarGain, filter: solarFilter };

    // The Hour Chamber does not tick. It breathes once every thirty seconds.
    const hourGain = context.createGain();
    hourGain.gain.value = 0.0001;
    const hourBreath = context.createGain();
    hourBreath.gain.value = 0;
    const hourOsc = context.createOscillator();
    hourOsc.type = 'sine';
    hourOsc.frequency.value = 55;
    const hourLfo = context.createOscillator();
    hourLfo.frequency.value = 1 / 30;
    const hourLfoGain = context.createGain();
    hourLfoGain.gain.value = 0.45;
    const hourBias = context.createConstantSource();
    hourBias.offset.value = 0.55;
    hourLfo.connect(hourLfoGain).connect(hourBreath.gain);
    hourBias.connect(hourBreath.gain);
    hourOsc.connect(hourBreath).connect(hourGain).connect(reverbSend);
    hourOsc.start();
    hourLfo.start();
    hourBias.start();
    this.hourPulse = { gain: hourGain };
  }

  private loopingNoise(color: 'white' | 'brown'): AudioBufferSourceNode {
    if (!this.context) throw new Error('Audio context not initialized');
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(2, sampleRate * 5, sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'brown') {
          last = (last + 0.018 * white) / 1.018;
          data[i] = last * 3.5;
        } else {
          data[i] = white * 0.55;
        }
      }
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    return source;
  }

  private impulse(duration: number, decay: number): AudioBuffer {
    if (!this.context) throw new Error('Audio context not initialized');
    const length = Math.floor(this.context.sampleRate * duration);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const time = i / length;
        const earlyReflection = i < 4200 && Math.random() > 0.985 ? 1.8 : 1;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - time, decay) * earlyReflection;
      }
    }
    return impulse;
  }

  private modulate(param: AudioParam, center: number, depth: number, frequency: number): void {
    if (!this.context) return;
    param.value = center;
    const lfo = this.context.createOscillator();
    const amount = this.context.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = frequency;
    amount.gain.value = depth;
    lfo.connect(amount).connect(param);
    lfo.start();
  }

  private step(material: 'stone' | 'caliche', now: number): void {
    if (!this.context || !this.master) return;
    const length = Math.floor(this.context.sampleRate * 0.16);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const falloff = Math.pow(1 - i / length, material === 'stone' ? 9 : 4);
      data[i] = (Math.random() * 2 - 1) * falloff;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = material === 'stone' ? 1150 : 520 + Math.random() * 400;
    filter.Q.value = material === 'stone' ? 1.6 : 0.7;
    const gain = this.context.createGain();
    gain.gain.value = material === 'stone' ? 0.022 : 0.014;
    source.connect(filter).connect(gain).connect(this.master);
    if (material === 'stone' && this.reverbSend) gain.connect(this.reverbSend);
    source.start(now);

    if (material === 'stone') {
      const knock = this.context.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(112 + Math.random() * 30, now);
      knock.frequency.exponentialRampToValueAtTime(72, now + 0.12);
      const knockGain = this.context.createGain();
      bellEnvelope(knockGain.gain, now, 0.012, 0.005, 0.14);
      knock.connect(knockGain).connect(this.reverbSend ?? this.master);
      knock.start(now);
      knock.stop(now + 0.2);
    }
  }

  private starBell(now: number, mode: SoundscapeMode): void {
    if (!this.context || !this.master) return;
    const scale = [293.66, 367, 440, 587.33, 660, 880];
    const base = scale[Math.floor(Math.random() * scale.length)] * (mode === 'night' ? 1 : 0.5);
    const pan = this.context.createStereoPanner();
    pan.pan.value = Math.random() * 1.5 - 0.75;
    const bus = this.context.createGain();
    pan.connect(bus);
    bus.connect(this.master);
    if (this.reverbSend) bus.connect(this.reverbSend);

    [1, 2.003, 3.01].forEach((ratio, index) => {
      const oscillator = this.context!.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = base * ratio;
      oscillator.detune.value = (Math.random() - 0.5) * 8;
      const gain = this.context!.createGain();
      bellEnvelope(
        gain.gain,
        now + index * 0.025,
        this.bellIntensity * [0.018, 0.007, 0.0035][index],
        0.02,
        2.6 + index * 0.8,
      );
      oscillator.connect(gain).connect(pan);
      oscillator.start(now);
      oscillator.stop(now + 5.5);
    });
  }
}
