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
 * The low frequencies make weather-sized breaths, while the two quicker
 * components stop the motion from feeling like a looping sine wave. A tiny
 * position term gives different parts of the mesa slightly different air
 * without allowing sight and sound to drift apart.
 */
export class MesaWind {
  private elapsed = 0;

  update(
    dt: number,
    x: number,
    z: number,
    mode: 'day' | 'goldenHour' | 'night',
  ): MesaWindFrame {
    this.elapsed += Math.min(dt, 0.1);
    const t = this.elapsed;

    const longBreath =
      Math.sin(t * 0.071 + 0.8) * 0.5 +
      Math.sin(t * 0.029 - 1.4) * 0.32 +
      Math.sin(t * 0.013 + 2.1) * 0.18;
    const gustCarrier = Math.max(0, Math.sin(t * 0.113 - 0.65));
    const gustCluster = Math.pow(gustCarrier, 2.6) * (0.72 + 0.28 * Math.sin(t * 0.47 + 0.4));
    const localDrift = Math.sin(x * 0.012 - z * 0.009 + t * 0.041) * 0.045;
    const lightBias = mode === 'goldenHour' ? 0.055 : mode === 'night' ? -0.035 : 0;

    const strength = clamp01(0.46 + longBreath * 0.19 + gustCluster * 0.31 + localDrift + lightBias);
    const gust = smoothstep(0.48, 0.86, strength) * (0.58 + gustCluster * 0.42);
    const turbulence = clamp01(
      0.34 +
        0.23 * Math.sin(t * 0.83 + 1.7) +
        0.14 * Math.sin(t * 1.91 - 0.2) +
        gust * 0.34,
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
      speed: 3.2 + strength * 11.8 + gust * 3.4,
      elapsed: t,
    };
  }
}
