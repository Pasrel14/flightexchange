# Historique

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Le paquet suit [SemVer](https://semver.org/lang/fr/) ;
la version du format (`formatVersion`) est indiquée pour chaque version du paquet.

## [1.0.0] — non publiée

Format **1.0**. Première version publique.

### Format

- Conteneur ZIP `.fxf`, `manifest.json`, `flight.json`, `track.csv`, capteurs (`pressure`, `accelerometer`,
  `gyroscope`, `magnetometer` réservé), copies IGC/GPX, médias, extensions, codes d'anomalie, mode strict.
- Identifiants `$id` des schémas : `https://cdn.jsdelivr.net/npm/flight-exchange@1/schema/…`.

### Paquet

- `readFxf`, `validateFxf`, `writeFxf`, `displayAltitude`, outils CSV et schémas.
- Validateur en ligne de commande `fxf-validate`.
- Exemples et jeu de conformance (24 cas) inclus dans le paquet.
- Licence MIT.
