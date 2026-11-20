# Intégration FlightRecorder (producteur)

Ce qu'il faut faire côté Android pour exporter des `.fxf` conformes, établi d'après le code de la Phase 1
(`data/db/entity/Entities.kt`, `core/model`).

## Correspondance avec le modèle actuel

| FXF | FlightRecorder |
|---|---|
| `flight.id` (UUID) | **à créer** : colonne `uuid` sur `FlightEntity`, générée à la création du vol, jamais régénérée (migration Room) |
| `flight.revision` | **à créer** : entier, +1 quand le vol est redécoupé ou recalculé |
| `takeoff.time` / `landing.time` | `FlightEntity.takeoffUtc` / `landingUtc` (`landing` omis si `null`) |
| `track.csv` → `t` | `TrackPointEntity.timeUtc` |
| `lat`, `lon` | `latitude`, `longitude` |
| `alt_ellipsoid` | `altitudeGps` (Android = ellipsoïde WGS84, cf. `docs/decisions/phase-1.md`) |
| `alt_msl` | `AltitudeConverter.addMslAltitudeToLocation()` (API 34+) ; sinon colonne absente. Renseigner `recording.geoidModel` |
| `alt_pressure` | `altitudeBaro` (déjà en QNE via `Atmosphere.pressureAltitude`, appariée à ±2 s) |
| `h_acc`, `v_acc`, `speed`, `bearing` | `horizontalAccuracy`, `verticalAccuracy`, `speed`, `bearing` |
| `elapsed_ns` | `elapsedRealtimeNanos` |
| `sensors/pressure.csv` (`hpa`) | `SensorSampleEntity` type `PRESSURE`, `x` |
| `sensors/accelerometer.csv`, `gyroscope.csv` | types `ACCELEROMETER`, `GYROSCOPE`, `x`, `y`, `z` |
| `recording.locationProvider` | `TrackPointEntity.source` (`FUSED` → `fused`, `PLATFORM` → `platform`, `SIMULATED` → `simulated`, plusieurs → `mixed`) |
| `recording.device` | `RecordingSessionEntity.deviceModel`, `Build.MANUFACTURER`, `Build.VERSION.RELEASE` |
| `recording.resumeCount` | `RecordingSessionEntity.resumeCount` |
| `recording.sensors` | `SensorAvailability` / `DeviceConfigurationEntity` |
| `statistics` | `FlightStatisticsEntity` (convertir si besoin : tout en m, s, m/s ; `maxSinkRate` négatif) |
| `extensions["com.flightrecorder"]` | `sessionId`, version du moteur… |

Points d'attention :

- La trace exportée PEUT inclure le tampon avant décollage et quelques secondes après l'atterrissage : ce sont les
  points de la session dans `[takeoff − marge, landing + marge]`.
- Trier par `timeUtc` et **supprimer les doublons de `t`** (une reprise après interruption peut en créer).
- Ne jamais écrire `0` pour une valeur `null` : cellule vide.
- Format des nombres : `Locale.ROOT` (point décimal), pas de notation scientifique (`BigDecimal.toPlainString()`
  ou formatage explicite), 7 décimales pour lat/lon.
- `ZipOutputStream` (deflate), `MessageDigest.getInstance("SHA-256")` pour le manifeste, `size` en octets.
- Partage : `FileProvider` + `Intent.ACTION_SEND`, type `application/vnd.flight-exchange+zip`.

## Tests de conformance

1. Test JVM qui exporte un vol de test puis vérifie l'archive en mode strict :
   `node ../flightexchange/bin/fxf-validate.ts --strict <fichier>` (code de sortie 0 attendu), à lancer depuis
   un test ou une étape de CI.
2. Optionnel : valider `manifest.json` et `flight.json` contre `schema/*.schema.json` avec une bibliothèque
   JSON Schema Java (ex. `com.networknt:json-schema-validator`).
3. Comparer la structure produite à `examples/complete/` (colonnes, unités, ordre de grandeur des valeurs).

## Prompt pour Claude Code (dans FlightRecorder)

> Consulte `../flightexchange` (SPECIFICATION.md, schema/, examples/, docs/integration-flightrecorder.md).
> Implémente l'export d'un vol au format FXF 1.0 dans un module dédié (ex. `export`), en Kotlin pur pour la
> construction de l'archive et testable sans Android. Ajoute l'UUID et la révision du vol (migration Room).
> Respecte intégralement le mode strict : unités, altitudes séparées, cellules vides pour les valeurs absentes,
> tri et dédoublonnage par `t`, manifeste avec `size` et `sha256`. Ajoute des tests unitaires et un test qui
> valide une archive produite avec `node ../flightexchange/bin/fxf-validate.ts --strict`.
