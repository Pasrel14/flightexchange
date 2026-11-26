# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The package follows [SemVer](https://semver.org/);
the format version (`formatVersion`) is stated for each package version.

## [1.1.0] — 2026-11-26

Format **1.1**, backward-compatible with 1.0 (a 1.0 reader reports `FXF_W_NEWER_MINOR` and ignores the
additions). Changes come from the FlightRecorder implementation review; details in appendix A of the
specification.

### Format

- New optional `events.csv` (role `events`): detection-engine and pilot events (`takeoff_candidate`,
  `takeoff`, `landing_candidate`, `landing`, `manual_takeoff`, `manual_landing`, `interruption`, `resume`),
  extensible with reverse-domain prefixes; `t` non-decreasing. New warning `FXF_W_EVENTS_DISCARDED`.
- New optional `takeoff.detection` / `landing.detection` (`automatic`, `manual`).
- Clarified: `geoidModel` may name a conversion service (`android.location.altitude`); `gaps[]` are unplanned
  losses and may extend beyond the flight; `max/minAltitudeMeters` are MSL only; `v_acc` is 68 %;
  `elapsed_ns` is diagnostics only; the gyroscope is calibrated; sensors should stay at or below 100 Hz;
  IGC copies are not assumed to be signed.

### Package

- `FORMAT_VERSION` is `1.1`; `writeFxf` writes 1.1 files and accepts `events`.
- `readFxf` returns `fxf.events`; `EVENT_COLUMNS`, `EVENT_TYPES`, `EVENT_TYPE_RE`, `FlightEvent`, `Detection`.
- `parseCsv` / `formatCsv` accept `{ order: 'nondecreasing' }` and text columns.
- Conformance suite: 27 cases (`format-1.0`, `bad-events`, `custom-event-types` added).

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
