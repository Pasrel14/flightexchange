# Flight Exchange Format (FXF) — Spécification 1.0

| | |
|---|---|
| Version du format | **1.0** |
| Statut | Brouillon de travail (adopté par FlightRecorder et FlightBook) |
| Date | 2026-11-20 |
| Schémas | [`schema/manifest.schema.json`](schema/manifest.schema.json), [`schema/flight.schema.json`](schema/flight.schema.json) |

Les mots **DOIT**, **NE DOIT PAS**, **DEVRAIT**, **NE DEVRAIT PAS** et **PEUT** ont le sens des mots-clés
MUST, MUST NOT, SHOULD, SHOULD NOT et MAY de la RFC 2119.

---

## 1. Objet

FXF décrit **un vol** enregistré (parapente, delta…) dans un fichier unique, autonome et versionné.
Il sert de contrat entre un **producteur** (aujourd'hui FlightRecorder, Android) et un **consommateur**
(aujourd'hui FlightBook, web). Aucune des deux applications ne connaît le modèle interne de l'autre :
seul ce document fait foi.

Principes :

1. **Données brutes d'abord.** Le fichier transporte les mesures telles qu'elles ont été acquises.
   Les statistiques sont indicatives : le consommateur peut toujours les recalculer.
2. **Absent plutôt qu'inventé.** Une mesure indisponible est omise (cellule vide, champ absent),
   jamais remplacée par 0 ou par une interpolation.
3. **Tout est facultatif sauf le strict nécessaire** : un vol sans baromètre, sans capteurs inertiels
   et sans atterrissage connu reste un fichier valide.
4. **Indépendant du transport.** Le même fichier sert à l'export manuel, à l'envoi vers une API
   et à la synchronisation directe (§ 12).

## 2. Conteneur

- Un fichier FXF est une archive **ZIP** (méthodes *stored* ou *deflate* uniquement, sans chiffrement).
- Extension : **`.fxf`**. Type MIME : `application/vnd.flight-exchange+zip`.
- Nom de fichier conseillé : `AAAA-MM-JJ_HHMM_<site>.fxf` (heure locale du décollage). Le nom n'a
  aucune valeur sémantique : un consommateur NE DOIT PAS en dépendre.
- Les chemins internes utilisent `/`, sont relatifs, en UTF-8, sensibles à la casse.
  Ils NE DOIVENT PAS commencer par `/`, contenir `..`, `\` ni de lettre de lecteur.
- Un fichier FXF contient **un seul vol**. Plusieurs vols = plusieurs fichiers.

### 2.1 Contenu

```
2026-11-20_0930_morteau.fxf
├── manifest.json          OBLIGATOIRE  inventaire, version du format
├── flight.json            OBLIGATOIRE  description du vol
├── track.csv              OBLIGATOIRE  trace GNSS de référence
├── sensors/               facultatif   capteurs bruts
│   ├── pressure.csv
│   ├── accelerometer.csv
│   └── gyroscope.csv
├── track.igc              facultatif   copie dérivée, pour l'interopérabilité
├── track.gpx              facultatif   copie dérivée, pour l'interopérabilité
└── media/                 facultatif   photos
    └── 0001.jpg
```

Un consommateur DOIT ignorer (en le signalant dans le rapport d'import) tout fichier qu'il ne connaît pas.

### 2.2 Limites

Pour se protéger des archives malveillantes, un consommateur DEVRAIT refuser une archive dont :
la taille décompressée totale dépasse **512 Mio**, un fichier dépasse **256 Mio**, ou qui compte plus
de **10 000** entrées. Un producteur DOIT rester sous ces limites.

## 3. Versions et compatibilité

- `formatVersion` vaut `"MAJEUR.MINEUR"` (ex. `"1.0"`).
- **Mineur** : ajouts compatibles uniquement (nouveaux champs ou fichiers facultatifs, nouvelles valeurs
  d'énumération signalées comme extensibles).
- **Majeur** : tout changement incompatible.
- Un consommateur qui implémente `X.Y` :
  - DOIT accepter tout fichier `X.*` ; si le mineur est plus récent, il ignore ce qu'il ne connaît pas
    et le signale (avertissement `FXF_W_NEWER_MINOR`) ;
  - DOIT refuser un majeur différent (`FXF_E_UNSUPPORTED_VERSION`) avec un message explicite.
- Un consommateur DOIT ignorer les champs JSON inconnus et les colonnes CSV inconnues.
- Un producteur DOIT produire des fichiers valides en **mode strict** (§ 11.3) : aucun champ hors
  spécification, sauf dans `extensions`.

## 4. Conventions communes

| Grandeur | Unité / format |
|---|---|
| Instant (JSON) | ISO 8601 UTC avec `Z`, précision à la milliseconde conseillée : `2026-11-20T09:30:00.000Z` |
| Instant (CSV) | entier, millisecondes depuis l'époque Unix, UTC |
| Fuseau horaire | identifiant IANA (`Europe/Paris`) |
| Coordonnées | degrés décimaux WGS84, au moins 7 décimales en CSV |
| Distances, altitudes, précisions | mètres |
| Vitesses (horizontales et verticales) | m/s ; la vitesse verticale est positive en montée |
| Durées | secondes |
| Cap | degrés, 0–360, vrai (pas magnétique), sens horaire depuis le nord |
| Pression | hectopascals (hPa) |
| Accélération | m/s², repère du téléphone (convention Android) |
| Vitesse angulaire | rad/s, repère du téléphone |
| Identifiants | UUID (RFC 9562), minuscules |

La conversion d'unités pour l'affichage (km/h, km, pieds…) est l'affaire du consommateur.

### 4.1 Altitudes

Trois altitudes distinctes peuvent coexister. Elles ne sont **jamais** mélangées dans une même colonne :

| Nom | Référence | Origine typique |
|---|---|---|
| `alt_ellipsoid` | ellipsoïde WGS84 | GNSS brut (`Location.getAltitude()` sur Android) |
| `alt_msl` | niveau moyen de la mer (géoïde) | GNSS corrigé par un modèle de géoïde (`AltitudeConverter`, Android 14+) |
| `alt_pressure` | atmosphère standard ISA, 1013,25 hPa (QNE) | baromètre |

En France l'écart ellipsoïde – géoïde est d'environ +50 m : confondre les deux fausse les altitudes.
Si `alt_msl` est fourni, `flight.json` DOIT indiquer le modèle utilisé (`recording.geoidModel`).

Altitude d'affichage recommandée pour le consommateur : `alt_msl` ; à défaut `alt_ellipsoid` corrigée
par son propre modèle de géoïde ; à défaut `alt_ellipsoid` brute (avertissement `FXF_W_ELLIPSOID_ONLY`).
`alt_pressure` sert au variomètre et au profil, pas comme altitude absolue.

### 4.2 Format CSV

Tous les fichiers `.csv` suivent ces règles (sous-ensemble de la RFC 4180) :

- UTF-8 sans BOM, fins de ligne `\n` (un consommateur DOIT aussi accepter `\r\n`) ;
- séparateur `,`, séparateur décimal `.`, pas de séparateur de milliers, pas de guillemets ;
- première ligne = en-tête avec les noms de colonnes ; l'ordre des colonnes est libre ;
- cellule vide = valeur absente ; `NaN`, `null`, `-` sont interdits ;
- notation scientifique interdite ;
- lignes triées par `t` **strictement croissant** (le producteur élimine les doublons).

## 5. `manifest.json`

Inventaire de l'archive, lisible sans rien interpréter d'autre. Schéma : `schema/manifest.schema.json`.

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

| Champ | Oblig. | Description |
|---|---|---|
| `format` | oui | toujours `"flight-exchange"` |
| `formatVersion` | oui | `"MAJEUR.MINEUR"` |
| `flightId` | oui | égal à `flight.json` → `id` |
| `createdAt` | oui | date de création de l'archive (pas du vol) |
| `producer.name`, `producer.version` | oui | application productrice |
| `producer.platform` | non | `android`, `ios`, `web`, `desktop`, `server`, … |
| `files[]` | oui | tous les fichiers de l'archive **sauf** `manifest.json` lui-même |
| `files[].path` | oui | chemin dans l'archive |
| `files[].role` | oui | `flight`, `track`, `sensor`, `track-igc`, `track-gpx`, `media`, `other` |
| `files[].mediaType` | non | type MIME |
| `files[].size` | non | taille en octets, décompressé |
| `files[].sha256` | non (DEVRAIT) | empreinte SHA-256 en hexadécimal minuscule |
| `extensions` | non | voir § 10 |

Règles : chaque fichier listé DOIT exister ; `size` et `sha256`, s'ils sont présents, DOIVENT correspondre.
Un fichier présent mais non listé est ignoré (`FXF_W_UNLISTED_FILE`).

## 6. `flight.json`

Description normalisée du vol. Schéma : `schema/flight.schema.json`.

```json
{
  "id": "3f0b8c1e-6a5d-4c1f-9a7e-2b4d8e9f0a12",
  "revision": 1,
  "activity": "paragliding",
  "title": "Vol du matin",
  "takeoff": { "time": "2026-11-20T09:30:12.000Z", "latitude": 47.0571, "longitude": 6.6074, "altitude": 1102, "siteName": "Morteau" },
  "landing": { "time": "2026-11-20T11:15:40.000Z", "latitude": 47.0702, "longitude": 6.5391, "altitude": 752 },
  "timezone": "Europe/Paris",
  "pilot": { "name": "Pilote Exemple" },
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

### 6.1 Champs

| Champ | Oblig. | Description |
|---|---|---|
| `id` | **oui** | UUID du vol, généré **une fois** par le producteur et **conservé à vie** (réexports compris) |
| `revision` | non (défaut 1) | entier ≥ 1, incrémenté quand le producteur réexporte un vol modifié (recalcul, découpage) |
| `activity` | **oui** | `paragliding`, `hang-gliding`, `speed-flying`, `sailplane`, `other` (extensible) |
| `takeoff` | **oui** | point de décollage (voir 6.2) ; `time` obligatoire |
| `landing` | non | point d'atterrissage ; absent si le vol n'a pas été clos normalement |
| `timezone` | non (DEVRAIT) | fuseau IANA du décollage, pour calculer la date locale |
| `title`, `notes` | non | texte libre saisi par le pilote |
| `pilot` | non | `{ name }` |
| `equipment` | non | `{ glider, harness, reserve, instrument }`, chacun `{ brand, model, size?, certification?, serial? }` |
| `statistics` | non | statistiques indicatives (6.3) |
| `recording` | non (DEVRAIT) | conditions d'enregistrement (6.4) |
| `media[]` | non | `{ path, caption?, takenAt? }` pour chaque photo de `media/` |
| `extensions` | non | voir § 10 |

### 6.2 Points de décollage / atterrissage

`{ time, latitude?, longitude?, altitude?, siteName? }`. `altitude` est en mètres au-dessus du niveau
de la mer ; si le producteur ne sait fournir qu'une altitude ellipsoïdale, il l'omet.
`time` du décollage DOIT être compris dans l'intervalle couvert par `track.csv`.

La trace PEUT déborder avant le décollage et après l'atterrissage (tampon circulaire du producteur,
attente au sol) : ce sont `takeoff.time` et `landing.time` qui délimitent le vol. Un consommateur qui
ne fait pas confiance à la détection du producteur PEUT recalculer ces instants, mais DEVRAIT
proposer par défaut ceux du fichier.

### 6.3 Statistiques

Toutes facultatives, calculées par le producteur sur l'intervalle [décollage, atterrissage] :

| Champ | Unité |
|---|---|
| `durationSeconds` | s |
| `trackLengthMeters` | m, somme des segments |
| `straightDistanceMeters` | m, décollage → atterrissage |
| `maxDistanceFromTakeoffMeters` | m |
| `maxAltitudeMeters`, `minAltitudeMeters` | m (référence d'affichage, § 4.1) |
| `altitudeGainMeters` | m, gain positif cumulé |
| `maxClimbRate` | m/s (> 0) |
| `maxSinkRate` | m/s (< 0) |
| `maxGroundSpeed` | m/s |

Le consommateur NE DOIT PAS les préférer à un calcul sur la trace s'il en fait un ; elles servent à
la prévisualisation et à la vérification croisée.

### 6.4 Conditions d'enregistrement (`recording`)

| Champ | Description |
|---|---|
| `device` | `{ manufacturer, model, os, osVersion }` |
| `locationProvider` | `fused`, `platform`, `external`, `simulated`, `mixed` |
| `nominalIntervalMs` | intervalle GNSS visé en vol (ex. 1000) |
| `sensors` | `{ barometer, accelerometer, gyroscope }` : capteurs **présents sur l'appareil** (booléens) |
| `geoidModel` | modèle utilisé pour `alt_msl` (ex. `EGM2008`) ; obligatoire si la colonne existe |
| `detection` | `automatic` ou `manual` (démarrage/arrêt par le pilote) |
| `resumeCount` | nombre de reprises après interruption pendant le vol |
| `gaps[]` | `{ start, end }` : trous connus dans la trace (perte GNSS, process tué) |

Un fichier `simulated` DOIT être signalé à l'utilisateur par le consommateur (`FXF_W_SIMULATED`).

## 7. `track.csv` — trace de référence

C'est la **seule source de vérité** pour la position. Au moins **2 lignes**.

| Colonne | Oblig. | Type | Description |
|---|---|---|---|
| `t` | **oui** | entier | instant UTC, ms (§ 4) |
| `lat` | **oui** | décimal | latitude, −90…90 |
| `lon` | **oui** | décimal | longitude, −180…180 |
| `alt_ellipsoid` | non | décimal | m, § 4.1 |
| `alt_msl` | non | décimal | m, § 4.1 |
| `alt_pressure` | non | décimal | m, altitude-pression QNE au même instant (§ 4.1) |
| `h_acc` | non | décimal | précision horizontale, m (rayon à 68 %) |
| `v_acc` | non | décimal | précision verticale, m |
| `speed` | non | décimal | vitesse sol mesurée par le GNSS, m/s |
| `bearing` | non | décimal | cap sol, degrés |
| `sats` | non | entier | satellites utilisés |
| `elapsed_ns` | non | entier | horloge monotone de l'appareil, ns (diagnostic) |

Exemple :

```csv
t,lat,lon,alt_ellipsoid,alt_msl,alt_pressure,h_acc,v_acc,speed,bearing
1795167012000,47.0571023,6.6074410,1151.2,1102.0,1088.4,3.8,5.1,0.4,
1795167013000,47.0571190,6.6074122,1151.0,1101.8,1088.1,3.6,4.9,6.2,281.5
```

Règles :

- une ligne n'est écrite que si le GNSS a fourni une position ; les trous restent des trous ;
- `alt_pressure` n'est renseignée que si une mesure barométrique est disponible à ±2 s ;
- au moins une des colonnes `alt_ellipsoid`, `alt_msl` DEVRAIT exister (sinon `FXF_W_NO_GNSS_ALTITUDE`).

## 8. `sensors/` — capteurs bruts (facultatif)

Un fichier par capteur. Noms réservés :

| Fichier | Colonnes | Unité |
|---|---|---|
| `sensors/pressure.csv` | `t`, `elapsed_ns`?, `hpa` | hPa |
| `sensors/accelerometer.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | m/s², gravité incluse |
| `sensors/gyroscope.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | rad/s |
| `sensors/magnetometer.csv` | `t`, `elapsed_ns`?, `x`, `y`, `z` | µT (réservé) |

Mêmes règles CSV qu'au § 4.2. Les échantillons PEUVENT couvrir un intervalle plus large que le vol.
Un producteur PEUT sous-échantillonner pour limiter la taille ; il ne DOIT PAS interpoler.
Un consommateur qui n'exploite pas un capteur l'ignore simplement.

## 9. Fichiers dérivés et médias

- `track.igc` (rôle `track-igc`) et `track.gpx` (rôle `track-gpx`) sont des **copies de commodité**
  générées depuis les mêmes données, pour les outils tiers. Un consommateur FXF DOIT utiliser
  `track.csv` ; il PEUT proposer de télécharger les copies telles quelles.
- `media/` contient des images JPEG, PNG ou WebP (rôle `media`), décrites dans `flight.json` → `media[]`.

## 10. Extensions

Données propres à une application, que les autres ignorent :

```json
"extensions": {
  "com.flightrecorder": { "sessionId": 42, "engineVersion": "2.1" }
}
```

Clés = nom de domaine inversé. Le contenu est libre et non validé. Un consommateur NE DOIT PAS
exiger une extension pour importer un vol. Une donnée d'extension utile à tous a vocation à entrer
dans une version mineure suivante.

## 11. Validation et import

### 11.1 Étapes de validation (consommateur)

1. Archive ZIP lisible, dans les limites du § 2.2, chemins sûrs.
2. `manifest.json` présent, JSON valide, conforme au schéma ; version majeure prise en charge.
3. Fichiers listés présents ; tailles et empreintes vérifiées si fournies.
4. `flight.json` présent, conforme au schéma, `id` = `manifest.flightId`.
5. `track.csv` présent, en-tête avec `t`, `lat`, `lon`, valeurs bien formées et dans les bornes,
   `t` strictement croissant, au moins 2 lignes.
6. Cohérence : `takeoff.time` (et `landing.time`) dans l'intervalle de la trace, `landing` après `takeoff`,
   `geoidModel` présent si `alt_msl` existe, médias déclarés présents.
7. Capteurs : mêmes contrôles qu'en 5 ; une erreur sur un capteur facultatif **n'empêche pas** l'import
   du vol (le capteur est écarté et signalé).

Une **erreur** (`FXF_E_*`) empêche l'import. Un **avertissement** (`FXF_W_*`) est montré dans le rapport.

### 11.2 Comportement d'import

- **Prévisualisation** avant enregistrement : date, site, durée, distance, capteurs présents, avertissements.
- **Doublons** : un vol dont l'`id` est déjà connu n'est pas recréé.
  - même `revision` ou inférieure → « déjà importé » ;
  - `revision` supérieure → proposer la mise à jour de la trace et des données du producteur, **sans
    écraser** ce que l'utilisateur a saisi dans le consommateur (notes, note, photos, matériel associé).
- Le consommateur DOIT conserver `id` (identifiant d'origine) et DEVRAIT conserver `revision` et `producer`.
- **Rapport d'import** : données reprises, données ignorées (fichiers, colonnes, capteurs inconnus ou
  écartés), avertissements.

### 11.3 Mode strict (producteur)

En plus du § 11.1, le mode strict refuse tout champ JSON non défini par la spécification (hors
`extensions`) et exige `sha256` et `size` pour chaque fichier. Les tests d'un producteur DOIVENT
valider leurs exports en mode strict.

### 11.4 Codes

| Code | Gravité | Signification |
|---|---|---|
| `FXF_E_NOT_ZIP` | erreur | archive illisible |
| `FXF_E_LIMITS` | erreur | limites du § 2.2 dépassées |
| `FXF_E_UNSAFE_PATH` | erreur | chemin interdit (§ 2) |
| `FXF_E_MISSING_MANIFEST` | erreur | `manifest.json` absent |
| `FXF_E_INVALID_JSON` | erreur | JSON mal formé |
| `FXF_E_SCHEMA` | erreur | non conforme au schéma |
| `FXF_E_UNSUPPORTED_VERSION` | erreur | version majeure non prise en charge |
| `FXF_E_MISSING_FILE` | erreur | fichier obligatoire ou listé absent |
| `FXF_E_SIZE_MISMATCH` | erreur | taille différente du manifeste |
| `FXF_E_CHECKSUM` | erreur | empreinte différente du manifeste |
| `FXF_E_ID_MISMATCH` | erreur | `manifest.flightId` ≠ `flight.id` |
| `FXF_E_CSV_HEADER` | erreur | colonne obligatoire absente ou en double |
| `FXF_E_CSV_VALUE` | erreur | valeur mal formée ou hors bornes |
| `FXF_E_CSV_ORDER` | erreur | `t` non strictement croissant |
| `FXF_E_TRACK_TOO_SHORT` | erreur | moins de 2 points |
| `FXF_E_INCONSISTENT` | erreur | incohérence entre fichiers (§ 11.1, étape 6) |
| `FXF_E_STRICT` | erreur | mode strict uniquement |
| `FXF_W_NEWER_MINOR` | avertissement | version mineure plus récente |
| `FXF_W_UNKNOWN_FILE` | avertissement | fichier ou rôle inconnu, ignoré |
| `FXF_W_UNLISTED_FILE` | avertissement | fichier absent du manifeste, ignoré |
| `FXF_W_UNKNOWN_COLUMN` | avertissement | colonne CSV inconnue, ignorée |
| `FXF_W_SENSOR_DISCARDED` | avertissement | capteur invalide, écarté |
| `FXF_W_ELLIPSOID_ONLY` | avertissement | seule l'altitude ellipsoïdale est fournie |
| `FXF_W_NO_GNSS_ALTITUDE` | avertissement | aucune altitude GNSS |
| `FXF_W_SIMULATED` | avertissement | trace simulée |
| `FXF_W_NO_CHECKSUM` | avertissement | fichier sans `sha256` |

## 12. Transports

Le contenu échangé est toujours l'archive `.fxf`, octet pour octet.

| Mode | Fonctionnement |
|---|---|
| Fichier | partage Android / téléchargement → glisser-déposer dans FlightBook |
| API | `POST /flights` avec `Content-Type: application/vnd.flight-exchange+zip` ; réponse : rapport d'import (codes § 11.4) ; `409` si l'`id` existe avec une révision ≥ |
| Direct | même archive, autre canal (Bluetooth, réseau local, cloud intermédiaire) |

## 13. Évolutions envisagées (hors 1.0)

- Plusieurs vols par archive (journée complète).
- Événements de vol (gonflage, thermiques, décrochage) et données de vent.
- Signature de l'archive (authenticité pour les compétitions).
- Capteurs externes (variomètres BLE).
