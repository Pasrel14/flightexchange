import type { TrackPoint } from './types.ts';

/**
 * Altitude d'affichage recommandée (SPECIFICATION.md § 4.1) : `alt_msl`, sinon `alt_ellipsoid`
 * corrigée par le géoïde si le consommateur fournit `geoidUndulation(lat, lon)` (N, en m), sinon
 * `alt_ellipsoid` brute. Retourne `undefined` si le point n'a aucune altitude GNSS.
 */
export function displayAltitude(p: TrackPoint, geoidUndulation?: (lat: number, lon: number) => number): number | undefined {
  if (p.altMsl !== undefined) return p.altMsl;
  if (p.altEllipsoid !== undefined) return geoidUndulation ? p.altEllipsoid - geoidUndulation(p.lat, p.lon) : p.altEllipsoid;
  return undefined;
}
