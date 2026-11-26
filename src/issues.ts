/** Codes d'erreur et d'avertissement communs (SPECIFICATION.md § 11.4). */

export const ERROR_CODES = [
  'FXF_E_NOT_ZIP',
  'FXF_E_LIMITS',
  'FXF_E_UNSAFE_PATH',
  'FXF_E_MISSING_MANIFEST',
  'FXF_E_INVALID_JSON',
  'FXF_E_SCHEMA',
  'FXF_E_UNSUPPORTED_VERSION',
  'FXF_E_MISSING_FILE',
  'FXF_E_SIZE_MISMATCH',
  'FXF_E_CHECKSUM',
  'FXF_E_ID_MISMATCH',
  'FXF_E_CSV_HEADER',
  'FXF_E_CSV_VALUE',
  'FXF_E_CSV_ORDER',
  'FXF_E_TRACK_TOO_SHORT',
  'FXF_E_INCONSISTENT',
  'FXF_E_STRICT',
] as const;

export const WARNING_CODES = [
  'FXF_W_NEWER_MINOR',
  'FXF_W_UNKNOWN_FILE',
  'FXF_W_UNLISTED_FILE',
  'FXF_W_UNKNOWN_COLUMN',
  'FXF_W_SENSOR_DISCARDED',
  'FXF_W_EVENTS_DISCARDED',
  'FXF_W_ELLIPSOID_ONLY',
  'FXF_W_NO_GNSS_ALTITUDE',
  'FXF_W_SIMULATED',
  'FXF_W_NO_CHECKSUM',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type WarningCode = (typeof WARNING_CODES)[number];
export type IssueCode = ErrorCode | WarningCode;

export interface Issue {
  severity: 'error' | 'warning';
  code: IssueCode;
  /** Message lisible (français) ; l'interface du consommateur traduit à partir de `code`. */
  message: string;
  /** Fichier concerné dans l'archive. */
  file?: string;
  /** Emplacement précis : pointeur JSON (`/takeoff/time`) ou `ligne 12` pour un CSV. */
  location?: string;
}

/** Collecteur d'anomalies ; la gravité découle du préfixe du code. */
export class Issues {
  readonly list: Issue[] = [];

  add(code: IssueCode, message: string, file?: string, location?: string): void {
    const severity = code.startsWith('FXF_E_') ? 'error' : 'warning';
    this.list.push({ severity, code, message, ...(file ? { file } : {}), ...(location ? { location } : {}) });
  }

  get hasErrors(): boolean {
    return this.list.some((i) => i.severity === 'error');
  }
}
