import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { Issues, TRACK_COLUMNS, displayAltitude, formatCsv, isSafePath, parseCsv, readFxf, strictVariant, writeFxf, type TrackPoint } from '../src/index.ts';

const track: TrackPoint[] = [
  { t: 1_000, lat: 45.1234567, lon: 6.1, altEllipsoid: 1200.25 },
  { t: 2_000, lat: 45.1234568, lon: 6.1000001, altEllipsoid: 1201, speed: 0.000001 },
];

describe('csv', () => {
  it('aller-retour sans perte ni notation scientifique', () => {
    const text = formatCsv(track, TRACK_COLUMNS);
    expect(text).toBe('t,lat,lon,alt_ellipsoid,speed\n1000,45.1234567,6.1,1200.25,\n2000,45.1234568,6.1000001,1201,0\n');
    const issues = new Issues();
    expect(parseCsv(text, TRACK_COLUMNS, 'track.csv', issues)).toEqual([
      { t: 1000, lat: 45.1234567, lon: 6.1, altEllipsoid: 1200.25 },
      { t: 2000, lat: 45.1234568, lon: 6.1000001, altEllipsoid: 1201, speed: 0 },
    ]);
    expect(issues.list).toEqual([]);
  });

  it('refuse les lignes non triées à l’écriture', () => {
    expect(() => formatCsv([track[1], track[0]], TRACK_COLUMNS)).toThrow(/strictement croissant/);
  });

  it('refuse NaN, notation scientifique et nombre de cellules incorrect', () => {
    for (const bad of ['1000,1e1,6', '1000,NaN,6', '1000,45']) {
      const issues = new Issues();
      expect(parseCsv(`t,lat,lon\n${bad}\n`, TRACK_COLUMNS, 'track.csv', issues)).toBeUndefined();
      expect(issues.list[0].code).toBe('FXF_E_CSV_VALUE');
    }
  });
});

describe('sécurité', () => {
  it('chemins', () => {
    for (const p of ['../x', '/x', 'a/../b', 'C:/x', 'a\\b', './x']) expect(isSafePath(p)).toBe(false);
    for (const p of ['track.csv', 'sensors/pressure.csv', 'media/a..b.jpg']) expect(isSafePath(p)).toBe(true);
  });

  it('bombe ZIP : refusée avant décompression', async () => {
    const zip = zipSync({ 'manifest.json': new Uint8Array(300 * 1024 * 1024) }, { level: 1 });
    const r = await readFxf(zip);
    expect(r.issues.map((i) => i.code)).toEqual(['FXF_E_LIMITS']);
  });
});

describe('schéma strict', () => {
  it('ferme les objets mais laisse les extensions ouvertes', () => {
    const s = strictVariant({
      type: 'object',
      properties: { a: { type: 'object', properties: {} }, extensions: { $ref: '#/$defs/extensions' } },
    }) as Record<string, any>;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.a.additionalProperties).toBe(false);
    expect(s.properties.extensions).toEqual({ $ref: '#/$defs/extensions' });
  });
});

describe('writer', () => {
  const input = {
    producer: { name: 'Test', version: '1' },
    flight: { id: '11111111-2222-4333-8444-555555555555', activity: 'paragliding', takeoff: { time: new Date(1_500).toISOString() } },
    track,
    createdAt: new Date(0),
  };

  it('est déterministe', async () => {
    expect(await writeFxf(input)).toEqual(await writeFxf(input));
  });

  it('refuse d’écrire un fichier non conforme', async () => {
    await expect(writeFxf({ ...input, flight: { ...input.flight, extra: 1 } as never })).rejects.toThrow(/FXF_E_STRICT/);
    await expect(writeFxf({ ...input, flight: { ...input.flight, takeoff: { time: new Date(99_000).toISOString() } } })).rejects.toThrow(/FXF_E_INCONSISTENT/);
    await expect(writeFxf({ ...input, events: [{ t: 0, type: 'thermal' }] })).rejects.toThrow(/FXF_E_STRICT/);
  });

  it('écrit events.csv avec des instants égaux', async () => {
    const events = [{ t: 1, type: 'takeoff_candidate', value: 0.9 }, { t: 1, type: 'takeoff' }, { t: 2, type: 'com.example.note' }];
    const { ok, fxf, issues } = await readFxf(await writeFxf({ ...input, events }), { strict: true });
    expect(ok, JSON.stringify(issues)).toBe(true);
    expect(fxf!.events).toEqual(events);
  });
});

describe('altitude', () => {
  it('ordre de préférence', () => {
    const p = { t: 0, lat: 45, lon: 6 };
    expect(displayAltitude({ ...p, altMsl: 1000, altEllipsoid: 1051 })).toBe(1000);
    expect(displayAltitude({ ...p, altEllipsoid: 1051 }, () => 51)).toBe(1000);
    expect(displayAltitude({ ...p, altEllipsoid: 1051 })).toBe(1051);
    expect(displayAltitude({ ...p, altPressure: 990 })).toBeUndefined();
  });
});
