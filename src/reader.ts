/** Lecture et validation d'une archive FXF (SPECIFICATION.md § 11.1). */

import { unzipSync, type UnzipFileInfo } from 'fflate';
import { EVENT_COLUMNS, PRESSURE_COLUMNS, VECTOR_COLUMNS, TRACK_COLUMNS, parseCsv } from './csv.ts';
import { Issues, type Issue } from './issues.ts';
import { validateDocument } from './schema.ts';
import { sha256Hex } from './hash.ts';
import {
  EVENT_TYPES,
  FORMAT_VERSION,
  type FlightEvent,
  type FlightInfo,
  type FxfFlight,
  type Manifest,
  type MediaFile,
  type SensorName,
  type Sensors,
} from './types.ts';

export const LIMITS = {
  maxTotalBytes: 512 * 1024 * 1024,
  maxFileBytes: 256 * 1024 * 1024,
  maxEntries: 10_000,
};

export interface ReadOptions {
  /** Mode strict (producteurs) : refuse les champs hors spécification et exige size + sha256. */
  strict?: boolean;
}

export interface ReadResult {
  /** `true` si aucune erreur : `fxf` est alors défini. */
  ok: boolean;
  fxf?: FxfFlight;
  issues: Issue[];
  /** Fichiers de l'archive qui n'ont pas été exploités (rapport d'import). */
  ignoredFiles: string[];
}

const SENSOR_FILES: Record<string, SensorName> = {
  'sensors/pressure.csv': 'pressure',
  'sensors/accelerometer.csv': 'accelerometer',
  'sensors/gyroscope.csv': 'gyroscope',
  'sensors/magnetometer.csv': 'magnetometer',
};

const KNOWN_ROLES = new Set(['flight', 'track', 'events', 'sensor', 'track-igc', 'track-gpx', 'media', 'other']);

export function isSafePath(p: string): boolean {
  return (
    p.length > 0 &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !/^[A-Za-z]:/.test(p) &&
    !p.split('/').some((s) => s === '..' || s === '.') &&
    !p.includes('\0')
  );
}

const decoder = new TextDecoder('utf-8', { fatal: false });

function parseJson(bytes: Uint8Array, file: string, issues: Issues): unknown {
  try {
    let text = decoder.decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return JSON.parse(text);
  } catch (e) {
    issues.add('FXF_E_INVALID_JSON', `JSON mal formé : ${(e as Error).message}`, file);
    return undefined;
  }
}

/** Décompresse en appliquant les limites de sécurité (§ 2.2) avant toute décompression. */
function unzip(data: Uint8Array, issues: Issues): Record<string, Uint8Array> | undefined {
  let entries = 0;
  let total = 0;
  let violation: string | undefined;
  try {
    const files = unzipSync(data, {
      filter: (f: UnzipFileInfo) => {
        if (f.name.endsWith('/')) return false; // répertoires
        entries++;
        total += f.originalSize;
        if (!violation) {
          if (entries > LIMITS.maxEntries) violation = `plus de ${LIMITS.maxEntries} fichiers`;
          else if (f.originalSize > LIMITS.maxFileBytes) violation = `« ${f.name} » dépasse ${LIMITS.maxFileBytes} octets`;
          else if (total > LIMITS.maxTotalBytes) violation = `taille décompressée supérieure à ${LIMITS.maxTotalBytes} octets`;
          else if (f.compression !== 0 && f.compression !== 8) violation = `méthode de compression ${f.compression} non autorisée (« ${f.name} »)`;
        }
        return !violation;
      },
    });
    if (violation) {
      issues.add('FXF_E_LIMITS', `Archive refusée : ${violation}.`);
      return undefined;
    }
    return files;
  } catch (e) {
    issues.add('FXF_E_NOT_ZIP', `Archive ZIP illisible : ${(e as Error).message}`);
    return undefined;
  }
}

const KNOWN_EVENT_TYPES = new Set<string>(EVENT_TYPES);

/** Contrôles propres à events.csv (§ 8.1), au-delà du format CSV. */
function checkEvents(events: FlightEvent[], file: string, issues: Issues, strict: boolean): void {
  events.forEach((e, i) => {
    const line = `ligne ${i + 2}`;
    if (e.type.endsWith('_candidate') && KNOWN_EVENT_TYPES.has(e.type) && e.value !== undefined && (e.value < 0 || e.value > 1)) {
      issues.add('FXF_E_CSV_VALUE', `« value » : confiance ${e.value} hors de 0–1.`, file, line);
    }
    if (strict && !e.type.includes('.') && !KNOWN_EVENT_TYPES.has(e.type)) {
      issues.add('FXF_E_STRICT', `Type d’événement « ${e.type} » non défini : préfixez-le par un nom de domaine inversé.`, file, line);
    }
  });
}

function inRange(iso: string, first: number, last: number): boolean {
  const t = Date.parse(iso);
  return t >= first && t <= last;
}

/**
 * Lit et valide une archive FXF. Ne lève jamais d'exception pour un fichier invalide :
 * toutes les anomalies sont rapportées dans `issues`.
 */
export async function readFxf(data: Uint8Array | ArrayBuffer, options: ReadOptions = {}): Promise<ReadResult> {
  const strict = options.strict ?? false;
  const issues = new Issues();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const fail = (): ReadResult => ({ ok: false, issues: issues.list, ignoredFiles: [] });

  // 1. Archive
  const files = unzip(bytes, issues);
  if (!files) return fail();
  const unsafe = Object.keys(files).filter((p) => !isSafePath(p));
  if (unsafe.length) {
    issues.add('FXF_E_UNSAFE_PATH', `Chemins interdits : ${unsafe.join(', ')}.`);
    return fail();
  }

  // 2. Manifeste
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) {
    issues.add('FXF_E_MISSING_MANIFEST', 'manifest.json absent à la racine de l’archive.');
    return fail();
  }
  const manifestDoc = parseJson(manifestBytes, 'manifest.json', issues);
  if (manifestDoc === undefined) return fail();
  // La version est vérifiée avant le schéma : un futur majeur peut avoir changé le schéma.
  const version = (manifestDoc as { formatVersion?: unknown })?.formatVersion;
  if (typeof version === 'string' && /^\d+\.\d+$/.test(version)) {
    const [major, minor] = version.split('.').map(Number);
    const [ourMajor, ourMinor] = FORMAT_VERSION.split('.').map(Number);
    if (major !== ourMajor) {
      issues.add('FXF_E_UNSUPPORTED_VERSION', `Version ${version} non prise en charge (cette application lit les versions ${ourMajor}.x).`, 'manifest.json', '/formatVersion');
      return fail();
    }
    if (minor > ourMinor) {
      issues.add('FXF_W_NEWER_MINOR', `Fichier en version ${version}, plus récente que ${FORMAT_VERSION} : certaines données peuvent être ignorées.`, 'manifest.json', '/formatVersion');
    }
  }
  if (!validateDocument('manifest', manifestDoc, 'manifest.json', issues, strict)) return fail();
  const manifest = manifestDoc as Manifest;

  // 3. Inventaire
  const listed = new Set<string>();
  for (const entry of manifest.files) {
    listed.add(entry.path);
    const content = files[entry.path];
    if (!content) {
      issues.add('FXF_E_MISSING_FILE', `Fichier listé dans le manifeste mais absent : ${entry.path}.`, entry.path);
      continue;
    }
    if (entry.size !== undefined && entry.size !== content.length) {
      issues.add('FXF_E_SIZE_MISMATCH', `Taille ${content.length} au lieu de ${entry.size} annoncés.`, entry.path);
    }
    if (entry.sha256 !== undefined) {
      if ((await sha256Hex(content)) !== entry.sha256) issues.add('FXF_E_CHECKSUM', 'Empreinte SHA-256 différente du manifeste : fichier altéré.', entry.path);
    } else if (strict) {
      issues.add('FXF_E_STRICT', 'sha256 obligatoire en mode strict.', entry.path);
    } else {
      issues.add('FXF_W_NO_CHECKSUM', 'Fichier sans empreinte SHA-256 : intégrité non vérifiable.', entry.path);
    }
    if (strict && entry.size === undefined) issues.add('FXF_E_STRICT', 'size obligatoire en mode strict.', entry.path);
    if (!KNOWN_ROLES.has(entry.role)) issues.add('FXF_W_UNKNOWN_FILE', `Rôle « ${entry.role} » inconnu : fichier ignoré.`, entry.path);
  }
  const ignoredFiles: string[] = [];
  for (const p of Object.keys(files)) {
    if (p !== 'manifest.json' && !listed.has(p)) {
      issues.add('FXF_W_UNLISTED_FILE', 'Fichier absent du manifeste : ignoré.', p);
      ignoredFiles.push(p);
    }
  }

  // 4. flight.json
  for (const required of ['flight.json', 'track.csv']) {
    if (!listed.has(required)) issues.add('FXF_E_MISSING_FILE', `${required} obligatoire, absent du manifeste.`, required);
  }
  if (issues.hasErrors) return { ...fail(), ignoredFiles };

  const flightDoc = parseJson(files['flight.json'], 'flight.json', issues);
  if (flightDoc === undefined || !validateDocument('flight', flightDoc, 'flight.json', issues, strict)) return { ...fail(), ignoredFiles };
  const flight = flightDoc as FlightInfo;
  if (flight.id !== manifest.flightId) {
    issues.add('FXF_E_ID_MISMATCH', `flight.id (${flight.id}) différent de manifest.flightId (${manifest.flightId}).`, 'flight.json', '/id');
  }

  // 5. Trace
  const track = parseCsv(decoder.decode(files['track.csv']), TRACK_COLUMNS, 'track.csv', issues);
  if (track && track.length < 2) issues.add('FXF_E_TRACK_TOO_SHORT', `${track.length} point(s) : au moins 2 sont nécessaires.`, 'track.csv');
  if (!track || issues.hasErrors) return { ...fail(), ignoredFiles };

  // 6. Cohérence
  const first = track[0].t;
  const last = track[track.length - 1].t;
  if (!inRange(flight.takeoff.time, first, last)) {
    issues.add('FXF_E_INCONSISTENT', 'Heure de décollage en dehors de la trace.', 'flight.json', '/takeoff/time');
  }
  if (flight.landing) {
    if (!inRange(flight.landing.time, first, last)) issues.add('FXF_E_INCONSISTENT', 'Heure d’atterrissage en dehors de la trace.', 'flight.json', '/landing/time');
    if (Date.parse(flight.landing.time) <= Date.parse(flight.takeoff.time)) issues.add('FXF_E_INCONSISTENT', 'Atterrissage antérieur ou égal au décollage.', 'flight.json', '/landing/time');
  }
  const hasMsl = track.some((p) => p.altMsl !== undefined);
  const hasEllipsoid = track.some((p) => p.altEllipsoid !== undefined);
  if (hasMsl && !flight.recording?.geoidModel) {
    issues.add('FXF_E_INCONSISTENT', 'Colonne alt_msl présente sans recording.geoidModel.', 'flight.json', '/recording/geoidModel');
  }
  if (!hasMsl && hasEllipsoid) issues.add('FXF_W_ELLIPSOID_ONLY', 'Seule l’altitude ellipsoïdale est fournie (écart d’environ 50 m en France avec le niveau de la mer).', 'track.csv');
  if (!hasMsl && !hasEllipsoid) issues.add('FXF_W_NO_GNSS_ALTITUDE', 'Aucune altitude GNSS dans la trace.', 'track.csv');
  if (flight.recording?.locationProvider === 'simulated') issues.add('FXF_W_SIMULATED', 'Trace simulée : ce n’est pas un vol réel.', 'flight.json', '/recording/locationProvider');
  for (const m of flight.media ?? []) {
    if (!files[m.path]) issues.add('FXF_E_INCONSISTENT', `Média déclaré mais absent : ${m.path}.`, 'flight.json', '/media');
  }
  if (issues.hasErrors) return { ...fail(), ignoredFiles };

  // 7. Fichiers facultatifs : une erreur les écarte sans bloquer l'import.
  const sensors: Sensors = {};
  const media: MediaFile[] = [];
  let igc: string | undefined;
  let gpx: string | undefined;
  let events: FlightEvent[] | undefined;
  for (const entry of manifest.files) {
    const content = files[entry.path];
    if (!content || entry.path === 'flight.json' || entry.path === 'track.csv') continue;
    if (entry.role === 'events') {
      if (entry.path !== 'events.csv' || events) {
        issues.add('FXF_W_UNKNOWN_FILE', 'Fichier d’événements inattendu (seul events.csv est défini) : ignoré.', entry.path);
        ignoredFiles.push(entry.path);
        continue;
      }
      const local = new Issues();
      const rows = parseCsv(decoder.decode(content), EVENT_COLUMNS, entry.path, local, { order: 'nondecreasing' });
      if (rows) checkEvents(rows, entry.path, local, strict);
      // FXF_E_STRICT (type non préfixé) vise le producteur : il reste une erreur sans écarter le fichier.
      if (rows && !local.list.some((i) => i.severity === 'error' && i.code !== 'FXF_E_STRICT')) {
        events = rows;
        for (const i of local.list) issues.list.push(i);
      } else {
        const detail = local.list.map((i) => i.message + (i.location ? ` (${i.location})` : '')).join(' ');
        issues.add('FXF_W_EVENTS_DISCARDED', `Événements écartés : ${detail}`, entry.path);
        ignoredFiles.push(entry.path);
      }
    } else if (entry.role === 'sensor') {
      const name = SENSOR_FILES[entry.path];
      if (!name) {
        issues.add('FXF_W_UNKNOWN_FILE', 'Capteur inconnu : ignoré.', entry.path);
        ignoredFiles.push(entry.path);
        continue;
      }
      const local = new Issues();
      const text = decoder.decode(content);
      const rows = name === 'pressure' ? parseCsv(text, PRESSURE_COLUMNS, entry.path, local) : parseCsv(text, VECTOR_COLUMNS, entry.path, local);
      // les anomalies du capteur sont rétrogradées en avertissements
      const detail = local.list.map((i) => i.message + (i.location ? ` (${i.location})` : '')).join(' ');
      if (rows) {
        (sensors as Record<string, unknown>)[name] = rows;
        for (const i of local.list.filter((i) => i.severity === 'warning')) issues.list.push(i);
      } else {
        issues.add('FXF_W_SENSOR_DISCARDED', `Capteur écarté : ${detail}`, entry.path);
        ignoredFiles.push(entry.path);
      }
    } else if (entry.role === 'track-igc') igc = decoder.decode(content);
    else if (entry.role === 'track-gpx') gpx = decoder.decode(content);
    else if (entry.role === 'media') media.push({ path: entry.path, data: content, ...(entry.mediaType ? { mediaType: entry.mediaType } : {}) });
    else ignoredFiles.push(entry.path);
  }

  if (issues.hasErrors) return { ok: false, issues: issues.list, ignoredFiles };
  return {
    ok: true,
    fxf: { manifest, flight, track, sensors, media, ...(events ? { events } : {}), ...(igc !== undefined ? { igc } : {}), ...(gpx !== undefined ? { gpx } : {}) },
    issues: issues.list,
    ignoredFiles,
  };
}

/** Raccourci : liste des anomalies seulement. */
export async function validateFxf(data: Uint8Array | ArrayBuffer, options: ReadOptions = {}): Promise<Issue[]> {
  return (await readFxf(data, options)).issues;
}
