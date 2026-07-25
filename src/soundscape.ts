/**
 * A position-aware generative score for Star Axis.
 *
 * No samples are downloaded. Wind, resonance, and footsteps are synthesized
 * in the browser, allowing the score to respond to location, movement,
 * elevation, and light.
 *
 * The field is genuinely spatial: the WebAudio listener tracks the camera, and
 * the monument's voices are placed at their real coordinates, so the Pyramid
 * sits ahead of you on the approach and swings past your shoulder as you turn.
 * Two reverbs — open mesa air and long stone — crossfade as the Star Tunnel
 * closes around the visitor.
 */

import {
  APERTURE_CENTER_Y,
  APERTURE_REAR_Z,
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
  /** Prevailing wind direction, so gusts arrive from the side they blow from. */
  windDirectionX: number;
  windDirectionZ: number;
  /** Camera facing, used to orient the listener. */
  forwardX: number;
  forwardY: number;
  forwardZ: number;
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

type NoiseColor = 'white' | 'pink' | 'brown';

/** Voices placed in the world rather than mixed flat into the bed. */
interface PlacedVoice extends Layer {
  panner: PannerNode;
}

/** D-pentatonic. Ross's hum, read as a scale the mesa can sing back. */
const AEOLIAN_TONES = [220, 293.66, 329.63, 440, 587.33];
/** A quieter, wider set for the sparse struck tones. */
const BELL_TONES = [146.83, 220, 293.66, 329.63, 440];

const NOISE_SECONDS = 9;

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
  private enclosureTone: BiquadFilterNode | null = null;
  private windBody: Layer | null = null;
  private windMid: Layer | null = null;
  private windGust: Layer | null = null;
  private gustPan: StereoPannerNode | null = null;
  private sandHiss: Layer | null = null;
  private highAir: Layer | null = null;
  private earth: Layer | null = null;
  private chamber: Layer | null = null;
  private aeolian: Layer | null = null;
  private aeolianBank: BiquadFilterNode[] = [];
  private nightShimmer: Layer | null = null;
  private solar: PlacedVoice | null = null;
  private hourPulse: PlacedVoice | null = null;
  private polaris: PlacedVoice | null = null;
  private avenue: PlacedVoice | null = null;
  private airSend: GainNode | null = null;
  private airReturn: GainNode | null = null;
  private stoneSend: GainNode | null = null;
  private stoneReturn: GainNode | null = null;

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
  private footSide = 1;
  private nextFoot = 0.8;
  private lastUpdate = 0;
  private tunnelAmount = 0;
  private noiseBuffers = new Map<NoiseColor, AudioBuffer>();
  private nextBell = 0;
  private lastGust = 0;
  private nextWhoosh = 0;
  private analyser: AnalyserNode | null = null;
  private meterBuffer: Float32Array<ArrayBuffer> | null = null;

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

  /** Post-compressor peak and RMS, for checking headroom without ears. */
  meter(): { peak: number; rms: number } {
    if (!this.analyser || !this.meterBuffer) return { peak: 0, rms: 0 };
    this.analyser.getFloatTimeDomainData(this.meterBuffer);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < this.meterBuffer.length; i++) {
      const sample = this.meterBuffer[i];
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
    }
    return { peak, rms: Math.sqrt(sum / this.meterBuffer.length) };
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
    // A long dawn: the score should arrive like weather, not like a switch.
    this.master.gain.exponentialRampToValueAtTime(this.outputGain(), now + 3.4);
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
      now + (this.audible ? 1.2 : 0.4),
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
    // North is -Z, so the stair runs from STAIR_BASE.z *down* to STAIR_TOP.z.
    // Both of these edges used to be written the other way round, which made
    // the two factors disjoint and pinned tunnelDepth at zero for the whole
    // 147-step climb — the stone hum and the enclosed reverb never opened.
    const stairRun =
      smoothstep(STAIR_BASE.z + 1, STAIR_BASE.z - 2, z) *
      smoothstep(STAIR_TOP.z - 1, STAIR_TOP.z + 3, z);
    // The slot deepens as it climbs into the mesa. So does the enclosure.
    const climb = clamp((STAIR_BASE.z - z) / (STAIR_BASE.z - STAIR_TOP.z));
    const cutDepth = 0.42 + 0.58 * smoothstep(0.06, 0.62, climb);
    const tunnelDepth = stairAxis * stairRun * cutDepth;
    const aperture =
      stairAxis *
      smoothstep(STAIR_TOP.z - 5, STAIR_TOP.z - 1, z) *
      smoothstep(STAIR_TOP.z + 4, STAIR_TOP.z + 1, z);
    const pyramidDistance = Math.hypot(x - PYRAMID_CENTER.x, z - PYRAMID_CENTER.z);
    const solar = smoothstep(34, 10, pyramidDistance);
    // Likewise the Hour Chamber: inside means north of its rear wall and south
    // of the front face, not the empty intersection those edges described. The
    // chamber occupies the Pyramid's front half only — past its back wall you
    // are in the Upper Room, which has its own voice.
    const chamberRearZ = PYRAMID_CENTER.z - 3;
    const hour =
      smoothstep(2.2, 0.9, Math.abs(x - PYRAMID_CENTER.x)) *
      smoothstep(chamberRearZ + 1, chamberRearZ - 2, z) *
      smoothstep(PYRAMID_FRONT_Z, PYRAMID_FRONT_Z + 3, z) *
      smoothstep(PYRAMID_BASE_Y - 2, PYRAMID_BASE_Y + 2, y) *
      smoothstep(PYRAMID_BASE_Y + 18, PYRAMID_BASE_Y + 14, y);
    const entry =
      smoothstep(14, 7, Math.abs(x)) *
      smoothstep(70, 56, z) *
      smoothstep(PYRAMID_FRONT_Z - 1, PYRAMID_FRONT_Z + 4, z);
    this.tunnelAmount = clamp(Math.max(tunnelDepth, aperture * 0.6));

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

    this.placeListener(frame, now);

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

      // The wind arrives from somewhere. Project the prevailing direction onto
      // the listener's right-hand axis so a gust crosses the head rather than
      // sitting in the middle of it.
      if (this.gustPan) {
        const forwardLength =
          Math.hypot(frame.forwardX, frame.forwardZ) || 1;
        const fx = frame.forwardX / forwardLength;
        const fz = frame.forwardZ / forwardLength;
        // right = forward × up, with up = +Y.
        const lateral = frame.windDirectionX * -fz + frame.windDirectionZ * fx;
        this.gustPan.pan.setTargetAtTime(clamp(lateral, -0.85, 0.85), now, 0.9);
      }

      // The mesa sings. High-Q bands over the wind noise turn a gust into
      // pitch; stone closes around it and the singing gains body.
      this.setLayer(
        this.aeolian,
        windPresence * Math.pow(wind, 1.5) * (0.03 + enclosed * 0.062) +
          gust * enclosed * 0.02,
        0.9,
      );
      this.setLayer(this.earth, 0.026 + enclosed * 0.026 + night * 0.012, 1.4);
      this.setLayer(this.chamber, 0.003 + this.tunnelAmount * 0.075 + hour * 0.052, 0.9);
      this.setLayer(this.nightShimmer, 0.0004 + night * (0.005 + height * 0.004), 2.2);

      // Placed voices keep a steady output and let distance do the work; only
      // the light and the enclosure shape them.
      this.setLayer(this.solar, 0.02 + gold * 0.05 + night * -0.008, 1.1);
      this.setLayer(this.hourPulse, 0.012 + hour * 0.03, 1.2);
      this.setLayer(this.polaris, 0.004 + night * 0.02 + aperture * 0.012, 1.6);
      this.setLayer(this.avenue, 0.016 + entry * 0.02, 1.2);

      // Open air stays bright and short; stone answers long and dark.
      this.airSend?.gain.setTargetAtTime(0.12 + openAir * 0.16, now, 0.8);
      this.airReturn?.gain.setTargetAtTime(0.16 * openAir + 0.04, now, 0.9);
      this.stoneSend?.gain.setTargetAtTime(0.04 + enclosed * 0.82, now, 0.8);
      this.stoneReturn?.gain.setTargetAtTime(0.05 + enclosed * 0.5, now, 0.9);
      // Stone absorbs the top octave. Losing it is most of what "inside"
      // sounds like.
      this.enclosureTone?.gain.setTargetAtTime(-1.5 - enclosed * 6.5, now, 0.9);

      this.maybeGustWhoosh(gust, frame, now);
      this.maybeBell(now, enclosed, solar, night, gold);
    }

    if (!teleport && frame.moving && distance < 2) {
      this.footTravel += distance;
      if (this.footTravel >= this.nextFoot) {
        this.footTravel = 0;
        this.nextFoot = 0.72 + Math.random() * 0.2;
        this.footSide = -this.footSide;
        this.step(Math.max(this.tunnelAmount, hour) > 0.25 ? 'stone' : 'caliche', now);
      }
    } else if (!frame.moving) {
      this.footTravel = Math.min(this.footTravel, 0.35);
    }

  }

  private outputGain(): number {
    // Perceptual taper. The bed is deliberately quiet, but the old ceiling put
    // an open-mesa calm near -45 dBFS — inaudible without the system volume at
    // maximum, which then made the Star Tunnel painful. A limiter now guards
    // the top, so the whole score can sit a useful distance above the floor.
    return 1.5 * this.volume * this.volume;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private setLayer(layer: Layer | null, value: number, timeConstant: number): void {
    if (!layer || !this.context) return;
    layer.gain.gain.setTargetAtTime(Math.max(0.0001, value), this.context.currentTime, timeConstant);
  }

  /**
   * Keep the WebAudio listener on the camera. Without this every panner would
   * collapse to a fixed bearing and the whole field would rotate with the head
   * instead of staying put in the landscape.
   */
  private placeListener(frame: SoundscapeFrame, now: number): void {
    const listener = this.context?.listener;
    if (!listener) return;

    const length = Math.hypot(frame.forwardX, frame.forwardY, frame.forwardZ) || 1;
    const fx = frame.forwardX / length;
    const fy = frame.forwardY / length;
    const fz = frame.forwardZ / length;
    // Re-derive an up vector by projecting world up out of the facing, so a
    // near-vertical look along the polar axis — which is exactly what the
    // aperture asks for — cannot collapse the orientation.
    let ux = -fx * fy;
    let uy = 1 - fy * fy;
    let uz = -fz * fy;
    const ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) {
      ux = 0;
      uy = 0;
      uz = fy > 0 ? -1 : 1;
    } else {
      ux /= ul;
      uy /= ul;
      uz /= ul;
    }

    if (listener.positionX) {
      const smoothing = 0.03;
      listener.positionX.setTargetAtTime(frame.x, now, smoothing);
      listener.positionY.setTargetAtTime(frame.y, now, smoothing);
      listener.positionZ.setTargetAtTime(frame.z, now, smoothing);
      listener.forwardX.setTargetAtTime(fx, now, smoothing);
      listener.forwardY.setTargetAtTime(fy, now, smoothing);
      listener.forwardZ.setTargetAtTime(fz, now, smoothing);
      listener.upX.setTargetAtTime(ux, now, smoothing);
      listener.upY.setTargetAtTime(uy, now, smoothing);
      listener.upZ.setTargetAtTime(uz, now, smoothing);
    } else {
      const legacy = listener as AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number, fy: number, fz: number,
          ux: number, uy: number, uz: number,
        ) => void;
      };
      legacy.setPosition?.(frame.x, frame.y, frame.z);
      legacy.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
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
    const enclosureTone = context.createBiquadFilter();
    enclosureTone.type = 'highshelf';
    enclosureTone.frequency.value = 3200;
    enclosureTone.gain.value = -1.5;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.65;
    // A brick wall behind the glaze: a bell landing inside the tunnel while a
    // gust crosses should never be able to clip the output.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;
    // An analyser on the way out costs nothing and makes the mix measurable
    // instead of guessed at — see meter().
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    master
      .connect(masterTone)
      .connect(enclosureTone)
      .connect(compressor)
      .connect(limiter)
      .connect(analyser);
    analyser.connect(context.destination);
    this.master = master;
    this.enclosureTone = enclosureTone;
    this.analyser = analyser;
    this.meterBuffer = new Float32Array(analyser.fftSize);

    // Two rooms, not one. Open mesa air is short, bright and wide; the Star
    // Tunnel is a long dark cylinder. Crossfading between them is most of the
    // reason walking into the stair feels like walking into stone.
    const airSend = context.createGain();
    airSend.gain.value = 0.12;
    const airVerb = context.createConvolver();
    airVerb.buffer = this.impulse(2.1, 2.6, 9000);
    const airReturn = context.createGain();
    airReturn.gain.value = 0.16;
    airSend.connect(airVerb).connect(airReturn).connect(master);
    this.airSend = airSend;
    this.airReturn = airReturn;

    const stoneSend = context.createGain();
    stoneSend.gain.value = 0.04;
    const stonePredelay = context.createDelay(0.2);
    stonePredelay.delayTime.value = 0.028;
    const stoneVerb = context.createConvolver();
    stoneVerb.buffer = this.impulse(6.4, 2.2, 1500);
    const stoneReturn = context.createGain();
    stoneReturn.gain.value = 0.05;
    stoneSend.connect(stonePredelay).connect(stoneVerb).connect(stoneReturn).connect(master);
    this.stoneSend = stoneSend;
    this.stoneReturn = stoneReturn;

    // Low body: broad brown noise keeps the air physical rather than tinny.
    const windBodySource = this.loopingNoise('brown');
    const windBodyFilter = context.createBiquadFilter();
    windBodyFilter.type = 'lowpass';
    windBodyFilter.frequency.value = 320;
    windBodyFilter.Q.value = 0.38;
    const windBodyGain = context.createGain();
    windBodyGain.gain.value = 0.0001;
    windBodySource.connect(windBodyFilter).connect(windBodyGain).connect(master);
    windBodyGain.connect(airSend);
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
    windMidGain.connect(airSend);
    this.modulate(windMidFilter.frequency, 690, 95, 0.043);
    this.windMid = { gain: windMidGain, filter: windMidFilter };

    // Gust pressure: a low, moving band that arrives with visible sand sheets,
    // steered across the stereo field by the prevailing wind.
    const gustSource = this.loopingNoise('pink');
    const gustHigh = context.createBiquadFilter();
    gustHigh.type = 'highpass';
    gustHigh.frequency.value = 58;
    const gustFilter = context.createBiquadFilter();
    gustFilter.type = 'bandpass';
    gustFilter.frequency.value = 260;
    gustFilter.Q.value = 0.62;
    const gustPan = context.createStereoPanner();
    const gustGain = context.createGain();
    gustGain.gain.value = 0.002;
    gustSource
      .connect(gustHigh)
      .connect(gustFilter)
      .connect(gustPan)
      .connect(gustGain)
      .connect(master);
    gustGain.connect(airSend);
    this.modulate(gustFilter.frequency, 260, 82, 0.089);
    this.windGust = { gain: gustGain, filter: gustFilter };
    this.gustPan = gustPan;

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

    this.buildAeolian();

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
    earthGain.connect(stoneSend);
    this.earth = { gain: earthGain, filter: earthLow };

    // Ross's hum, translated into open fifths that bloom in the tunnel. This
    // one stays un-panned on purpose: inside the stair the sound has no
    // bearing, it is simply everywhere.
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
    chamberGain.connect(stoneSend);
    this.modulate(chamberGain.gain, 0.03, 0.014, 0.052);
    this.chamber = { gain: chamberGain, filter: chamberFilter };

    this.buildPlacedVoices();

    // Night air over the mesa: a very quiet high cluster that only the dark
    // brings out, beating slowly against itself like heat leaving stone.
    const shimmerGain = context.createGain();
    shimmerGain.gain.value = 0.0001;
    const shimmerLow = context.createBiquadFilter();
    shimmerLow.type = 'lowpass';
    shimmerLow.frequency.value = 2600;
    [880, 1108.73, 1318.51, 1760].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [0, 6, -5, 3][index];
      const partial = context.createGain();
      partial.gain.value = 0.0001;
      this.modulate(partial.gain, [0.09, 0.06, 0.045, 0.025][index], [0.07, 0.05, 0.04, 0.02][index], 0.031 + index * 0.017);
      oscillator.connect(partial).connect(shimmerLow);
      oscillator.start();
    });
    shimmerLow.connect(shimmerGain).connect(master);
    shimmerGain.connect(airSend);
    this.nightShimmer = { gain: shimmerGain, filter: shimmerLow };
  }

  /**
   * A bank of very narrow bands over the wind noise. Noise through a high-Q
   * resonator is how a canyon, a slot, or the gap between two stones actually
   * makes a pitch — nothing here is an oscillator pretending to be wind.
   */
  private buildAeolian(): void {
    const context = this.context;
    if (!context || !this.master) return;

    const source = this.loopingNoise('pink', 1.04);
    const output = context.createGain();
    output.gain.value = 0.0001;

    AEOLIAN_TONES.forEach((frequency, index) => {
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = 24 + index * 4;
      const voice = context.createGain();
      voice.gain.value = [1, 0.72, 0.55, 0.4, 0.24][index];
      const pan = context.createStereoPanner();
      pan.pan.value = (index / (AEOLIAN_TONES.length - 1)) * 1.4 - 0.7;
      // Each band drifts independently, so the chord never locks into a synth
      // pad; it wanders the way a real slot tone does.
      this.modulate(band.frequency, frequency, frequency * 0.012, 0.017 + index * 0.011);
      source.connect(band).connect(voice).connect(pan).connect(output);
      this.aeolianBank.push(band);
    });

    output.connect(this.master);
    if (this.stoneSend) output.connect(this.stoneSend);
    if (this.airSend) output.connect(this.airSend);
    this.aeolian = { gain: output };
  }

  /** Voices pinned to their coordinates on the site. */
  private buildPlacedVoices(): void {
    const context = this.context;
    if (!context || !this.master) return;

    // Warm solar partials, strongest when the pyramid turns tangerine.
    const solarFilter = context.createBiquadFilter();
    solarFilter.type = 'bandpass';
    solarFilter.frequency.value = 330;
    solarFilter.Q.value = 1.1;
    [110, 165, 247.5, 330].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index < 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [0, 4, -3, 6][index];
      const partial = context.createGain();
      partial.gain.value = [0.13, 0.09, 0.045, 0.025][index];
      oscillator.connect(partial).connect(solarFilter);
      oscillator.start();
    });
    this.solar = this.placeVoice(
      solarFilter,
      [PYRAMID_CENTER.x, PYRAMID_BASE_Y + 7, PYRAMID_CENTER.z],
      { ref: 16, rolloff: 1.05, max: 320 },
    );

    // The Hour Chamber does not tick. It breathes once every thirty seconds.
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
    hourOsc.connect(hourBreath);
    hourOsc.start();
    hourLfo.start();
    hourBias.start();
    this.hourPulse = this.placeVoice(
      hourBreath,
      [PYRAMID_CENTER.x, PYRAMID_BASE_Y + 3.4, PYRAMID_FRONT_Z + 2],
      { ref: 7, rolloff: 1.5, max: 140 },
    );

    // The aperture holds one high, almost-still tone: two sines a few cents
    // apart, beating about once every eight seconds. It is the only voice in
    // the score that does not move at all.
    const polarisMix = context.createGain();
    polarisMix.gain.value = 1;
    [1567.98, 1567.98, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [0, 7, -4][index];
      const partial = context.createGain();
      partial.gain.value = [0.05, 0.05, 0.03][index];
      oscillator.connect(partial).connect(polarisMix);
      oscillator.start();
    });
    this.polaris = this.placeVoice(
      polarisMix,
      [0, APERTURE_CENTER_Y, APERTURE_REAR_Z],
      { ref: 5, rolloff: 1.8, max: 110 },
    );

    // The Avenue is a cut in the ground: a hollow, boxy resonance you hear
    // before you reach the portal, and lose the moment you climb out.
    const avenueSource = this.loopingNoise('brown', 0.96);
    const avenueBand = context.createBiquadFilter();
    avenueBand.type = 'bandpass';
    avenueBand.frequency.value = 132;
    avenueBand.Q.value = 5.5;
    const avenueTail = context.createBiquadFilter();
    avenueTail.type = 'lowpass';
    avenueTail.frequency.value = 700;
    avenueSource.connect(avenueBand).connect(avenueTail);
    this.modulate(avenueBand.frequency, 132, 16, 0.037);
    this.avenue = this.placeVoice(
      avenueTail,
      [0, 3.5, 42],
      { ref: 12, rolloff: 1.6, max: 180 },
    );
  }

  /**
   * Wrap a source in a gain and a positioned panner. Distance carries the
   * level, so the per-frame envelopes only have to describe the light.
   */
  private placeVoice(
    source: AudioNode,
    [x, y, z]: [number, number, number],
    distance: { ref: number; rolloff: number; max: number },
  ): PlacedVoice | null {
    const context = this.context;
    if (!context || !this.master) return null;

    const gain = context.createGain();
    gain.gain.value = 0.0001;
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = distance.ref;
    panner.rolloffFactor = distance.rolloff;
    panner.maxDistance = distance.max;
    const position = panner as PannerNode & {
      setPosition?: (x: number, y: number, z: number) => void;
    };
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      position.setPosition?.(x, y, z);
    }

    source.connect(gain).connect(panner).connect(this.master);
    if (this.airSend) panner.connect(this.airSend);
    if (this.stoneSend) panner.connect(this.stoneSend);
    return { gain, panner };
  }

  private noiseBuffer(color: NoiseColor): AudioBuffer {
    if (!this.context) throw new Error('Audio context not initialized');
    const cached = this.noiseBuffers.get(color);
    if (cached) return cached;

    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(2, sampleRate * NOISE_SECONDS, sampleRate);
    const fade = Math.floor(sampleRate * 0.35);
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
      // Equal-power crossfade of the tail into the head. Without it every loop
      // boundary is a step discontinuity — an audible tick once per cycle,
      // which is exactly the sort of thing that makes a synthetic bed read as
      // synthetic.
      for (let i = 0; i < fade; i++) {
        const t = (i / fade) * (Math.PI / 2);
        const tail = data[data.length - fade + i];
        const head = data[i];
        data[data.length - fade + i] = tail * Math.cos(t) + head * Math.sin(t);
      }
    }
    this.noiseBuffers.set(color, buffer);
    return buffer;
  }

  private loopingNoise(color: NoiseColor, playbackRate = 1): AudioBufferSourceNode {
    if (!this.context) throw new Error('Audio context not initialized');
    const buffer = this.noiseBuffer(color);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    // One buffer per colour, many readers: a random entry point keeps layers
    // that share a buffer from correlating into a single mono-sounding band.
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  /** @param tone lowpass corner applied while generating, in Hz. */
  private impulse(duration: number, decay: number, tone: number): AudioBuffer {
    if (!this.context) throw new Error('Audio context not initialized');
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.context.createBuffer(2, length, sampleRate);
    const coefficient = Math.exp((-2 * Math.PI * tone) / sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let state = 0;
      for (let i = 0; i < length; i++) {
        const time = i / length;
        const earlyReflection = i < 4200 && Math.random() > 0.985 ? 1.8 : 1;
        state = (Math.random() * 2 - 1) * (1 - coefficient) + state * coefficient;
        data[i] = state * Math.pow(1 - time, decay) * earlyReflection;
      }
      // The one-pole above loses most of the level; normalize so the two
      // reverbs can be balanced by their sends rather than by guesswork.
      let peak = 0;
      for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
      if (peak > 0) {
        const scale = 0.72 / peak;
        for (let i = 0; i < length; i++) data[i] *= scale;
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

  /**
   * A gust that crosses the site rather than one that merely gets louder: a
   * band sweeping upward while it travels from the windward ear to the other.
   */
  private maybeGustWhoosh(gust: number, frame: SoundscapeFrame, now: number): void {
    const rising = gust - this.lastGust;
    this.lastGust = gust;
    if (!this.context || !this.master || !this.audible) return;
    if (gust < 0.42 || rising < 0.012 || now < this.nextWhoosh) return;
    this.nextWhoosh = now + 5.5 + Math.random() * 7;

    const context = this.context;
    const duration = 2.4 + Math.random() * 1.9;
    const source = this.loopingNoise('pink');
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(190, now);
    band.frequency.exponentialRampToValueAtTime(620 + gust * 500, now + duration * 0.45);
    band.frequency.exponentialRampToValueAtTime(150, now + duration);
    band.Q.value = 1.1;
    const pan = context.createStereoPanner();
    const forwardLength = Math.hypot(frame.forwardX, frame.forwardZ) || 1;
    const lateral = clamp(
      (frame.windDirectionX * -frame.forwardZ + frame.windDirectionZ * frame.forwardX) /
        forwardLength,
      -1,
      1,
    );
    pan.pan.setValueAtTime(clamp(-lateral, -1, 1) * 0.85, now);
    pan.pan.linearRampToValueAtTime(clamp(lateral, -1, 1) * 0.85, now + duration);
    const gain = context.createGain();
    bellEnvelope(gain.gain, now, 0.03 * gust, duration * 0.42, duration * 0.58);
    source.connect(band).connect(pan).connect(gain).connect(this.master);
    if (this.airSend) gain.connect(this.airSend);
    source.stop(now + duration + 0.2);
  }

  /**
   * Sparse struck tones. Far apart on the open mesa, closer together in stone,
   * and never on a grid — the site is not keeping time, it is keeping a
   * calendar.
   */
  private maybeBell(
    now: number,
    enclosed: number,
    solar: number,
    night: number,
    gold: number,
  ): void {
    if (!this.context || !this.master || !this.audible) return;
    if (this.nextBell === 0) {
      this.nextBell = now + 12 + Math.random() * 14;
      return;
    }
    if (now < this.nextBell) return;

    const density = 0.25 + enclosed * 0.5 + solar * 0.25;
    this.nextBell = now + 34 - density * 20 + Math.random() * 22;

    const context = this.context;
    const root = BELL_TONES[Math.floor(Math.random() * BELL_TONES.length)];
    const decay = 5.5 + enclosed * 4.5 + night * 2;
    const peak = 0.016 + enclosed * 0.012 + gold * 0.006;
    const pan = context.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.6;
    const voice = context.createGain();
    voice.gain.value = 1;
    // Three partials with a touch of inharmonicity: struck stone, not a
    // tuning fork.
    [1, 2.004, 3.011].forEach((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = root * ratio;
      oscillator.detune.value = (Math.random() * 2 - 1) * 6;
      const partial = context.createGain();
      bellEnvelope(
        partial.gain,
        now,
        peak * [1, 0.34, 0.14][index],
        0.02 + index * 0.015,
        decay * [1, 0.62, 0.36][index],
      );
      oscillator.connect(partial).connect(voice);
      oscillator.start(now);
      oscillator.stop(now + decay + 0.6);
    });
    voice.connect(pan).connect(this.master);
    if (this.stoneSend) pan.connect(this.stoneSend);
    if (this.airSend) pan.connect(this.airSend);
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
    // Alternate feet. It is a small thing and it is the difference between
    // walking and a metronome.
    const pan = this.context.createStereoPanner();
    pan.pan.value = this.footSide * (0.12 + Math.random() * 0.07);
    const gain = this.context.createGain();
    gain.gain.value = material === 'stone' ? 0.022 : 0.014;
    source.connect(filter).connect(pan).connect(gain).connect(this.master);
    if (material === 'stone' && this.stoneSend) gain.connect(this.stoneSend);
    else if (this.airSend) gain.connect(this.airSend);
    source.start(now);

    if (material === 'stone') {
      const knock = this.context.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(112 + Math.random() * 30, now);
      knock.frequency.exponentialRampToValueAtTime(72, now + 0.12);
      const knockGain = this.context.createGain();
      bellEnvelope(knockGain.gain, now, 0.012, 0.005, 0.14);
      knock.connect(knockGain).connect(this.stoneSend ?? this.master);
      knock.start(now);
      knock.stop(now + 0.2);
    }
  }

}
