/**
 * Jeu de conformance : chaque fichier de tests/fixtures doit produire le résultat décrit dans
 * expected.json. Les implémentations FlightRecorder (Kotlin) et FlightBook doivent passer les mêmes cas.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFxf } from '../src/index.ts';

const dir = join(import.meta.dirname, 'fixtures');
const expected: Record<string, { description: string; ok: boolean; errors: string[]; warnings: string[]; strictErrors?: string[] }> = JSON.parse(
  readFileSync(join(dir, 'expected.json'), 'utf8'),
);

describe('conformance', () => {
  for (const [file, exp] of Object.entries(expected)) {
    it(`${file} — ${exp.description}`, async () => {
      const result = await readFxf(readFileSync(join(dir, file)));
      const codes = result.issues.map((i) => i.code);
      expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(exp.ok);
      for (const c of exp.errors) expect(codes).toContain(c);
      for (const c of exp.warnings) expect(codes).toContain(c);
      if (exp.ok) expect(result.fxf).toBeDefined();

      const strict = await readFxf(readFileSync(join(dir, file)), { strict: true });
      if (exp.strictErrors) {
        expect(strict.ok).toBe(false);
        for (const c of exp.strictErrors) expect(strict.issues.map((i) => i.code)).toContain(c);
      } else {
        expect(strict.ok).toBe(exp.ok);
      }
    });
  }
});

describe('examples', () => {
  it('complete.fxf expose toutes les données', async () => {
    const { ok, fxf, issues } = await readFxf(readFileSync(join(import.meta.dirname, '../examples/complete.fxf')), { strict: true });
    expect(ok, JSON.stringify(issues)).toBe(true);
    expect(issues).toEqual([]);
    expect(fxf!.flight.landing?.siteName).toBe('Doussard');
    expect(fxf!.track[0]).toMatchObject({ altMsl: expect.any(Number), altPressure: expect.any(Number), hAcc: expect.any(Number) });
    expect(fxf!.sensors.pressure!.length).toBeGreaterThan(1000);
    expect(fxf!.sensors.accelerometer![0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    expect(fxf!.gpx).toContain('<gpx');
    expect(fxf!.media.map((m) => m.path)).toEqual(['media/0001.png']);
    // le trou GNSS déclaré est bien un trou dans la trace (rien d'interpolé)
    const gap = fxf!.flight.recording!.gaps![0];
    const inGap = fxf!.track.filter((p) => p.t > Date.parse(gap.start) && p.t < Date.parse(gap.end));
    expect(inGap).toEqual([]);
  });

  it('minimal.fxf : les champs absents restent absents', async () => {
    const { fxf } = await readFxf(readFileSync(join(import.meta.dirname, '../examples/minimal.fxf')));
    expect(fxf!.track[0].altMsl).toBeUndefined();
    expect(fxf!.track[0].speed).toBeUndefined();
    expect(fxf!.sensors).toEqual({});
    expect(fxf!.flight.landing).toBeUndefined();
  });
});
