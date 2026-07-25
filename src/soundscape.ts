/**
 * A position-aware generative score for Star Axis.
 *
 * No samples are downloaded. Wind, resonance, and footsteps are synthesized
 * in the browser, allowing the score to respond to location, movement,
 * elevation, and light.
 */

import {
  FRONT_CHAMBER_DEPTH,
  PYRAMID_BASE_Y,
  PYRAMID_CENTER,
  PYRAMID_FRONT_Z,
  STAIR_BASE,
  STAIR_TOP,
} from './staraxis/constants';

export type SoundscapeMode = 'day' | 'goldenHour' | 'night';

export interface SoundscapeFrame {
  x: number;
  y: number;
  z: number;
  dt: number;
  mode: SoundscapeMode;
  moving: boolean;
  windStrength: number;
  windGust: number;
  windTurbulence: number;
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
  private windBody: Layer | null = null;
  private windMid: Layer | null = null;
  private windGust: Layer | null = null;
  private sandHiss: Layer | null = null;
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
      smoothstep(STAIR_BASE.z - 2, STAIR_BASE.z + 1, z) *
      smoothstep(STAIR_TOP.z + 3, STAIR_TOP.z - 1, z);
    const tunnelDepth = stairAxis * stairRun;
    const aperture =
      stairAxis *
      smoothstep(STAIR_TOP.z - 5, STAIR_TOP.z - 1, z) *
      smoothstep(STAIR_TOP.z + 4, STAIR_TOP.z + 1, z);
    const pyramidDistance = Math.hypot(x - PYRAMID_CENTER.x, z - PYRAMID_CENTER.z);
    const solar = smoothstep(34, 10, pyramidDistance);
    const hour =
      smoothstep(2.2, 0.9, Math.abs(x - PYRAMID_CENTER.x)) *
      smoothstep(PYRAMID_FRONT_Z - FRONT_CHAMBER_DEPTH - 2, PYRAMID_FRONT_Z - FRONT_CHAMBER_DEPTH + 1, z) *
      smoothstep(PYRAMID_FRONT_Z + 3, PYRAMID_FRONT_Z, z) *
      smoothstep(PYRAMID_BASE_Y - 2, PYRAMID_BASE_Y + 2, y) *
      smoothstep(PYRAMID_BASE_Y + 18, PYRAMID_BASE_Y + 14, y);
    const entry =
      smoothstep(14, 7, Math.abs(x)) *
      smoothstep(70, 56, z) *
      smoothstep(PYRAMID_FRONT_Z - 1, PYRAMID_FRONT_Z + 4, z);
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
      const wind = clamp(frame.windStrength);
      const gust = clamp(frame.windGust);
      const turbulence = clamp(frame.windTurbulence);
      const openAir = 1 - enclosed * 0.86;
      const windPresence = smoothstep(0.015, 0.16, wind);
      const sandLift = smoothstep(0.16, 0.56, wind);

      // Four complementary noise bands share the visual wind envelope.
      // All four close fully during a calm; gusts only brighten active air.
      this.setLayer(
        this.windBody,
        windPresence *
          (wind * 0.082 + gust * 0.022 + height * wind * 0.01) *
          (0.4 + openAir * 0.6),
        0.75,
      );
      this.setLayer(
        this.windMid,
        windPresence *
          (wind * 0.057 + gust * 0.032 + movementAir * wind * 0.006) *
          (0.26 + openAir * 0.74),
        0.48,
      );
      this.setLayer(
        this.windGust,
        windPresence * (gust * 0.078 + wind * wind * 0.011) * openAir,
        0.32,
      );
      this.setLayer(
        this.sandHiss,
        sandLift *
          (wind * 0.008 + gust * 0.022 + turbulence * 0.005) *
          openAir,
        0.25,
      );
      this.setLayer(
        this.highAir,
        windPresence *
          (wind * 0.01 + height * wind * 0.016 + night * wind * 0.002) *
          (0.35 + openAir * 0.65),
        0.65,
      );
      if (this.windBody?.filter) {
        this.windBody.filter.frequency.setTargetAtTime(
          250 + wind * 165 + gust * 75 - enclosed * 120,
          now,
          0.8,
        );
      }
      if (this.windMid?.filter) {
        this.windMid.filter.frequency.setTargetAtTime(
          570 + height * 150 + wind * 300 + gold * 90 - enclosed * 280,
          now,
          0.54,
        );
      }
      if (this.windGust?.filter) {
        this.windGust.filter.frequency.setTargetAtTime(
          180 + wind * 240 + gust * 170,
          now,
          0.38,
        );
      }
      if (this.sandHiss?.filter) {
        this.sandHiss.filter.frequency.setTargetAtTime(
          2050 + wind * 1250 + turbulence * 850,
          now,
          0.42,
        );
      }
      this.setLayer(this.earth, 0.026 + enclosed * 0.026 + night * 0.012, 1.4);
      this.setLayer(this.chamber, 0.003 + this.tunnelAmount * 0.075 + hour * 0.052, 0.9);
      this.setLayer(this.solar, 0.002 + solar * (0.018 + gold * 0.04) + aperture * 0.012, 1.1);
      this.setLayer(this.hourPulse, 0.0005 + hour * 0.035, 1.2);
      this.reverbSend?.gain.setTargetAtTime(0.08 + enclosed * 0.75, now, 0.8);
      this.reverbReturn?.gain.setTargetAtTime(0.05 + enclosed * 0.42, now, 0.9);
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
    const masterTone = context.createBiquadFilter();
    masterTone.type = 'lowshelf';
    masterTone.frequency.value = 155;
    masterTone.gain.value = 2.8;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.65;
    master.connect(masterTone).connect(compressor).connect(context.destination);
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

    // Low body: broad brown noise keeps the air physical rather than tinny.
    const windBodySource = this.loopingNoise('brown');
    const windBodyFilter = context.createBiquadFilter();
    windBodyFilter.type = 'lowpass';
    windBodyFilter.frequency.value = 320;
    windBodyFilter.Q.value = 0.38;
    const windBodyGain = context.createGain();
    windBodyGain.gain.value = 0.0001;
    windBodySource.connect(windBodyFilter).connect(windBodyGain).connect(master);
    windBodyGain.connect(reverbSend);
    this.modulate(windBodyFilter.frequency, 320, 55, 0.021);
    this.windBody = { gain: windBodyGain, filter: windBodyFilter };

    // Mid body: pink noise supplies the surf-like breadth that a single
    // band-pass cannot produce.
    const windMidSource = this.loopingNoise('pink');
    const windMidFilter = context.createBiquadFilter();
    windMidFilter.type = 'bandpass';
    windMidFilter.frequency.value = 690;
    windMidFilter.Q.value = 0.34;
    const windMidGain = context.createGain();
    windMidGain.gain.value = 0.0001;
    windMidSource.connect(windMidFilter).connect(windMidGain).connect(master);
    windMidGain.connect(reverbSend);
    this.modulate(windMidFilter.frequency, 690, 95, 0.043);
    this.windMid = { gain: windMidGain, filter: windMidFilter };

    // Gust pressure: a low, moving band that arrives with visible sand sheets.
    const gustSource = this.loopingNoise('pink');
    const gustHigh = context.createBiquadFilter();
    gustHigh.type = 'highpass';
    gustHigh.frequency.value = 58;
    const gustFilter = context.createBiquadFilter();
    gustFilter.type = 'bandpass';
    gustFilter.frequency.value = 260;
    gustFilter.Q.value = 0.62;
    const gustGain = context.createGain();
    gustGain.gain.value = 0.002;
    gustSource.connect(gustHigh).connect(gustFilter).connect(gustGain).connect(master);
    gustGain.connect(reverbSend);
    this.modulate(gustFilter.frequency, 260, 82, 0.089);
    this.windGust = { gain: gustGain, filter: gustFilter };

    // A narrow granular band makes airborne sand audible without turning the
    // whole wind bed into treble hiss.
    const sandSource = this.loopingNoise('white');
    const sandHigh = context.createBiquadFilter();
    sandHigh.type = 'highpass';
    sandHigh.frequency.value = 1450;
    const sandFilter = context.createBiquadFilter();
    sandFilter.type = 'bandpass';
    sandFilter.frequency.value = 2700;
    sandFilter.Q.value = 0.7;
    const sandGain = context.createGain();
    sandGain.gain.value = 0.0001;
    sandSource.connect(sandHigh).connect(sandFilter).connect(sandGain).connect(master);
    this.sandHiss = { gain: sandGain, filter: sandFilter };

    // Fine airborne altitude is now only the top octave, not the main wind.
    const airSource = this.loopingNoise('white');
    const airHigh = context.createBiquadFilter();
    airHigh.type = 'highpass';
    airHigh.frequency.value = 3300;
    const airLow = context.createBiquadFilter();
    airLow.type = 'lowpass';
    airLow.frequency.value = 8200;
    const airGain = context.createGain();
    airGain.gain.value = 0.0001;
    airSource.connect(airHigh).connect(airLow).connect(airGain).connect(master);
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

  private loopingNoise(color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    if (!this.context) throw new Error('Audio context not initialized');
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(2, sampleRate * 5, sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      let pink0 = 0;
      let pink1 = 0;
      let pink2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'brown') {
          last = (last + 0.018 * white) / 1.018;
          data[i] = last * 3.5;
        } else if (color === 'pink') {
          // Paul Kellet's lightweight three-pole approximation. Independent
          // state per channel preserves a wide stereo image.
          pink0 = 0.99765 * pink0 + white * 0.099046;
          pink1 = 0.963 * pink1 + white * 0.2965164;
          pink2 = 0.57 * pink2 + white * 1.0526913;
          data[i] = (pink0 + pink1 + pink2 + white * 0.1848) * 0.14;
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

}
