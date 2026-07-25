export interface MesaWindFrame {
  /** Normalized horizontal wind direction in world space. */
  directionX: number;
  directionZ: number;
  /** Overall wind energy in [0, 1]. */
  strength: number;
  /** Slow gust envelope in [0, 1]. */
  gust: number;
  /** Faster, smaller-scale variation in [0, 1]. */
  turbulence: number;
  /** Approximate near-ground air speed in metres per second. */
  speed: number;
  elapsed: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * One deterministic wind model shared by particles and sound.
 *
 * Weather alternates between held conditions and long, eased transitions.
 * This makes room for genuinely still periods instead of continuously adding
 * several oscillators around a permanently windy baseline. Smaller breaths
 * and gust clusters animate each active condition without allowing them to
 * overpower its overall energy.
 */
export class MesaWind {
  private elapsed = 0;
  private weatherStrength = 0.26;
  private weatherFrom = 0.26;
  private weatherTarget = 0.26;
  private transitionElapsed = 0;
  private transitionDuration = 0;
  private holdRemaining = 9;
  private phasesSinceCalm = 3;
  private randomState = 0x9e3779b9;

  update(
    dt: number,
    x: number,
    z: number,
    mode: 'day' | 'goldenHour' | 'night',
  ): MesaWindFrame {
    const step = Math.min(dt, 0.1);
    this.elapsed += step;
    this.advanceWeather(step);
    const t = this.elapsed;

    const longBreath =
      Math.sin(t * 0.071 + 0.8) * 0.5 +
      Math.sin(t * 0.029 - 1.4) * 0.32 +
      Math.sin(t * 0.013 + 2.1) * 0.18;
    const gustCarrier = Math.max(0, Math.sin(t * 0.113 - 0.65));
    const gustCluster = Math.pow(gustCarrier, 2.6) * (0.72 + 0.28 * Math.sin(t * 0.47 + 0.4));
    const localBreath = Math.sin(x * 0.012 - z * 0.009 + t * 0.041) * 0.055;
    const lightScale = mode === 'goldenHour' ? 1.06 : mode === 'night' ? 0.9 : 1;
    const breathScale = Math.max(0.72, 0.9 + longBreath * 0.16 + localBreath);
    const sustained = this.weatherStrength * lightScale * breathScale;
    const gustEnergy = gustCluster * smoothstep(0.16, 0.62, sustained);
    const strength = clamp01(
      sustained + gustEnergy * (0.055 + this.weatherStrength * 0.11),
    );
    const gust = clamp01(gustEnergy * (0.32 + strength * 0.44));
    const windPresence = smoothstep(0.015, 0.18, strength);
    const turbulence = clamp01(
      windPresence *
        (0.24 +
          0.18 * Math.sin(t * 0.83 + 1.7) +
          0.11 * Math.sin(t * 1.91 - 0.2) +
          gust * 0.3),
    );

    // Predominantly west-to-east, wandering by about twelve degrees.
    const angle =
      -0.34 +
      Math.sin(t * 0.021 + 0.5) * 0.14 +
      Math.sin(t * 0.057 - 1.1) * 0.055;

    return {
      directionX: Math.cos(angle),
      directionZ: Math.sin(angle),
      strength,
      gust,
      turbulence,
      speed:
        strength < 0.005
          ? 0
          : strength * (1.1 + strength * 8.5) + gust * 1.6,
      elapsed: t,
    };
  }

  /**
   * A seeded weather sequencer keeps the experience reproducible while still
   * varying the order and length of breezes. At most three active phases can
   * pass without a calm interval.
   */
  private advanceWeather(dt: number): void {
    if (this.transitionDuration > 0) {
      this.transitionElapsed = Math.min(
        this.transitionElapsed + dt,
        this.transitionDuration,
      );
      const progress = this.transitionElapsed / this.transitionDuration;
      const eased = progress * progress * (3 - 2 * progress);
      this.weatherStrength =
        this.weatherFrom + (this.weatherTarget - this.weatherFrom) * eased;

      if (progress >= 1) {
        this.transitionDuration = 0;
        this.weatherStrength = this.weatherTarget;
        this.holdRemaining =
          this.weatherTarget === 0
            ? 11 + this.random() * 9
            : 9 + this.random() * 15;
      }
      return;
    }

    this.holdRemaining -= dt;
    if (this.holdRemaining > 0) return;

    this.weatherFrom = this.weatherStrength;
    this.weatherTarget = this.nextWeatherStrength();
    this.transitionElapsed = 0;
    const change = Math.abs(this.weatherTarget - this.weatherFrom);
    this.transitionDuration =
      4.5 + this.random() * 3.5 + change * 4.5;
  }

  private nextWeatherStrength(): number {
    const roll = this.random();
    const shouldCalm =
      this.phasesSinceCalm >= 3 ||
      (this.phasesSinceCalm > 0 && roll < 0.2);

    if (shouldCalm) {
      this.phasesSinceCalm = 0;
      return 0;
    }

    this.phasesSinceCalm++;
    if (roll < 0.42) return 0.12 + this.random() * 0.13;
    if (roll < 0.84) return 0.27 + this.random() * 0.22;
    return 0.5 + this.random() * 0.14;
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}
