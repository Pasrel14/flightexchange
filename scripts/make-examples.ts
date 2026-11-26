/**
 * Génère les exemples (examples/) et le jeu de conformance (tests/fixtures/).
 *   node scripts/make-examples.ts
 * Sorties déterministes : relancer le script ne doit produire aucune différence git.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { writeFxf, type WriteInput } from '../src/writer.ts';
import { formatCsv, TRACK_COLUMNS } from '../src/csv.ts';
import { sha256Hex } from '../src/hash.ts';
import type { FlightEvent, FlightInfo, Manifest, TrackPoint } from '../src/types.ts';
import { syntheticFlight, TAKEOFF, LANDING, TAKEOFF_T, LANDING_T, GEOID_N, FLIGHT_S, TINY_PNG } from './synthetic.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CREATED_AT = new Date('2026-08-14T11:40:00.000Z');
const PRODUCER = { name: 'FlightRecorder', version: '0.3.0', platform: 'android' };
const iso = (t: number) => new Date(t).toISOString();
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const sim = syntheticFlight();

const minimalTrack: TrackPoint[] = sim.track.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altEllipsoid: p.altEllipsoid }));

const minimalFlight: FlightInfo = {
  id: '0b6a2f4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
  activity: 'paragliding',
  takeoff: { time: iso(TAKEOFF_T) },
};

const completeFlight: FlightInfo = {
  id: '7d9e1f20-3a4b-4c5d-9e6f-7a8b9c0d1e2f',
  revision: 2,
  activity: 'paragliding',
  title: 'Forclaz – Doussard, thermiques du matin',
  notes: 'Vol synthétique généré pour la spécification FXF.',
  takeoff: { time: iso(TAKEOFF_T), latitude: TAKEOFF.lat, longitude: TAKEOFF.lon, altitude: TAKEOFF.alt, siteName: 'Col de la Forclaz', detection: 'automatic' },
  landing: { time: iso(LANDING_T), latitude: LANDING.lat, longitude: LANDING.lon, altitude: LANDING.alt, siteName: 'Doussard', detection: 'manual' },
  timezone: 'Europe/Paris',
  pilot: { name: 'Pilote Exemple' },
  equipment: {
    glider: { brand: 'Ozone', model: 'Rush 6', size: 'MS', certification: 'EN-B' },
    harness: { brand: 'Woody Valley', model: 'X-Rated 7' },
  },
  statistics: {
    durationSeconds: FLIGHT_S,
    trackLengthMeters: round(sim.stats.length, 0),
    maxAltitudeMeters: round(sim.stats.maxAlt),
    minAltitudeMeters: round(sim.stats.minAlt),
    altitudeGainMeters: round(sim.stats.gain, 0),
    maxClimbRate: round(sim.stats.maxClimb),
    maxSinkRate: round(sim.stats.maxSink),
    maxGroundSpeed: round(sim.stats.maxSpeed),
  },
  recording: {
    device: { manufacturer: 'Google', model: 'Pixel 8', os: 'Android', osVersion: '15' },
    locationProvider: 'fused',
    nominalIntervalMs: 1000,
    sensors: { barometer: true, accelerometer: true, gyroscope: true },
    geoidModel: 'EGM2008',
    resumeCount: 0,
    gaps: [{ start: iso(TAKEOFF_T + 699_000), end: iso(TAKEOFF_T + 706_000) }],
  },
  media: [{ path: 'media/0001.png', caption: 'Vue sur le lac', takenAt: iso(TAKEOFF_T + 600_000) }],
  extensions: { 'com.flightrecorder': { sessionId: 42, engineVersion: '2.1' } },
};

// Décollage détecté automatiquement, atterrissage déclaré par le pilote (« J'ai atterri »).
const completeEvents: FlightEvent[] = [
  { t: TAKEOFF_T - 7_000, type: 'takeoff_candidate', value: 0.62 },
  { t: TAKEOFF_T, type: 'takeoff_candidate', value: 0.94 },
  { t: TAKEOFF_T, type: 'takeoff' },
  { t: LANDING_T - 20_000, type: 'landing_candidate', value: 0.55 },
  { t: LANDING_T, type: 'manual_landing' },
];

const minimalInput: WriteInput = { producer: PRODUCER, flight: minimalFlight, track: minimalTrack, createdAt: CREATED_AT };
const completeInput: WriteInput = {
  producer: PRODUCER,
  flight: completeFlight,
  track: sim.track,
  sensors: { pressure: sim.pressure, accelerometer: sim.accelerometer, gyroscope: sim.gyroscope },
  events: completeEvents,
  gpx: gpxOf(sim.track),
  media: [{ path: 'media/0001.png', data: TINY_PNG }],
  createdAt: CREATED_AT,
};

function gpxOf(track: TrackPoint[]): string {
  const pts = track
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${(p.altMsl ?? 0).toFixed(1)}</ele><time>${iso(p.t)}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="FlightRecorder" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}

// ---------- outils pour fabriquer des archives volontairement défectueuses ----------

const enc = new TextEncoder();
const dec = new TextDecoder();
type Files = Record<string, Uint8Array>;

function unpack(zip: Uint8Array): Files {
  return unzipSync(zip);
}

function zip(files: Files): Uint8Array {
  // Heure locale : fflate écrit l'horodatage DOS en heure locale ; ainsi l'archive est identique quel que soit le fuseau.
  const mtime = new Date(2000, 0, 1);
  const z: Zippable = {};
  for (const [k, v] of Object.entries(files)) z[k] = [v, { mtime }];
  return zipSync(z);
}

const json = (files: Files, path: string) => JSON.parse(dec.decode(files[path]));
const setJson = (files: Files, path: string, value: unknown): void => {
  files[path] = enc.encode(JSON.stringify(value, null, 2) + '\n');
};

/** Recalcule size et sha256 dans le manifeste après une modification volontaire. */
async function rehash(files: Files): Promise<void> {
  const m = json(files, 'manifest.json') as Manifest;
  for (const f of m.files) {
    if (!files[f.path]) continue;
    f.size = files[f.path].length;
    f.sha256 = await sha256Hex(files[f.path]);
  }
  setJson(files, 'manifest.json', m);
}

async function variant(base: Uint8Array, mutate: (f: Files) => void | Promise<void>, rehashAfter = true): Promise<Uint8Array> {
  const files = unpack(base);
  await mutate(files);
  if (rehashAfter && files['manifest.json']) await rehash(files);
  return zip(files);
}

function writeOut(path: string, data: Uint8Array | string) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

function writeExtracted(dir: string, archive: Uint8Array) {
  rmSync(join(root, dir), { recursive: true, force: true });
  for (const [p, data] of Object.entries(unpack(archive))) writeOut(join(dir, p), data);
}

// ---------- génération ----------

const minimal = await writeFxf(minimalInput);
const complete = await writeFxf(completeInput);

writeOut('examples/minimal.fxf', minimal);
writeOut('examples/complete.fxf', complete);
writeExtracted('examples/minimal', minimal);
writeExtracted('examples/complete', complete);

interface Case {
  name: string;
  description: string;
  data: Uint8Array;
  /** Codes d'erreur attendus (au moins un) ; vide = le fichier doit être importé. */
  errors?: string[];
  /** Avertissements attendus (au moins ceux-là). */
  warnings?: string[];
  /** Le cas vise les producteurs : résultat attendu en mode strict. */
  strictErrors?: string[];
}

const cases: Case[] = [
  { name: 'valid/minimal', description: 'Le strict minimum : id, activité, heure de décollage, trace t/lat/lon/alt_ellipsoid.', data: minimal, warnings: ['FXF_W_ELLIPSOID_ONLY'] },
  { name: 'valid/complete', description: 'Toutes les données : capteurs, événements, GPX, photo, extensions, trou GNSS.', data: complete },
  {
    name: 'valid/format-1.0',
    description: 'Fichier écrit en version 1.0 : toujours lu sans avertissement de version.',
    data: await variant(minimal, (f) => setJson(f, 'manifest.json', { ...json(f, 'manifest.json'), formatVersion: '1.0' })),
    warnings: ['FXF_W_ELLIPSOID_ONLY'],
  },
  {
    name: 'valid/bad-events',
    description: 'events.csv avec une confiance hors de 0–1 : événements écartés, vol importé.',
    data: await variant(complete, (f) => {
      f['events.csv'] = enc.encode(dec.decode(f['events.csv']).replace(',0.62\n', ',1.62\n'));
    }),
    warnings: ['FXF_W_EVENTS_DISCARDED'],
  },
  {
    name: 'valid/custom-event-types',
    description: 'Types d’événements inconnus : acceptés en lecture ; en mode strict, le type sans préfixe de domaine est refusé.',
    data: await variant(complete, (f) => {
      f['events.csv'] = enc.encode(dec.decode(f['events.csv']) + `${LANDING_T},com.flightrecorder.battery_low,0.15\n${LANDING_T + 1000},thermal_exit,\n`);
    }),
    strictErrors: ['FXF_E_STRICT'],
  },
  {
    name: 'valid/no-landing',
    description: 'Vol interrompu (batterie vide) : pas de landing.',
    data: await writeFxf({ ...minimalInput, flight: { ...minimalFlight, id: 'a1b2c3d4-0000-4000-8000-000000000001' } }),
    warnings: ['FXF_W_ELLIPSOID_ONLY'],
  },
  {
    name: 'valid/position-only',
    description: 'Trace sans aucune altitude (t, lat, lon seulement).',
    data: await writeFxf({ ...minimalInput, flight: { ...minimalFlight, id: 'a1b2c3d4-0000-4000-8000-000000000002' }, track: minimalTrack.map(({ t, lat, lon }) => ({ t, lat, lon })) }),
    warnings: ['FXF_W_NO_GNSS_ALTITUDE'],
  },
  {
    name: 'valid/newer-minor',
    description: 'Version 1.7 : champs, colonne, rôle et fichier inconnus ignorés avec avertissement. Refusé en mode strict.',
    data: await variant(minimal, (f) => {
      const m = json(f, 'manifest.json');
      m.formatVersion = '1.7';
      m.files.push({ path: 'wind.json', role: 'wind' });
      setJson(f, 'manifest.json', m);
      f['wind.json'] = enc.encode('{"speed":3}\n');
      f['notes.txt'] = enc.encode('fichier non listé\n');
      const fl = json(f, 'flight.json');
      fl.futureField = { anything: true };
      setJson(f, 'flight.json', fl);
      const lines = dec.decode(f['track.csv']).trimEnd().split('\n');
      f['track.csv'] = enc.encode(lines.map((l, i) => l + (i === 0 ? ',future_col' : ',1')).join('\n') + '\n');
    }),
    warnings: ['FXF_W_NEWER_MINOR', 'FXF_W_UNKNOWN_FILE', 'FXF_W_UNLISTED_FILE', 'FXF_W_UNKNOWN_COLUMN'],
    strictErrors: ['FXF_E_STRICT'],
  },
  {
    name: 'valid/no-checksum-crlf',
    description: 'Manifeste sans size ni sha256, CSV en CRLF : accepté (avertissement), refusé en mode strict.',
    data: await variant(
      minimal,
      (f) => {
        f['track.csv'] = enc.encode(dec.decode(f['track.csv']).replace(/\n/g, '\r\n'));
        const m = json(f, 'manifest.json');
        for (const e of m.files) {
          delete e.sha256;
          delete e.size;
        }
        setJson(f, 'manifest.json', m);
      },
      false,
    ),
    warnings: ['FXF_W_NO_CHECKSUM'],
    strictErrors: ['FXF_E_STRICT'],
  },
  {
    name: 'valid/bad-sensor',
    description: 'Baromètre corrompu : capteur écarté, vol importé.',
    data: await variant(complete, (f) => {
      f['sensors/pressure.csv'] = enc.encode(dec.decode(f['sensors/pressure.csv']).replace(/\n(\d+),/, '\n$1,abc,'));
    }),
    warnings: ['FXF_W_SENSOR_DISCARDED'],
  },
  {
    name: 'valid/simulated',
    description: 'Trace issue du simulateur : importable, mais signalée.',
    data: await writeFxf({ ...minimalInput, flight: { ...minimalFlight, id: 'a1b2c3d4-0000-4000-8000-000000000003', recording: { locationProvider: 'simulated' } } }),
    warnings: ['FXF_W_SIMULATED'],
  },

  { name: 'invalid/not-zip', description: 'Fichier texte renommé en .fxf.', data: enc.encode('B1101024548781N00614790EA0125501306\n'), errors: ['FXF_E_NOT_ZIP'] },
  { name: 'invalid/missing-manifest', description: 'Archive sans manifest.json.', data: await variant(minimal, (f) => void delete f['manifest.json'], false), errors: ['FXF_E_MISSING_MANIFEST'] },
  { name: 'invalid/invalid-json', description: 'flight.json tronqué.', data: await variant(minimal, (f) => void (f['flight.json'] = f['flight.json'].slice(0, 20))), errors: ['FXF_E_INVALID_JSON'] },
  {
    name: 'invalid/unsupported-major',
    description: 'Version 2.0 : refusée avec un message explicite.',
    data: await variant(minimal, (f) => setJson(f, 'manifest.json', { ...json(f, 'manifest.json'), formatVersion: '2.0' })),
    errors: ['FXF_E_UNSUPPORTED_VERSION'],
  },
  {
    name: 'invalid/missing-activity',
    description: 'flight.json sans le champ obligatoire activity.',
    data: await variant(minimal, (f) => {
      const fl = json(f, 'flight.json');
      delete fl.activity;
      setJson(f, 'flight.json', fl);
    }),
    errors: ['FXF_E_SCHEMA'],
  },
  {
    name: 'invalid/local-time',
    description: 'Heure de décollage sans Z (heure locale) : refusée.',
    data: await variant(minimal, (f) => setJson(f, 'flight.json', { ...json(f, 'flight.json'), takeoff: { time: '2026-08-14T13:02:00' } })),
    errors: ['FXF_E_SCHEMA'],
  },
  {
    name: 'invalid/missing-track',
    description: 'track.csv absent de l’archive et du manifeste.',
    data: await variant(minimal, (f) => {
      delete f['track.csv'];
      const m = json(f, 'manifest.json');
      m.files = m.files.filter((e: { path: string }) => e.path !== 'track.csv');
      setJson(f, 'manifest.json', m);
    }),
    errors: ['FXF_E_MISSING_FILE'],
  },
  {
    name: 'invalid/checksum',
    description: 'track.csv modifié après la création du manifeste.',
    data: await variant(minimal, (f) => void (f['track.csv'] = enc.encode(dec.decode(f['track.csv']).replace(/45\.8/, '45.9'))), false),
    errors: ['FXF_E_CHECKSUM'],
  },
  {
    name: 'invalid/id-mismatch',
    description: 'manifest.flightId différent de flight.id.',
    data: await variant(minimal, (f) => setJson(f, 'manifest.json', { ...json(f, 'manifest.json'), flightId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })),
    errors: ['FXF_E_ID_MISMATCH'],
  },
  {
    name: 'invalid/track-unsorted',
    description: 'Deux lignes de la trace inversées.',
    data: await variant(minimal, (f) => {
      const l = dec.decode(f['track.csv']).trimEnd().split('\n');
      [l[10], l[11]] = [l[11], l[10]];
      f['track.csv'] = enc.encode(l.join('\n') + '\n');
    }),
    errors: ['FXF_E_CSV_ORDER'],
  },
  {
    name: 'invalid/track-missing-column',
    description: 'Trace sans colonne lon.',
    data: await variant(minimal, (f) => {
      f['track.csv'] = enc.encode(formatCsv(minimalTrack, TRACK_COLUMNS).replace(/^t,lat,lon,/, 't,lat,longitude,'));
    }),
    errors: ['FXF_E_CSV_HEADER'],
  },
  {
    name: 'invalid/track-bad-value',
    description: 'Latitude hors bornes et altitude « NaN ».',
    data: await variant(minimal, (f) => {
      const l = dec.decode(f['track.csv']).trimEnd().split('\n');
      l[5] = l[5].replace(/^(\d+),[^,]+/, '$1,95.1');
      l[6] = l[6].replace(/,[^,]+$/, ',NaN');
      f['track.csv'] = enc.encode(l.join('\n') + '\n');
    }),
    errors: ['FXF_E_CSV_VALUE'],
  },
  {
    name: 'invalid/track-too-short',
    description: 'Un seul point.',
    data: await variant(minimal, (f) => {
      f['track.csv'] = enc.encode(formatCsv(minimalTrack.slice(100, 101), TRACK_COLUMNS));
      setJson(f, 'flight.json', { ...json(f, 'flight.json'), takeoff: { time: iso(minimalTrack[100].t) } });
    }),
    errors: ['FXF_E_TRACK_TOO_SHORT'],
  },
  {
    name: 'invalid/takeoff-outside-track',
    description: 'Heure de décollage un jour après la trace.',
    data: await variant(minimal, (f) => setJson(f, 'flight.json', { ...json(f, 'flight.json'), takeoff: { time: iso(TAKEOFF_T + 86_400_000) } })),
    errors: ['FXF_E_INCONSISTENT'],
  },
  {
    name: 'invalid/msl-without-geoid',
    description: 'Colonne alt_msl sans recording.geoidModel.',
    data: await variant(complete, (f) => {
      const fl = json(f, 'flight.json');
      delete fl.recording.geoidModel;
      setJson(f, 'flight.json', fl);
    }),
    errors: ['FXF_E_INCONSISTENT'],
  },
  {
    name: 'invalid/unsafe-path',
    description: 'Entrée ZIP qui tente de sortir du dossier d’extraction.',
    data: await variant(minimal, (f) => void (f['../evil.txt'] = enc.encode('x')), false),
    errors: ['FXF_E_UNSAFE_PATH'],
  },
];

rmSync(join(root, 'tests/fixtures'), { recursive: true, force: true });
for (const c of cases) writeOut(`tests/fixtures/${c.name}.fxf`, c.data);
const expected = Object.fromEntries(
  cases.map((c) => [
    `${c.name}.fxf`,
    { description: c.description, ok: !c.errors?.length, errors: c.errors ?? [], warnings: c.warnings ?? [], ...(c.strictErrors ? { strictErrors: c.strictErrors } : {}) },
  ]),
);
writeOut('tests/fixtures/expected.json', JSON.stringify(expected, null, 2) + '\n');

console.log(`examples/ : minimal.fxf (${minimal.length} o), complete.fxf (${complete.length} o)`);
console.log(`tests/fixtures/ : ${cases.length} cas (géoïde utilisé : N = ${GEOID_N} m)`);
