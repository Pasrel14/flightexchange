/** Écriture d'une archive FXF conforme (implémentation de référence pour les producteurs). */

import { zipSync, type Zippable } from 'fflate';
import { EVENT_COLUMNS, PRESSURE_COLUMNS, TRACK_COLUMNS, VECTOR_COLUMNS, formatCsv } from './csv.ts';
import { sha256Hex } from './hash.ts';
import { readFxf } from './reader.ts';
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  type FileRole,
  type FlightEvent,
  type FlightInfo,
  type Manifest,
  type ManifestFile,
  type MediaFile,
  type Sensors,
  type TrackPoint,
} from './types.ts';

export interface WriteInput {
  producer: Manifest['producer'];
  flight: FlightInfo;
  track: readonly TrackPoint[];
  sensors?: Sensors;
  /** events.csv (format 1.1), trié par t croissant. */
  events?: readonly FlightEvent[];
  igc?: string;
  gpx?: string;
  media?: MediaFile[];
  /** Date de création de l'archive ; par défaut maintenant. Fixez-la pour des sorties reproductibles. */
  createdAt?: Date;
  manifestExtensions?: Record<string, unknown>;
}

export interface WriteOptions {
  /** Relit l'archive en mode strict et lève une erreur si elle n'est pas conforme (défaut : true). */
  verify?: boolean;
}

const encoder = new TextEncoder();

const MEDIA_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function writeFxf(input: WriteInput, options: WriteOptions = {}): Promise<Uint8Array> {
  const entries: { path: string; role: FileRole; mediaType: string; data: Uint8Array }[] = [];
  const add = (path: string, role: FileRole, mediaType: string, data: Uint8Array | string) =>
    entries.push({ path, role, mediaType, data: typeof data === 'string' ? encoder.encode(data) : data });

  add('flight.json', 'flight', 'application/json', JSON.stringify(input.flight, null, 2) + '\n');
  add('track.csv', 'track', 'text/csv', formatCsv(input.track, TRACK_COLUMNS));
  if (input.events?.length) add('events.csv', 'events', 'text/csv', formatCsv(input.events, EVENT_COLUMNS, { order: 'nondecreasing' }));
  const s = input.sensors ?? {};
  if (s.pressure?.length) add('sensors/pressure.csv', 'sensor', 'text/csv', formatCsv(s.pressure, PRESSURE_COLUMNS));
  for (const name of ['accelerometer', 'gyroscope', 'magnetometer'] as const) {
    const rows = s[name];
    if (rows?.length) add(`sensors/${name}.csv`, 'sensor', 'text/csv', formatCsv(rows, VECTOR_COLUMNS));
  }
  if (input.igc !== undefined) add('track.igc', 'track-igc', 'application/vnd.fai.igc', input.igc);
  if (input.gpx !== undefined) add('track.gpx', 'track-gpx', 'application/gpx+xml', input.gpx);
  for (const m of input.media ?? []) {
    const ext = m.path.split('.').pop()?.toLowerCase() ?? '';
    add(m.path, 'media', m.mediaType ?? MEDIA_TYPES[ext] ?? 'application/octet-stream', m.data);
  }

  const files: ManifestFile[] = [];
  for (const e of entries) {
    files.push({ path: e.path, role: e.role, mediaType: e.mediaType, size: e.data.length, sha256: await sha256Hex(e.data) });
  }
  const manifest: Manifest = {
    format: FORMAT_NAME,
    formatVersion: FORMAT_VERSION,
    flightId: input.flight.id,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    producer: input.producer,
    files,
    ...(input.manifestExtensions ? { extensions: input.manifestExtensions } : {}),
  };

  // Horodatage ZIP fixe : à contenu identique, archive identique.
  // Heure locale : fflate écrit l'horodatage DOS en heure locale ; ainsi l'archive est identique quel que soit le fuseau.
  const mtime = new Date(2000, 0, 1);
  const zippable: Zippable = { 'manifest.json': [encoder.encode(JSON.stringify(manifest, null, 2) + '\n'), { mtime }] };
  for (const e of entries) {
    // les médias sont déjà compressés
    zippable[e.path] = [e.data, { mtime, level: e.role === 'media' ? 0 : 6 }];
  }
  const zip = zipSync(zippable);

  if (options.verify ?? true) {
    const result = await readFxf(zip, { strict: true });
    const errors = result.issues.filter((i) => i.severity === 'error');
    if (errors.length) {
      throw new Error('Archive FXF non conforme :\n' + errors.map((i) => `- ${i.code} ${i.file ?? ''} ${i.location ?? ''} : ${i.message}`).join('\n'));
    }
  }
  return zip;
}
