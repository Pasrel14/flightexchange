# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The package follows [SemVer](https://semver.org/);
the format version (`formatVersion`) is stated for each package version.

## [1.0.0] — 2026-11-26

Format **1.0**. First public release.

### Format

- ZIP container `.fxf`, `manifest.json`, `flight.json`, `track.csv`, sensors (`pressure`, `accelerometer`,
  `gyroscope`, reserved `magnetometer`), IGC/GPX copies, media, extensions, issue codes, strict mode.
- Schema `$id`s: `https://cdn.jsdelivr.net/npm/flight-exchange@1/schema/…`.
- Specification written in English.

### Package

- `readFxf`, `validateFxf`, `writeFxf`, `displayAltitude`, CSV helpers and schemas.
- Command-line validator `fxf-validate`.
- Examples and conformance suite (24 cases) included in the package.
- MIT license.
