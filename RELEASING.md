# Publier une version

La publication est automatique : pousser un tag `vX.Y.Z` lance [`.github/workflows/release.yml`](.github/workflows/release.yml),
qui vérifie, compile, publie sur npm (avec attestation de provenance) et crée la release GitHub.

## Une seule fois

1. Créer un compte sur [npmjs.com](https://www.npmjs.com/) et activer l'authentification à deux facteurs.
2. Première publication, à faire à la main (npm ne permet de configurer la publication de confiance que sur un
   paquet qui existe déjà) :
   ```powershell
   npm login
   ```
   ```powershell
   npm publish
   ```
3. Sur npmjs.com → paquet `flight-exchange` → *Settings* → *Trusted Publisher* → GitHub Actions :
   dépôt `Pasrel14/flightexchange`, workflow `release.yml`. Plus aucun token à stocker : GitHub Actions
   s'authentifie auprès de npm par OIDC.
4. Toujours dans *Settings* : *Publishing access* → « Require two-factor authentication and disallow tokens ».

## À chaque version

1. Mettre à jour [CHANGELOG.md](CHANGELOG.md) (section datée) et, si le format change, `FORMAT_VERSION`
   dans `src/types.ts`, `SPECIFICATION.md` et les schémas.
2. Changer la version du paquet et créer le tag :
   ```powershell
   npm version patch
   ```
   (`minor` ou `major` selon le cas ; la commande crée le commit et le tag `vX.Y.Z`.)
3. Pousser :
   ```powershell
   git push --follow-tags
   ```
4. Vérifier l'exécution dans l'onglet *Actions*, puis la page npm et la release GitHub.

Une version publiée sur npm ne peut plus être modifiée, et ne peut être retirée que dans les 72 heures.
En cas d'erreur, publier une version corrective plutôt que de retirer.
