# flight-exchange

[![npm](https://img.shields.io/npm/v/flight-exchange)](https://www.npmjs.com/package/flight-exchange)
[![CI](https://github.com/Pasrel14/flightexchange/actions/workflows/ci.yml/badge.svg)](https://github.com/Pasrel14/flightexchange/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> **Flight Exchange Format (FXF)** is an open, versioned file format for exchanging free-flight recordings
> (paragliding, hang gliding): a ZIP archive holding the raw GNSS track, optional barometer and inertial
> sensor data, and flight metadata. This package ships the specification, JSON Schemas, a conformance suite
> and a reference reader / writer / validator in TypeScript. The specification is written in French.

**Flight Exchange Format (FXF)** : le format d'échange de vols entre **FlightRecorder** (Android, producteur)
et **FlightBook** (web, consommateur), ouvert à tout autre outil de vol libre. Ce dépôt est la
**source de vérité** : chaque application l'implémente, aucune ne dicte son modèle interne aux autres.

```
FlightRecorder ──► vol.fxf (ZIP : manifest.json, flight.json, track.csv, sensors/…) ──► FlightBook
   Kotlin                       ce dépôt : spécification + schémas + tests                  TypeScript
```

## Contenu

| Chemin | Rôle |
|---|---|
| [SPECIFICATION.md](SPECIFICATION.md) | **la spécification** (format 1.0) — c'est elle qui fait foi |
| [schema/](schema/) | JSON Schema 2020-12 de `manifest.json` et `flight.json` |
| [examples/](examples/) | `minimal.fxf` et `complete.fxf`, plus leur contenu décompressé pour lecture |
| [tests/fixtures/](tests/fixtures/) | jeu de conformance : 24 archives valides/invalides + [`expected.json`](tests/fixtures/expected.json) |
| [src/](src/) | bibliothèque de référence : `readFxf`, `writeFxf`, validation tolérante / stricte |
| [bin/fxf-validate.ts](bin/fxf-validate.ts) | validateur en ligne de commande |
| [docs/](docs/) | guides d'intégration [FlightRecorder](docs/integration-flightrecorder.md) et [FlightBook](docs/integration-flightbook.md) |

## Les choix structurants, en bref

- **Une archive `.fxf` = un vol**, ZIP, versionnée (`formatVersion` `MAJEUR.MINEUR`).
- **`track.csv` est la trace de référence** (pas le GPX) : il garde la précision, l'altitude-pression,
  la précision GNSS, la vitesse… GPX et IGC peuvent être joints comme copies de commodité.
- **Trois altitudes jamais mélangées** : `alt_ellipsoid` (GNSS brut Android), `alt_msl` (géoïde), `alt_pressure` (QNE).
- **UUID du vol attribué par le producteur et conservé à vie** + `revision` : doublons et mises à jour sans ambiguïté.
- **SI partout** (m, s, m/s, hPa), instants UTC ; la conversion pour l'affichage est l'affaire du consommateur.
- **Absent plutôt qu'inventé** : cellule vide, jamais 0 ni interpolation.
- **Tolérant en lecture, strict en écriture** : le consommateur ignore l'inconnu, le producteur est validé en mode strict.
- **Codes d'anomalie partagés** (`FXF_E_*`, `FXF_W_*`) pour les rapports d'import et la future API.

## Installation

```powershell
npm install flight-exchange
```

Fonctionne dans le navigateur (Vite, webpack…) et dans Node ≥ 20.10. ESM uniquement, types TypeScript inclus.

```ts
import { readFxf, writeFxf, displayAltitude } from 'flight-exchange';

const { ok, fxf, issues, ignoredFiles } = await readFxf(await file.arrayBuffer());
if (ok) {
  fxf.flight.takeoff.time;                     // '2026-08-14T11:02:00.000Z'
  fxf.track.map((p) => displayAltitude(p));    // alt_msl, sinon alt_ellipsoid
}
```

### Valider un fichier (toute plateforme, y compris un producteur Kotlin)

```powershell
npx -p flight-exchange fxf-validate --strict mon-vol.fxf
```

Code de sortie 0 si le fichier est valide ; `--json` pour un rapport exploitable en CI.

### Schémas et jeu de conformance

- Schémas en ligne (identifiants `$id`, utilisables par les éditeurs JSON) :
  `https://cdn.jsdelivr.net/npm/flight-exchange@1/schema/flight.schema.json` et `…/manifest.schema.json`.
- Le paquet npm contient aussi `examples/*.fxf` et `tests/fixtures/` : une implémentation dans un autre langage
  peut les récupérer depuis le paquet ou depuis l'archive de la release GitHub correspondante.

## Versions

Deux numéros indépendants :

| | Exemple | Change quand |
|---|---|---|
| **Version du format** (`formatVersion`) | `1.0` | la spécification change (§ 3) |
| **Version du paquet** (npm, tags `v*`) | `1.0.0` | la bibliothèque change ; le majeur du paquet suit le majeur du format |

Une correction de la bibliothèque (`1.0.1`) ne change pas le format ; une version mineure du format (`1.1`)
donne au moins une version mineure du paquet (`1.1.0`). Détails dans [CHANGELOG.md](CHANGELOG.md).

## Développement

Node ≥ 22.18 (les scripts et tests exécutent le TypeScript directement).

```powershell
npm install
```

```powershell
npm test
```

```powershell
node scripts/make-examples.ts
```

La dernière commande régénère `examples/` et `tests/fixtures/` de façon déterministe.
Publication : voir [RELEASING.md](RELEASING.md).

## Faire évoluer le format

1. Modifier `SPECIFICATION.md`, puis les schémas, puis `src/types.ts`.
2. Ajout compatible → version mineure ; sinon → majeure (§ 3).
3. Ajouter un cas dans `scripts/make-examples.ts`, régénérer, `npm test`.
4. Noter le changement dans [CHANGELOG.md](CHANGELOG.md).

## Licence

[MIT](LICENSE). Vous pouvez implémenter FXF dans n'importe quel logiciel, libre ou non.
