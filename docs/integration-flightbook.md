# Intégration FlightBook (consommateur)

Ce qu'il faut faire côté web pour importer des `.fxf`, établi d'après `src/lib/types.ts`, `importer.ts` et `parsers/`.

## Brancher la bibliothèque

FlightBook utilise déjà `fflate` ; la bibliothèque de référence s'utilise directement depuis les sources TypeScript :

```json
"dependencies": { "flight-exchange": "file:../flightexchange" }
```

Dans `tsconfig.json` : `"allowImportingTsExtensions": true` et `"resolveJsonModule": true`
(sans effet sur le build, `noEmit` est déjà activé). Puis :

```ts
import { readFxf, displayAltitude, type Issue } from 'flight-exchange';
```

Un déploiement Cloudflare depuis un autre dépôt devra plutôt publier le paquet (npm privé ou dépendance git).

## Correspondance avec le modèle actuel

| FlightBook | FXF |
|---|---|
| `Flight.format` | nouvelle valeur `'fxf'` |
| `TrackPoint.t`, `lat`, `lon` | `t`, `lat`, `lon` |
| `TrackPoint.alt` | `displayAltitude(p)` (`alt_msl`, sinon `alt_ellipsoid`), sinon `alt_pressure` comme aujourd'hui pour l'IGC |
| `TrackPoint.pAlt` | `altPressure` |
| `Flight.date` | date locale du décollage dans `flight.timezone` s'il est fourni |
| `Flight.title`, `notes` | `title`, `notes` |
| `Flight.igcGlider` | `equipment.glider` → `` `${brand} ${model}` `` (réutilise `findGlider`) |
| `Flight.hash` | conserver le hash de trace, **et** ajouter `source: { flightId, revision, producer }` indexé sur `flightId` |
| `Photo` | `fxf.media` → `Blob` |
| `FlightStats` | toujours recalculées par `computeStats` ; `fxf.flight.statistics` sert à la prévisualisation |

Points d'attention :

- Doublons (§ 11.2) : chercher d'abord par `flightId`. Révision supérieure → proposer la mise à jour de la trace
  **sans toucher** aux notes, note, photos ni matériel saisis dans FlightBook.
- Décollage / atterrissage : `computeStats` les redétecte ; partir des instants du fichier quand ils existent
  (la trace inclut le tampon au sol du producteur).
- Les vitesses FXF sont en m/s ; `FlightStats.maxSpeedKmh` reste en km/h.
- Afficher les avertissements (`FXF_W_SIMULATED`, `FXF_W_ELLIPSOID_ONLY`, capteurs écartés…) dans le rapport
  d'import ; traduire à partir de `issue.code` dans `src/locales/*`.
- Les capteurs bruts (`fxf.sensors`) peuvent être ignorés au début ; les conserver permettra un vario barométrique plus tard.

## Tests de conformance

Rejouer `../flightexchange/tests/fixtures/*.fxf` dans l'importeur : chaque cas `ok: true` de `expected.json` doit
créer un vol, chaque cas `ok: false` doit produire une erreur, et réimporter `valid/complete.fxf` doit donner « doublon ».

## Prompt pour Claude Code (dans FlightBook)

> Consulte `../flightexchange` (SPECIFICATION.md, examples/, docs/integration-flightbook.md). Implémente l'import
> des fichiers `.fxf` en utilisant la bibliothèque de référence `flight-exchange` (`readFxf`) : ajoute l'extension
> à la zone d'import, la prévisualisation avant import, la détection des doublons par `flightId` et `revision`,
> l'import des photos, et un rapport d'import qui affiche les avertissements traduits. Ajoute des tests
> d'intégration qui rejouent tous les cas de `../flightexchange/tests/fixtures/expected.json`.
