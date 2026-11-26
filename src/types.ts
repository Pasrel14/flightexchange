/**
 * Types TypeScript du Flight Exchange Format 1.1.
 * Ils reflètent schema/*.schema.json et SPECIFICATION.md ; en cas de divergence, la spécification fait foi.
 */

export const FORMAT_NAME = 'flight-exchange';
/** Version du format implémentée par cette bibliothèque. */
export const FORMAT_VERSION = '1.1';
export const MEDIA_TYPE = 'application/vnd.flight-exchange+zip';
export const FILE_EXTENSION = '.fxf';

/** Instant ISO 8601 UTC, ex. `2026-11-20T09:30:00.000Z`. */
export type Instant = string;

export type FileRole = 'flight' | 'track' | 'events' | 'sensor' | 'track-igc' | 'track-gpx' | 'media' | 'other';

export interface ManifestFile {
  path: string;
  role: FileRole | (string & {});
  mediaType?: string;
  size?: number;
  sha256?: string;
}

export interface Manifest {
  format: typeof FORMAT_NAME;
  formatVersion: string;
  flightId: string;
  createdAt: Instant;
  producer: { name: string; version: string; platform?: string };
  files: ManifestFile[];
  extensions?: Record<string, unknown>;
}

export type Activity = 'paragliding' | 'hang-gliding' | 'speed-flying' | 'sailplane' | 'other';

export interface Place {
  time: Instant;
  latitude?: number;
  longitude?: number;
  /** Mètres au-dessus du niveau moyen de la mer. */
  altitude?: number;
  siteName?: string;
  /** Format 1.1 : détection automatique ou déclaration/correction par le pilote. */
  detection?: Detection;
}

export type Detection = 'automatic' | 'manual';

export interface GearRef {
  brand?: string;
  model?: string;
  size?: string;
  certification?: string;
  serial?: string;
}

export interface FlightStatistics {
  durationSeconds?: number;
  trackLengthMeters?: number;
  straightDistanceMeters?: number;
  maxDistanceFromTakeoffMeters?: number;
  maxAltitudeMeters?: number;
  minAltitudeMeters?: number;
  altitudeGainMeters?: number;
  /** m/s, positif. */
  maxClimbRate?: number;
  /** m/s, négatif. */
  maxSinkRate?: number;
  /** m/s. */
  maxGroundSpeed?: number;
}

export interface Recording {
  device?: { manufacturer?: string; model?: string; os?: string; osVersion?: string };
  locationProvider?: 'fused' | 'platform' | 'external' | 'simulated' | 'mixed';
  nominalIntervalMs?: number;
  sensors?: { barometer?: boolean; accelerometer?: boolean; gyroscope?: boolean };
  geoidModel?: string;
  detection?: Detection;
  resumeCount?: number;
  gaps?: { start: Instant; end: Instant }[];
}

export interface MediaRef {
  path: string;
  caption?: string;
  takenAt?: Instant;
}

export interface FlightInfo {
  id: string;
  revision?: number;
  activity: Activity | (string & {});
  title?: string;
  notes?: string;
  takeoff: Place;
  landing?: Place;
  timezone?: string;
  pilot?: { name?: string };
  equipment?: { glider?: GearRef; harness?: GearRef; reserve?: GearRef; instrument?: GearRef };
  statistics?: FlightStatistics;
  recording?: Recording;
  media?: MediaRef[];
  extensions?: Record<string, unknown>;
}

/** Une ligne de track.csv. Les champs absents sont `undefined`, jamais 0. */
export interface TrackPoint {
  /** ms depuis l'époque Unix, UTC. */
  t: number;
  lat: number;
  lon: number;
  altEllipsoid?: number;
  altMsl?: number;
  altPressure?: number;
  hAcc?: number;
  vAcc?: number;
  /** m/s */
  speed?: number;
  bearing?: number;
  sats?: number;
  elapsedNs?: number;
}

export interface PressureSample {
  t: number;
  elapsedNs?: number;
  hpa: number;
}

export interface VectorSample {
  t: number;
  elapsedNs?: number;
  x: number;
  y: number;
  z: number;
}

/** Types d'événements définis par la spécification (§ 8.1). Liste extensible. */
export const EVENT_TYPES = [
  'takeoff_candidate',
  'takeoff',
  'landing_candidate',
  'landing',
  'manual_takeoff',
  'manual_landing',
  'interruption',
  'resume',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Une ligne de events.csv (format 1.1). */
export interface FlightEvent {
  t: number;
  type: EventType | (string & {});
  value?: number;
}

export interface Sensors {
  pressure?: PressureSample[];
  accelerometer?: VectorSample[];
  gyroscope?: VectorSample[];
  magnetometer?: VectorSample[];
}

export type SensorName = keyof Sensors;
export const SENSOR_NAMES: readonly SensorName[] = ['pressure', 'accelerometer', 'gyroscope', 'magnetometer'];

export interface MediaFile {
  path: string;
  data: Uint8Array;
  mediaType?: string;
}

/** Un vol FXF complet, en mémoire. */
export interface FxfFlight {
  manifest: Manifest;
  flight: FlightInfo;
  track: TrackPoint[];
  sensors: Sensors;
  /** Événements (events.csv, format 1.1) ; absent si le fichier n'existe pas ou a été écarté. */
  events?: FlightEvent[];
  /** Copies dérivées éventuelles (texte brut). */
  igc?: string;
  gpx?: string;
  media: MediaFile[];
}
