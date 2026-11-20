#!/usr/bin/env node
/**
 * Valide un ou plusieurs fichiers FXF.
 *   node bin/fxf-validate.ts [--strict] [--json] fichier.fxf…
 * Code de sortie : 0 si tous les fichiers sont valides, 1 sinon, 2 pour un usage incorrect.
 * Pensé pour les tests et la CI des producteurs (FlightRecorder : --strict).
 */

import { readFileSync } from 'node:fs';
import { readFxf } from '../src/reader.ts';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const paths = args.filter((a) => !a.startsWith('--'));

if (!paths.length) {
  console.error('Usage : fxf-validate [--strict] [--json] fichier.fxf…');
  process.exit(2);
}

let allOk = true;
const report: unknown[] = [];
for (const path of paths) {
  const result = await readFxf(readFileSync(path), { strict });
  allOk &&= result.ok;
  if (asJson) {
    report.push({ path, ok: result.ok, flightId: result.fxf?.flight.id, points: result.fxf?.track.length, issues: result.issues, ignoredFiles: result.ignoredFiles });
    continue;
  }
  const f = result.fxf;
  console.log(`${result.ok ? '✔' : '✘'} ${path}${f ? ` — vol ${f.flight.id}, ${f.track.length} points, capteurs : ${Object.keys(f.sensors).join(', ') || 'aucun'}` : ''}`);
  for (const i of result.issues) {
    console.log(`   ${i.severity === 'error' ? 'erreur' : 'attention'} ${i.code}${i.file ? ` [${i.file}${i.location ? ` ${i.location}` : ''}]` : ''} : ${i.message}`);
  }
}
if (asJson) console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);
