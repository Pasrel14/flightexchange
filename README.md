# flight-exchange

**Flight Exchange Format (FXF)** : le protocole d'échange de vols entre **FlightRecorder** (Android, producteur)
et **FlightBook** (web, consommateur). Ce dépôt est la **source de vérité** : les deux applications
l'implémentent, aucune ne dicte son modèle interne à l'autre.

```
FlightRecorder ──► vol.fxf (ZIP : manifest.json, flight.json, track.csv, sensors/…) ──► FlightBook
   Kotlin                         ce dépôt : spécification + schémas + tests                 TypeScript
```

## Contenu

| Chemin | Rôle |
|---|---|
| [SPECIFICATION.md](SPECIFICATION.md) | **la spécification** (format 1.0) — c'est elle qui fait foi |
| [schema/](schema/) | JSON Schema 2020-12 de `manifest.json` et `flight.json` |
| [examples/](examples/) | `minimal.fxf` et `complete.fxf`, plus leur contenu décompressé pour lecture |
| [tests/fixtures/](tests/fixtures/) | jeu de conformance : 24 archives valides/invalides + [`expected.json`](tests/fixtures/expected.json) (résultat attendu, codes d'erreur) |
| [src/](src/) | bibliothèque TypeScript de référence : `readFxf`, `writeFxf`, validation tolérante / stricte |
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

## Utilisation

Node ≥ 22.18 (le TypeScript est exécuté directement, sans compilation).

```powershell
npm install
```

```powershell
npm test
```

```powershell
node bin/fxf-validate.ts --strict examples/complete.fxf
```

```powershell
node scripts/make-examples.ts
```

La dernière commande régénère `examples/` et `tests/fixtures/` de façon déterministe.

### Bibliothèque

```ts
import { readFxf, writeFxf, displayAltitude } from 'flight-exchange';

const { ok, fxf, issues, ignoredFiles } = await readFxf(await file.arrayBuffer());
if (ok) {
  fxf.flight.takeoff.time;                     // '2026-08-14T11:02:00.000Z'
  fxf.track.map((p) => displayAltitude(p));    // alt_msl, sinon alt_ellipsoid
}
```

## Faire évoluer le format

1. Modifier `SPECIFICATION.md`, puis les schémas, puis `src/types.ts`.
2. Ajout compatible → version mineure ; sinon → majeure (§ 3).
3. Ajouter un cas dans `scripts/make-examples.ts`, régénérer, `npm test`.
4. Noter le changement dans [CHANGELOG.md](CHANGELOG.md).
