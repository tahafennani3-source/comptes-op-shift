# Comptes OP par shift : GitHub Pages + API JSON

- La page est publiée à l'adresse `https://tahafennani3-source.github.io/comptes-op-shift/`.
- Les données sont dans `data/ops.json`. Chaque modification faite depuis la page crée un commit, donc tout l'historique est conservé.
- L'API est faite de fichiers JSON statiques, régénérés à chaque modification et chaque matin à 05h.

## Mise en place

1. Sur GitHub, crée le dépôt **comptes-op-shift** en mode **Public**. GitHub Pages est gratuit seulement pour les dépôts publics.
2. Envoie-y tout le contenu de ce dossier, y compris `.github/workflows/pages.yml`.
3. Va dans **Settings → Pages → Source : GitHub Actions**.
4. Va dans **Actions → Publier page + API → Run workflow**. Le site est en ligne au bout d'environ 1 minute.
5. Crée un jeton pour pouvoir modifier les données :
   - Va dans **Settings (profil) → Developer settings → Fine-grained tokens**.
   - Limite-le au dépôt `comptes-op-shift`.
   - Donne-lui la permission **Contents : Read and write**.
   - Sur la page, clique sur **Jeton GitHub** et colle-le.

Sans jeton, la page est en lecture seule et se rafraîchit toutes les 60 s. Avec un jeton, elle se rafraîchit toutes les 20 s et permet de modifier.

## API (lecture publique, sans clé)

Base : `https://tahafennani3-source.github.io/comptes-op-shift/api/`

| Fichier | Contenu |
|---|---|
| `ops.json` | Tous les OP |
| `effectif.json` | Effectif par shift aujourd'hui (présents, OFF, PICK, PACK) |
| `effectif/Mar.json` | Effectif d'un jour donné (`Lun` … `Dim`) |
| `shift/B.json` | Tous les OP du shift B |
| `presents/B.json` | OP du shift B présents aujourd'hui |
| `presents/Mar/B.json` | OP du shift B présents mardi |

Un appel `GET` suffit, par exemple :

```js
fetch("https://tahafennani3-source.github.io/comptes-op-shift/api/presents/B.json").then(r => r.json())
```

Pour écrire depuis un autre outil, utilise l'API GitHub `PUT /repos/tahafennani3-source/comptes-op-shift/contents/data/ops.json` avec un jeton.

## Limites

- **Données publiques** : le dépôt est public. Tout le monde peut lire les noms, les matricules et les identifiants WMS. Ne mets jamais de mots de passe.
- **Délai de mise à jour** : l'API se met à jour 1 à 2 minutes après chaque modification, le temps que GitHub Actions publie.
- **Dépôt privé** : il faudrait un abonnement GitHub payant (Pro ou Team) pour Pages, ou bien revenir à la version Google Apps Script.
