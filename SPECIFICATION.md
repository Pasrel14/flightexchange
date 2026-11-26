# Flight Exchange Format (FXF) — Specification 1.0

| | |
|---|---|
| Format version | **1.0** |
| Status | Working draft (adopted by FlightRecorder and FlightBook) |
| Date | 2026-11-20 |
| Schemas | [`schema/manifest.schema.json`](schema/manifest.schema.json), [`schema/flight.schema.json`](schema/flight.schema.json) |

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** in this document are to be
interpreted as described in RFC 2119.

---

## 1. Purpose

FXF describes **one recorded flight** (paragliding, hang gliding…) in a single, self-contained, versioned file.
It is the contract between a **producer** (today FlightRecorder, Android) and a **consumer** (today FlightBook,
web). Neither application knows the other's internal model: this document alone is authoritative.

Principles:

1. **Raw data first.** The file carries measurements as they were acquired. Statistics are informative:
   the consumer can always recompute them.
2. **Absent rather than invented.** An unavailable measurement is omitted (empty cell, missing field),
   never replaced by 0 or by an interpolation.
3. **Everything is optional except the bare minimum**: a flight without a barometer, without inertial
   sensors and without a known landing is still a valid file.
4. **Transport-independent.** The same file is used for manual export, upload to an API and direct
   synchronisation (§ 12).

## 2. Container

- An FXF file is a **ZIP** archive (*stored* or *deflate* methods only, no encryption).
- Extension: **`.fxf`**. MIME type: `application/vnd.flight-exchange+zip`.
- Suggested file name: `YYYY-MM-DD_HHMM_<site>.fxf` (local takeoff time). The name carries no meaning:
  a consumer MUST NOT depend on it.
- Internal paths use `/`, are relative, UTF-8 and case-sensitive. They MUST NOT start with `/`, nor contain
  `..`, `\` or a drive letter.
- An FXF file contains **exactly one flight**. Several flights = several files.

### 2.1 Contents

```
2026-11-20_0930_morteau.fxf
├── manifest.json          REQUIRED  inventory, format version
├── flight.json            REQUIRED  flight description
├── track.csv              REQUIRED  reference GNSS track
├── sensors/               optional  raw sensor data
│   ├── pressure.csv
│   ├── accelerometer.csv
│   └── gyroscope.csv
├── track.igc              optional  derived copy, for interoperability
├── track.gpx              optional  derived copy, for interoperability
└── media/                 optional  photos
    └── 0001.jpg
```

A consumer MUST ignore (and report in the import report) any file it does not know.

### 2.2 Limits

To protect itself against malicious archives, a consumer SHOULD reject an archive whose total uncompressed
size exceeds **512 MiB**, in which a single file exceeds **256 MiB**, or which has more than **10,000** entries.
A producer MUST stay within these limits.

## 3. Versions and compatibility

- `formatVersion` is `"MAJOR.MINOR"` (e.g. `"1.0"`).
- **Minor**: backward-compatible additions only (new optional fields or files, new values in enumerations
  marked as extensible).
- **Major**: any incompatible change.
- A consumer implementing `X.Y`:
  - MUST accept any `X.*` file; if the minor version is newer, it ignores what it does not know and reports
    it (warning `FXF_W_NEWER_MINOR`);
  - MUST reject a different major version (`FXF_E_UNSUPPORTED_VERSION`) with an explicit message.
- A consumer MUST ignore unknown JSON fields and unknown CSV columns.
- A producer MUST produce files that are valid in **strict mode** (§ 11.3): no field outside the
  specification, except inside `extensions`.

## 4. Common conventions

| Quantity | Unit / format |
|---|---|
| Instant (JSON) | ISO 8601 UTC with `Z`, millisecond precision recommended: `2026-11-20T09:30:00.000Z` |
| Instant (CSV) | integer, milliseconds since the Unix epoch, UTC |
| Time zone | IANA identifier (`Europe/Paris`) |
| Coordinates | WGS84 decimal degrees, at least 7 decimals in CSV |
| Distances, altitudes, accuracies | metres |
| Speeds (horizontal and vertical) | m/s; vertical speed is positive when climbing |
| Durations | seconds |
| Bearing | degrees, 0–360, true (not magnetic), clockwise from north |
| Pressure | hectopascals (hPa) |
| Acceleration | m/s², device frame (Android convention) |
| Angular rate | rad/s, device frame |
| Identifiers | UUID (RFC 9562), lowercase |

Converting units for display (km/h, km, feet…) is the consumer's business.

### 4.1 Altitudes

Three distinct altitudes may coexist. They are **never** mixed in the same column:

| Name | Reference | Typical origin |
|---|---|---|
| `alt_ellipsoid` | WGS84 ellipsoid | raw GNSS (`Location.getAltitude()` on Android) |
| `alt_msl` | mean sea level (geoid) | GNSS corrected with a geoid model (`AltitudeConverter`, Android 14+) |
| `alt_pressure` | ISA standard atmosphere, 1013.25 hPa (QNE) | barometer |

In France the ellipsoid–geoid separation is about +50 m: confusing the two skews altitudes.
If `alt_msl` is provided, `flight.json` MUST state the model used (`recording.geoidModel`).

Recommended display altitude for consumers: `alt_msl`; otherwise `alt_ellipsoid` corrected with the
consumer's own geoid model; otherwise raw `alt_ellipsoid` (warning `FXF_W_ELLIPSOID_ONLY`).
`alt_pressure` is meant for the variometer and the altitude profile, not as an absolute altitude.

### 4.2 CSV format

All `.csv` files follow these rules (a subset of RFC 4180):

- UTF-8 without BOM, `\n` line endings (a consumer MUST also accept `\r\n`);
- `,` as separator, `.` as decimal separator, no thousands separator, no quotes;
- first line = header with column names; column order is free;
- empty cell = absent value; `NaN`, `null`, `-` are forbidden;
- scientific notation is forbidden;
- rows sorted by `t` **strictly increasing** (the producer removes duplicates).

## 5. `manifest.json`

Archive inventory, readable without interpreting anything else. Schema: `schema/manifest.schema.json`.

```json
{
  "format": "flight-exchange",
  "formatVersion": "1.0",
  "flightId": "3f0b8c1e-6a5d-4c1f-9a7e-2b4d8e9f0a12",
  "createdAt": "2026-11-20T11:20:04.512Z",
  "producer": { "name": "FlightRecorder", "version": "0.2.0", "platform": "android" },
  "files": [
    { "path": "flight.json", "role": "flight", "mediaType": "application/json", "size": 1834, "sha256": "…" },
    { "path": "track.csv", "role": "track", "mediaType": "text/csv", "size": 412020, "sha256": "…" },
    { "path": "sensors/pressure.csv", "role": "sensor", "mediaType": "text/csv", "size": 220114, "sha256": "…" }
  ]
}
```

| Field | Req. | Description |
|---|---|---|
| `format` | yes | always `"flight-exchange"` |
| `formatVersion` | yes | `"MAJOR.MINOR"` |
| `flightId` | yes | equal to `flight.json` → `id` |
| `createdAt` | yes | creation time of the archive (not of the flight) |
| `producer.name`, `producer.version` | yes | producing application |
| `producer.platform` | no | `android`, `ios`, `web`, `desktop`, `server`, … |
| `files[]` | yes | every file in the archive **except** `manifest.json` itself |
| `files[].path` | yes | path inside the archive |
| `files[].role` | yes | `flight`, `track`, `sensor`, `track-igc`, `track-gpx`, `media`, `other` |
| `files[].mediaType` | no | MIME type |
| `files[].size` | no | uncompressed size in bytes |
| `files[].sha256` | no (SHOULD) | SHA-256 digest, lowercase hexadecimal |
| `extensions` | no | see § 10 |

Rules: every listed file MUST exist; `size` and `sha256`, when present, MUST match.
A file present but not listed is ignored (`FXF_W_UNLISTED_FILE`).

## 6. `flight.json`

Normalised flight description. Schema: `schema/flight.schema.json`.

```json
{
  "id": "3f0b8c1e-6a5d-4c1f-9a7e-2b4d8e9f0a12",
  "revision": 1,
  "activity": "paragliding",
  "title": "Morning flight",
  "takeoff": { "time": "2026-11-20T09:30:12.000Z", "latitude": 47.0571, "longitude": 6.6074, "altitude": 1102, "siteName": "Morteau" },
  "landing": { "time": "2026-11-20T11:15:40.000Z", "latitude": 47.0702, "longitude": 6.5391, "altitude": 752 },
  "timezone": "Europe/Paris",
  "pilot": { "name": "Example Pilot" },
  "equipment": { "glider": { "brand": "Ozone", "model": "Rush 6", "size": "MS", "certification": "EN-B" } },
  "statistics": { "durationSeconds": 6328, "trackLengthMeters": 31450, "maxAltitudeMeters": 1850, "maxClimbRate": 4.2, "maxSinkRate": -3.1 },
  "recording": {
    "device": { "manufacturer": "Google", "model": "Pixel 8", "os": "Android", "osVersion": "15" },
    "locationProvider": "fused",
    "nominalIntervalMs": 1000,
    "sensors": { "barometer": true, "accelerometer": true, "gyroscope": true },
    "detection": "automatic",
    "resumeCount": 0
  }
}
```

### 6.1 Fields

| Field | Req. | Description |
|---|---|---|
| `id` | **yes** | flight UUID, generated **once** by the producer and **kept forever** (re-exports included) |
| `revision` | no (default 1) | integer ≥ 1, incremented when the producer re-exports a modified flight (recomputation, re-splitting) |
| `activity` | **yes** | `paragliding`, `hang-gliding`, `speed-flying`, `sailplane`, `other` (extensible) |
| `takeoff` | **yes** | takeoff point (see 6.2); `time` is required |
| `landing` | no | landing point; absent if the flight did not end normally |
| `timezone` | no (SHOULD) | IANA time zone of the takeoff, used to compute the local date |
| `title`, `notes` | no | free text entered by the pilot |
| `pilot` | no | `{ name }` |
| `equipment` | no | `{ glider, harness, reserve, instrument }`, each `{ brand, model, size?, certification?, serial? }` |
| `statistics` | no | informative statistics (6.3) |
| `recording` | no (SHOULD) | recording conditions (6.4) |
| `media[]` | no | `{ path, caption?, takenAt? }` for each photo in `media/` |
| `extensions` | no | see § 10 |

### 6.2 Takeoff / landing points

`{ time, latitude?, longitude?, altitude?, siteName? }`. `altitude` is in metres above mean sea level;
if the producer can only provide an ellipsoidal altitude, it omits it.
The takeoff `time` MUST lie within the time range covered by `track.csv`.

The track MAY extend before takeoff and after landing (producer's ring buffer, waiting on the ground):
`takeoff.time` and `landing.time` delimit the flight. A consumer that does not trust the producer's
detection MAY recompute these instants, but SHOULD offer the file's values by default.

### 6.3 Statistics

All optional, computed by the producer over the interval [takeoff, landing]:

| Field | Unit |
|---|---|
| `durationSeconds` | s |
| `trackLengthMeters` | m, sum of segments |
| `straightDistanceMeters` | m, takeoff → landing |
| `maxDistanceFromTakeoffMeters` | m |
| `maxAltitudeMeters`, `minAltitudeMeters` | m (display reference, § 4.1) |
| `altitudeGainMeters` | m, cumulative positive gain |
| `maxClimbRate` | m/s (> 0) |
| `maxSinkRate` | m/s (< 0) |
| `maxGroundSpeed` | m/s |

A consumer MUST NOT prefer them over its own computation on the track if it performs one; they are meant
for previews and cross-checking.

### 6.4 Recording conditions (`recording`)

| Field | Description |
|---|---|
| `device` | `{ manufacturer, model, os, osVersion }` |
| `locationProvider` | `fused`, `platform`, `external`, `simulated`, `mixed` |
| `nominalIntervalMs` | target GNSS interval in flight (e.g. 1000) |
| `sensors` | `{ barometer, accelerometer, gyroscope }`: sensors **present on the device** (booleans) |
| `geoidModel` | model used for `alt_msl` (e.g. `EGM2008`); required if that column exists |
| `detection` | `automatic` or `manual` (started/stopped by the pilot) |
| `resumeCount` | number of resumptions after an interruption during the flight |
| `gaps[]` | `{ start, end }`: known gaps in the track (GNSS loss, killed process) |

A `simulated` file MUST be flagged to the user by the consumer (`FXF_W_SIMULATED`).

## 7. `track.csv` — reference track

This is the **only source of truth** for position. At least **2 rows**.

| Column | Req. | Type | Description |
|---|---|---|---|
| `t` | **yes** | integer | UTC instant, ms (§ 4) |
| `lat` | **yes** | decimal | latitude, −90…90 |
| `lon` | **yes** | decimal | longitude, −180…180 |
| `alt_ellipsoid` | no | decimal | m, § 4.1 |
| `alt_msl` | no | decimal | m, § 4.1 |
| `alt_pressure` | no | decimal | m, QNE pressure altitude at the same instant (§ 4.1) |
| `h_acc` | no | decimal | horizontal accuracy, m (68 % radius) |
| `v_acc` | no | decimal | vertical accuracy, m |
| `speed` | no | decimal | ground speed measured by GNSS, m/s |
| `bearing` | no | decimal | ground track, degrees |
| `sats` | no | integer | satellites used |
| `elapsed_ns` | no | integer | device monotonic clock, ns (diagnostics) |

Example:

```csv
t,lat,lon,alt_ellipsoid,alt_msl,alt_pressure,h_acc,v_acc,speed,bearing
1795167012000,47.0571023,6.6074410,1151.2,1102.0,1088.4,3.8,5.1,0.4,
1795167013000,47.0571190,6.6074122,1151.0,1101.8,1088.1,3.6,4.9,6.2,281.5
```

Rules:

- a row is only written when the GNSS provided a fix; gaps stay gaps;
- `alt_pressure` is only filled in when a barometer sample is available within ±2 s;
- at least one of the `alt_ellipsoid`, `alt_msl` columns SHOULD exist (otherwise `FXF_W_NO_GNSS_ALTITUDE`).

## 8. `sensors/` — raw sensor data (optional)

One file per sensor. Reserved names:

| File | Columns | Unit |
|---|---|---|
| `sensors/pressure.csv` | `t`, `elapsed_ns`?, `hpa` | hPa |
| `sensors/accelerometer.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | m/s², gravity included |
| `sensors/gyroscope.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | rad/s |
| `sensors/magnetometer.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | µT (reserved) |

Same CSV rules as § 4.2. Samples MAY cover a wider interval than the flight.
A producer MAY downsample to limit size; it MUST NOT interpolate.
A consumer that does not use a sensor simply ignores it.

## 9. Derived files and media

- `track.igc` (role `track-igc`) and `track.gpx` (role `track-gpx`) are **convenience copies** generated
  from the same data, for third-party tools. An FXF consumer MUST use `track.csv`; it MAY offer to download
  the copies as they are.
- `media/` contains JPEG, PNG or WebP images (role `media`), described in `flight.json` → `media[]`.

## 10. Extensions

Application-specific data, ignored by others:

```json
"extensions": {
  "com.flightrecorder": { "sessionId": 42, "engineVersion": "2.1" }
}
```

Keys = reverse domain names. The content is free-form and not validated. A consumer MUST NOT require an
extension to import a flight. Extension data that is useful to everyone is meant to move into a later
minor version.

## 11. Validation and import

### 11.1 Validation steps (consumer)

1. Readable ZIP archive, within the limits of § 2.2, safe paths.
2. `manifest.json` present, valid JSON, conforming to the schema; supported major version.
3. Listed files present; sizes and digests checked when provided.
4. `flight.json` present, conforming to the schema, `id` = `manifest.flightId`.
5. `track.csv` present, header with `t`, `lat`, `lon`, well-formed and in-range values, `t` strictly
   increasing, at least 2 rows.
6. Consistency: `takeoff.time` (and `landing.time`) within the track's time range, `landing` after `takeoff`,
   `geoidModel` present if `alt_msl` exists, declared media present.
7. Sensors: same checks as in 5; an error in an optional sensor **does not prevent** importing the flight
   (the sensor is discarded and reported).

An **error** (`FXF_E_*`) prevents the import. A **warning** (`FXF_W_*`) is shown in the import report.

### 11.2 Import behaviour

- **Preview** before saving: date, site, duration, distance, sensors present, warnings.
- **Duplicates**: a flight whose `id` is already known is not created again.
  - same or lower `revision` → "already imported";
  - higher `revision` → offer to update the track and the producer's data, **without overwriting** what the
    user entered in the consumer (notes, rating, photos, linked equipment).
- The consumer MUST keep `id` (original identifier) and SHOULD keep `revision` and `producer`.
- **Import report**: data taken over, data ignored (unknown or discarded files, columns, sensors), warnings.

### 11.3 Strict mode (producer)

In addition to § 11.1, strict mode rejects any JSON field not defined by the specification (outside
`extensions`) and requires `sha256` and `size` for every file. A producer's tests MUST validate its exports
in strict mode.

### 11.4 Codes

| Code | Severity | Meaning |
|---|---|---|
| `FXF_E_NOT_ZIP` | error | unreadable archive |
| `FXF_E_LIMITS` | error | limits of § 2.2 exceeded |
| `FXF_E_UNSAFE_PATH` | error | forbidden path (§ 2) |
| `FXF_E_MISSING_MANIFEST` | error | `manifest.json` missing |
| `FXF_E_INVALID_JSON` | error | malformed JSON |
| `FXF_E_SCHEMA` | error | does not conform to the schema |
| `FXF_E_UNSUPPORTED_VERSION` | error | unsupported major version |
| `FXF_E_MISSING_FILE` | error | required or listed file missing |
| `FXF_E_SIZE_MISMATCH` | error | size differs from the manifest |
| `FXF_E_CHECKSUM` | error | digest differs from the manifest |
| `FXF_E_ID_MISMATCH` | error | `manifest.flightId` ≠ `flight.id` |
| `FXF_E_CSV_HEADER` | error | required column missing or duplicated |
| `FXF_E_CSV_VALUE` | error | malformed or out-of-range value |
| `FXF_E_CSV_ORDER` | error | `t` not strictly increasing |
| `FXF_E_TRACK_TOO_SHORT` | error | fewer than 2 points |
| `FXF_E_INCONSISTENT` | error | inconsistency between files (§ 11.1, step 6) |
| `FXF_E_STRICT` | error | strict mode only |
| `FXF_W_NEWER_MINOR` | warning | newer minor version |
| `FXF_W_UNKNOWN_FILE` | warning | unknown file or role, ignored |
| `FXF_W_UNLISTED_FILE` | warning | file missing from the manifest, ignored |
| `FXF_W_UNKNOWN_COLUMN` | warning | unknown CSV column, ignored |
| `FXF_W_SENSOR_DISCARDED` | warning | invalid sensor, discarded |
| `FXF_W_ELLIPSOID_ONLY` | warning | only the ellipsoidal altitude is provided |
| `FXF_W_NO_GNSS_ALTITUDE` | warning | no GNSS altitude |
| `FXF_W_SIMULATED` | warning | simulated track |
| `FXF_W_NO_CHECKSUM` | warning | file without `sha256` |

## 12. Transports

The exchanged content is always the `.fxf` archive, byte for byte.

| Mode | How it works |
|---|---|
| File | Android share sheet / download → drag and drop into FlightBook |
| API | `POST /flights` with `Content-Type: application/vnd.flight-exchange+zip`; response: import report (codes § 11.4); `409` if the `id` exists with a revision ≥ |
| Direct | same archive, another channel (Bluetooth, local network, intermediate cloud) |

## 13. Future work (not in 1.0)

- Several flights per archive (a whole day).
- Flight events (inflation, thermals, stalls) and wind data.
- Archive signature (authenticity for competitions).
- External sensors (BLE variometers).
