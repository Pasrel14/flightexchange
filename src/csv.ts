/** Lecture et écriture des fichiers CSV FXF (SPECIFICATION.md § 4.2, § 7, § 8). */

import type { Issues } from './issues.ts';
import type { PressureSample, TrackPoint, VectorSample } from './types.ts';

type Kind = 'int' | 'num';

export interface ColumnSpec<T> {
  /** Nom de la colonne dans le fichier. */
  name: string;
  /** Propriété correspondante de l'objet. */
  key: keyof T & string;
  kind: Kind;
  required?: boolean;
  min?: number;
  max?: number;
}

export const TRACK_COLUMNS: ColumnSpec<TrackPoint>[] = [
  { name: 't', key: 't', kind: 'int', required: true, min: 0 },
  { name: 'lat', key: 'lat', kind: 'num', required: true, min: -90, max: 90 },
  { name: 'lon', key: 'lon', kind: 'num', required: true, min: -180, max: 180 },
  { name: 'alt_ellipsoid', key: 'altEllipsoid', kind: 'num', min: -1000, max: 20000 },
  { name: 'alt_msl', key: 'altMsl', kind: 'num', min: -1000, max: 20000 },
  { name: 'alt_pressure', key: 'altPressure', kind: 'num', min: -1000, max: 20000 },
  { name: 'h_acc', key: 'hAcc', kind: 'num', min: 0 },
  { name: 'v_acc', key: 'vAcc', kind: 'num', min: 0 },
  { name: 'speed', key: 'speed', kind: 'num', min: 0 },
  { name: 'bearing', key: 'bearing', kind: 'num', min: 0, max: 360 },
  { name: 'sats', key: 'sats', kind: 'int', min: 0 },
  { name: 'elapsed_ns', key: 'elapsedNs', kind: 'int', min: 0 },
];

export const PRESSURE_COLUMNS: ColumnSpec<PressureSample>[] = [
  { name: 't', key: 't', kind: 'int', required: true, min: 0 },
  { name: 'elapsed_ns', key: 'elapsedNs', kind: 'int', min: 0 },
  { name: 'hpa', key: 'hpa', kind: 'num', required: true, min: 1, max: 1200 },
];

export const VECTOR_COLUMNS: ColumnSpec<VectorSample>[] = [
  { name: 't', key: 't', kind: 'int', required: true, min: 0 },
  { name: 'elapsed_ns', key: 'elapsedNs', kind: 'int', min: 0 },
  { name: 'x', key: 'x', kind: 'num', required: true },
  { name: 'y', key: 'y', kind: 'num', required: true },
  { name: 'z', key: 'z', kind: 'num', required: true },
];

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

/** Nombre maximal d'erreurs de valeur rapportées par fichier, pour garder un rapport lisible. */
const MAX_VALUE_ERRORS = 20;

/**
 * Analyse un CSV FXF. Retourne `undefined` si une erreur bloquante empêche d'exploiter le fichier
 * (les anomalies sont ajoutées à `issues`).
 */
export function parseCsv<T>(text: string, columns: ColumnSpec<T>[], file: string, issues: Issues): T[] | undefined {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM toléré en lecture
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) {
    issues.add('FXF_E_CSV_HEADER', 'Fichier CSV vide.', file);
    return undefined;
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h)) {
      issues.add('FXF_E_CSV_HEADER', `Colonne « ${h} » en double.`, file, 'ligne 1');
      return undefined;
    }
    seen.add(h);
  }
  for (const c of columns) {
    if (c.required && !seen.has(c.name)) {
      issues.add('FXF_E_CSV_HEADER', `Colonne obligatoire « ${c.name} » absente.`, file, 'ligne 1');
      return undefined;
    }
  }
  const known = new Map(columns.map((c) => [c.name, c]));
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length) {
    issues.add('FXF_W_UNKNOWN_COLUMN', `Colonnes inconnues ignorées : ${unknown.join(', ')}.`, file, 'ligne 1');
  }
  const mapping = header.map((h) => known.get(h));

  const rows: T[] = [];
  let valueErrors = 0;
  let orderError = false;
  let prevT = -Infinity;
  const valueError = (msg: string, line: number) => {
    valueErrors++;
    if (valueErrors <= MAX_VALUE_ERRORS) issues.add('FXF_E_CSV_VALUE', msg, file, `ligne ${line}`);
  };

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i].split(',');
    if (cells.length !== header.length) {
      valueError(`${cells.length} cellules au lieu de ${header.length}.`, lineNo);
      continue;
    }
    const row: Record<string, number> = {};
    let ok = true;
    for (let j = 0; j < cells.length; j++) {
      const spec = mapping[j];
      if (!spec) continue;
      const cell = cells[j].trim();
      if (cell === '') {
        if (spec.required) {
          valueError(`Valeur obligatoire « ${spec.name} » vide.`, lineNo);
          ok = false;
        }
        continue;
      }
      if (!(spec.kind === 'int' ? INT_RE : NUM_RE).test(cell)) {
        valueError(`« ${spec.name} » : valeur mal formée « ${cell} ».`, lineNo);
        ok = false;
        continue;
      }
      const v = Number(cell);
      if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) {
        valueError(`« ${spec.name} » : ${cell} hors bornes.`, lineNo);
        ok = false;
        continue;
      }
      row[spec.key] = v;
    }
    if (!ok) continue;
    const t = row.t;
    if (t <= prevT && !orderError) {
      orderError = true;
      issues.add('FXF_E_CSV_ORDER', `« t » non strictement croissant (${t} après ${prevT}).`, file, `ligne ${lineNo}`);
    }
    prevT = Math.max(prevT, t);
    rows.push(row as T);
  }

  if (valueErrors > MAX_VALUE_ERRORS) {
    issues.add('FXF_E_CSV_VALUE', `${valueErrors - MAX_VALUE_ERRORS} autres erreurs de valeur non détaillées.`, file);
  }
  return valueErrors || orderError ? undefined : rows;
}

/** Formate un nombre sans notation scientifique ni zéros inutiles. */
function formatNumber(v: number, kind: Kind, decimals: number): string {
  if (!Number.isFinite(v)) throw new Error(`Valeur non finie : ${v}`);
  if (kind === 'int') {
    if (!Number.isInteger(v)) throw new Error(`Entier attendu : ${v}`);
    return BigInt(v).toString();
  }
  const s = v.toFixed(decimals);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Décimales écrites par colonne : 7 pour les coordonnées (~1 cm), 3 ailleurs. */
const DECIMALS: Record<string, number> = { lat: 7, lon: 7, x: 5, y: 5, z: 5, hpa: 3 };

/**
 * Écrit un CSV FXF. Seules les colonnes obligatoires et celles qui ont au moins une valeur sont écrites.
 * Les lignes doivent déjà être triées par `t` strictement croissant.
 */
export function formatCsv<T>(rows: readonly T[], columns: ColumnSpec<T>[]): string {
  const used = columns.filter((c) => c.required || rows.some((r) => r[c.key] !== undefined && r[c.key] !== null));
  const out: string[] = [used.map((c) => c.name).join(',')];
  let prevT = -Infinity;
  for (const r of rows) {
    const t = r['t' as keyof T] as unknown as number;
    if (!(t > prevT)) throw new Error(`Lignes non triées par t strictement croissant (${t} après ${prevT}).`);
    prevT = t;
    out.push(
      used
        .map((c) => {
          const v = r[c.key] as unknown as number | undefined | null;
          if (v === undefined || v === null) {
            if (c.required) throw new Error(`Valeur obligatoire « ${c.name} » manquante.`);
            return '';
          }
          return formatNumber(v, c.kind, DECIMALS[c.name] ?? 3);
        })
        .join(','),
    );
  }
  return out.join('\n') + '\n';
}
