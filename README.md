# flight-exchange

[![npm](https://img.shields.io/npm/v/flight-exchange)](https://www.npmjs.com/package/flight-exchange)
[![CI](https://github.com/Pasrel14/flightexchange/actions/workflows/ci.yml/badge.svg)](https://github.com/Pasrel14/flightexchange/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Flight Exchange Format (FXF)** is an open, versioned file format for exchanging free-flight recordings
(paragliding, hang gliding): a ZIP archive holding the raw GNSS track, optional barometer and inertial
sensor data, and flight metadata. This package ships the specification, JSON Schemas, a conformance suite
and a reference reader / writer / validator in TypeScript.

FXF was created as the contract between **FlightRecorder** (Android, producer) and **FlightBook** (web,
consumer), and is open to any other free-flight tool. This repository is the **source of truth**: each
application implements it, none imposes its internal model on the others.

```
FlightRecorder ──► flight.fxf (ZIP: manifest.json, flight.json, track.csv, sensors/…) ──► FlightBook
   Kotlin                    this repository: specification + schemas + tests                TypeScript
```

## Contents

| Path | Purpose |
|---|---|
| [SPECIFICATION.md](SPECIFICATION.md) | **the specification** (format 1.0) — it is authoritative |
| [schema/](schema/) | JSON Schema 2020-12 for `manifest.json` and `flight.json` |
| [examples/](examples/) | `minimal.fxf` and `complete.fxf`, plus their unzipped contents for reading |
| [tests/fixtures/](tests/fixtures/) | conformance suite: 24 valid/invalid archives + [`expected.json`](tests/fixtures/expected.json) |
| [src/](src/) | reference library: `readFxf`, `writeFxf`, lenient / strict validation |
| [bin/fxf-validate.ts](bin/fxf-validate.ts) | command-line validator |

## Key design decisions

- **One `.fxf` archive = one flight**, ZIP, versioned (`formatVersion` `MAJOR.MINOR`).
- **`track.csv` is the reference track** (not GPX): it keeps full precision, pressure altitude, GNSS accuracy,
  speed… GPX and IGC may be included as convenience copies.
- **Three altitudes, never mixed**: `alt_ellipsoid` (raw Android GNSS), `alt_msl` (geoid), `alt_pressure` (QNE).
- **Flight UUID assigned by the producer and kept forever** + `revision`: unambiguous duplicates and updates.
- **SI units everywhere** (m, s, m/s, hPa), UTC instants; converting for display is the consumer's job.
- **Absent rather than invented**: empty cell, never 0 nor interpolation.
- **Lenient when reading, strict when writing**: consumers ignore what they don't know; producers are validated in strict mode.
- **Shared issue codes** (`FXF_E_*`, `FXF_W_*`) for import reports and a future API.

## Installation

```powershell
npm install flight-exchange
```

Works in the browser (Vite, webpack…) and in Node ≥ 20.10. ESM only, TypeScript types included.

```ts
import { readFxf, writeFxf, displayAltitude } from 'flight-exchange';

const { ok, fxf, issues, ignoredFiles } = await readFxf(await file.arrayBuffer());
if (ok) {
  fxf.flight.takeoff.time;                     // '2026-08-14T11:02:00.000Z'
  fxf.track.map((p) => displayAltitude(p));    // alt_msl, otherwise alt_ellipsoid
}
```

Each issue carries a stable `code` (to translate in your UI) and a human-readable `message`, currently in French.

### Validating a file (any platform, including a Kotlin producer)

```powershell
npx -p flight-exchange fxf-validate --strict my-flight.fxf
```

Exit code 0 when the file is valid; `--json` for a machine-readable report in CI.

### Schemas and conformance suite

- Online schemas (their `$id`, usable by JSON editors):
  `https://cdn.jsdelivr.net/npm/flight-exchange@1/schema/flight.schema.json` and `…/manifest.schema.json`.
- The npm package also contains `examples/*.fxf` and `tests/fixtures/`: an implementation in another language
  can take them from the package or from the matching GitHub release archive.

## Versioning

Two independent numbers:

| | Example | Changes when |
|---|---|---|
| **Format version** (`formatVersion`) | `1.0` | the specification changes (§ 3) |
| **Package version** (npm, `v*` tags) | `1.0.0` | the library changes; the package major follows the format major |

A library fix (`1.0.1`) does not change the format; a minor format version (`1.1`) yields at least a minor
package version (`1.1.0`). Details in [CHANGELOG.md](CHANGELOG.md).

## Development

Node ≥ 22.18 (scripts and tests run TypeScript directly).

```powershell
npm install
```

```powershell
npm test
```

```powershell
node scripts/make-examples.ts
```

The last command regenerates `examples/` and `tests/fixtures/` deterministically.
Publishing: see [RELEASING.md](RELEASING.md). Integration notes for the two original applications are in
[docs/](docs/) (in French).

## Evolving the format

1. Update `SPECIFICATION.md`, then the schemas, then `src/types.ts`.
2. Compatible addition → minor version; otherwise → major (§ 3).
3. Add a case to `scripts/make-examples.ts`, regenerate, run `npm test`.
4. Record the change in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). You may implement FXF in any software, open source or not.
