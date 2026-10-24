# Courrier et archives

Gestion des courriers arrivés et départ, des actes (décrets, arrêtés, notes de service, factures), de l'archivage de documents numérisés et de la recherche plein texte (OCR) pour un bureau d'ordre.

L'application tourne **entièrement dans le navigateur** : pas de serveur, pas de base de données distante. Les données et les fichiers sont enregistrés dans IndexedDB. Le site est statique, installable (PWA) et utilisable hors ligne.

## À lire avant le déploiement

**Les données sont propres au navigateur ET au nom de domaine.** Il faut donc **un seul domaine de production, fixé une fois pour toutes**. Changer de domaine, ouvrir une URL de prévisualisation Vercel (`*.vercel.app`) ou utiliser un autre navigateur ouvre une base vide : les courriers déjà saisis n'y sont pas.

- **Sauvegardez régulièrement** (menu Sauvegarde) : l'export zip est la seule copie hors du poste. Vider les données du navigateur efface tout.
- **Les comptes organisent le travail, ils ne protègent pas les données.** Quiconque ouvre le navigateur de ce poste avec ses outils de développement peut lire la base. Verrouillez la session de l'ordinateur.
- **Chrome ou Edge sont recommandés** (stockage persistant, enregistrement direct des sauvegardes). Firefox et Safari fonctionnent avec des limites de stockage plus strictes.
- Formats de fichiers acceptés : PDF, JPEG, PNG, WebP.

## Installer l'application (PWA)

Dans Chrome ou Edge, ouvrir l'adresse de production puis choisir « Installer Courrier et archives » dans la barre d'adresse. Après la première visite, le moteur OCR et la visionneuse PDF sont conservés : l'application se recharge et lit les documents sans réseau. Quand une nouvelle version est disponible, un message propose de mettre à jour.

## Développement

Prérequis : Node 22 ou plus, pnpm.

```
pnpm install      copie aussi le moteur OCR et pdf.js dans public/
pnpm dev
pnpm typecheck
pnpm lint
pnpm test         tests unitaires (Vitest, fake-indexeddb)
pnpm build
pnpm preview
pnpm e2e          parcours Playwright, avec la politique de sécurité de production
```

## Déploiement sur Vercel

1. Importer le dépôt ; la configuration est dans `vercel.json` (commande `pnpm build`, dossier `dist`, réécriture vers `index.html`, politique de sécurité du contenu, cache).
2. Définir la variable d'environnement `VITE_PRODUCTION_HOST` avec le nom d'hôte de production, sans protocole (par exemple `courrier.exemple.mg`). Sur toute autre adresse `*.vercel.app`, l'application affiche un bandeau qui avertit que les données de cette adresse sont distinctes.
3. Rattacher le domaine de production au projet et ne plus en changer.

## Organisation

Le code est décrit dans `CLAUDE.md` ; les références sont dans `docs/` (`DESIGN.md`, `DOMAIN.md`, `FEATURES.md`). Les composants n'accèdent jamais à la base directement : tout passe par `src/data/repositories/`, et chaque écriture est enregistrée dans le journal chaîné (`auditLog`) dans la même transaction.
