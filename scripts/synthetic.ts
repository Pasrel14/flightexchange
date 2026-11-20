/**
 * Vol synthétique déterministe (Annecy : décollage de la Forclaz, atterrissage à Doussard),
 * utilisé par les exemples et les jeux de conformance. Aucune donnée réelle.
 */

import type { PressureSample, TrackPoint, VectorSample } from '../src/types.ts';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAKEOFF = { lat: 45.81302, lon: 6.24651, alt: 1255 };
export const LANDING = { lat: 45.78363, lon: 6.22098, alt: 452 };
/** Ondulation du géoïde EGM2008 autour d'Annecy (m). */
export const GEOID_N = 51.3;
/** Décollage le 2026-08-14 à 11:02:00 UTC. */
export const TAKEOFF_T = Date.parse('2026-08-14T11:02:00.000Z');
export const PRE_S = 90; // tampon au sol avant le décollage
export const FLIGHT_S = 1500; // 25 min
export const POST_S = 60;
export const LANDING_T = TAKEOFF_T + FLIGHT_S * 1000;

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function pressureFromAltitude(h: number): number {
  return 1013.25 * Math.pow(1 - h / 44_330, 5.255);
}

export interface SyntheticFlight {
  track: TrackPoint[];
  pressure: PressureSample[];
  accelerometer: VectorSample[];
  gyroscope: VectorSample[];
  stats: { maxAlt: number; minAlt: number; gain: number; maxClimb: number; maxSink: number; length: number; maxSpeed: number };
}

export function syntheticFlight(seed = 42): SyntheticFlight {
  const rand = rng(seed);
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const track: TrackPoint[] = [];
  let lat = TAKEOFF.lat;
  let lon = TAKEOFF.lon;
  let alt = TAKEOFF.alt;
  let heading = 250; // vers le lac
  const start = TAKEOFF_T - PRE_S * 1000;
  const total = PRE_S + FLIGHT_S + POST_S;
  const stats = { maxAlt: -Infinity, minAlt: Infinity, gain: 0, maxClimb: 0, maxSink: 0, length: 0, maxSpeed: 0 };
  let prevAlt = alt;

  for (let s = 0; s <= total; s++) {
    const t = start + s * 1000;
    const fs = s - PRE_S; // secondes depuis le décollage
    let speed = 0;
    let vz = 0;
    if (fs >= 0 && fs <= FLIGHT_S) {
      const progress = fs / FLIGHT_S;
      if (progress > 0.9) {
        // approche : on rejoint le terrain
        const remaining = Math.max(1, FLIGHT_S - fs);
        const dLat = (LANDING.lat - lat) * M_PER_DEG_LAT;
        const dLon = (LANDING.lon - lon) * mPerDegLon(lat);
        heading = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
        speed = Math.min(12, Math.hypot(dLat, dLon) / remaining);
        vz = (LANDING.alt - alt) / remaining;
      } else {
        const thermal = Math.sin(fs / 140) > 0.35; // phases de thermique
        if (thermal) {
          heading = (heading + 18) % 360; // spirale
          speed = 9 + noise(0.8);
          vz = 1.8 + Math.sin(fs / 9) * 1.4 + noise(0.4);
        } else {
          heading = (heading + noise(4) + 360) % 360;
          speed = 10.5 + noise(1);
          vz = -1.2 + noise(0.5);
        }
      }
    }
    const rad = (heading * Math.PI) / 180;
    lat += (speed * Math.cos(rad)) / M_PER_DEG_LAT;
    lon += (speed * Math.sin(rad)) / mPerDegLon(lat);
    alt += vz;
    if (fs === FLIGHT_S) alt = LANDING.alt;

    // Perte GNSS de 6 s en vol : la trace garde un trou, rien n'est interpolé.
    const inGap = fs >= 700 && fs < 706;
    if (!inGap) {
      const msl = alt + noise(0.6);
      track.push({
        t,
        lat: lat + noise(0.000008),
        lon: lon + noise(0.000008),
        altEllipsoid: msl + GEOID_N,
        altMsl: msl,
        altPressure: alt - 28 + noise(0.3), // QNE : écart dû à la météo du jour
        hAcc: 3 + rand() * 2,
        vAcc: 4 + rand() * 3,
        speed: Math.max(0, speed + noise(0.3)),
        ...(speed > 1 ? { bearing: heading } : {}),
        sats: 14 + Math.floor(rand() * 8),
      });
    }
    if (fs >= 0 && fs <= FLIGHT_S) {
      stats.maxAlt = Math.max(stats.maxAlt, alt);
      stats.minAlt = Math.min(stats.minAlt, alt);
      if (fs > 0) {
        stats.gain += Math.max(0, alt - prevAlt);
        stats.maxClimb = Math.max(stats.maxClimb, alt - prevAlt);
        stats.maxSink = Math.min(stats.maxSink, alt - prevAlt);
        stats.length += speed;
        stats.maxSpeed = Math.max(stats.maxSpeed, speed);
      }
    }
    prevAlt = alt;
  }

  // Capteurs : baromètre 4 Hz, centrale inertielle 10 Hz, interpolés depuis la trace « vraie ».
  const pressure: PressureSample[] = [];
  const accelerometer: VectorSample[] = [];
  const gyroscope: VectorSample[] = [];
  const altAt = (t: number) => {
    const i = Math.min(track.length - 1, Math.max(0, track.findIndex((p) => p.t >= t)));
    return track[i].altPressure ?? 0;
  };
  for (let t = start; t <= start + total * 1000; t += 250) {
    pressure.push({ t, hpa: pressureFromAltitude(altAt(t) + noise(0.2)) });
  }
  for (let t = start; t <= start + total * 1000; t += 100) {
    const flying = t >= TAKEOFF_T && t <= LANDING_T;
    accelerometer.push({ t, x: noise(flying ? 1.5 : 0.1), y: noise(flying ? 1.5 : 0.1), z: 9.81 + noise(flying ? 2 : 0.1) });
    gyroscope.push({ t, x: noise(flying ? 0.3 : 0.01), y: noise(flying ? 0.3 : 0.01), z: (flying ? 0.2 : 0) + noise(flying ? 0.3 : 0.01) });
  }
  return { track, pressure, accelerometer, gyroscope, stats };
}

/** Petite image PNG valide (1×1, bleu ciel) pour l'exemple de média. */
export const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
