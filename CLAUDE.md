# GED Courriers & Archives — contexte projet

## Le produit

Refonte web d'un logiciel WinDev de gestion des courriers et d'archivage utilisé par un
bureau d'ordre ministériel. Les agents enregistrent les courriers arrivés et départ,
y rattachent des pièces jointes (PDF scannés et photos), archivent des lots de documents,
les consultent dans l'application et les retrouvent par recherche plein texte (OCR).
Chaque action d'un utilisateur est historisée dans un journal chaîné.

**Application 100 % navigateur, sans base de données ni serveur.** Les données et les
fichiers sont enregistrés dans le navigateur (IndexedDB). L'application est un site
statique hébergé sur Vercel, installable (PWA) et utilisable hors ligne.

Utilisateurs (comptes locaux au navigateur) :
- le secrétariat / bureau d'ordre : saisie quotidienne, souvent en série, imports en masse ;
- les responsables : consultation, suivi, traitement des courriers qui leur sont adressés ;
- l'administrateur : comptes, référentiels, paramètres, sauvegarde, journal complet.

Interface entièrement en français. Ce n'est pas une maquette : chaque écran lit et écrit
de vraies données persistées.

## Documents de référence

Lis le document concerné AVANT de coder la partie correspondante :

- `docs/DESIGN.md` — design system, tokens, layout, composants, mouvement, interdits visuels
- `docs/DOMAIN.md` — glossaire, rôles, schéma IndexedDB, numérotation, journal d'audit,
  correspondance avec WinDev, limites du stockage local, points à valider
- `docs/FEATURES.md` — import de fichiers, OCR, visionneuse, recherche, tableau de bord,
  sauvegarde, modules, déploiement
- `docs/design/reference-dashboard.png` — référence visuelle à suivre
- `docs/legacy/` — captures et code WinDev d'origine : comportement à reproduire, pas code à copier

## Stack (ne pas en changer sans me le demander)

- Vite + React + TypeScript `strict`, React Router (mode SPA). Pas de Next.js : il n'y a
  pas de serveur.
- Tailwind CSS v4, tokens en variables CSS (voir DESIGN.md). Primitives Radix UI ;
  shadcn/ui autorisé comme point de départ mais chaque composant est re-stylé selon les tokens.
- Données : **Dexie** (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`, synchro entre onglets).
- **localStorage uniquement pour les préférences d'interface** (thème, sidebar repliée,
  colonnes visibles, rappel de sauvegarde masqué). Jamais pour des données métier ni des
  fichiers : il est limité à environ 5 Mo et ne stocke que du texte.
- sessionStorage pour l'utilisateur connecté.
- Formulaires : react-hook-form + zod (les mêmes schémas valident dans les repositories).
- Tableaux : @tanstack/react-table. Graphiques : recharts.
- Icônes : `lucide-react` (SVG inline) + SVG maison dans `src/components/icons`.
- Import de fichiers : react-dropzone.
- OCR : tesseract.js (Web Worker) + pdf.js (via react-pdf, une seule version de pdfjs).
  **Formats acceptés : PDF, JPEG, PNG, WebP. Rien d'autre (pas de DOCX, XLSX, TIFF).**
- Visionneuse : react-pdf pour les PDF, visionneuse d'image maison pour les images.
- Recherche plein texte : MiniSearch (index sérialisé dans IndexedDB).
- Empreintes : `crypto.subtle` pour les fichiers ; `@noble/hashes` (synchrone) pour le
  chaînage du journal à l'intérieur des transactions (voir DOMAIN.md §6).
- Sauvegarde : fflate (zip). PDF de démonstration : pdf-lib.
- PWA : vite-plugin-pwa. Divers : sonner, cmdk, date-fns locale `fr`, motion, zustand.
- Tests : Vitest + fake-indexeddb ; Playwright pour quelques parcours.
- Gestionnaire de paquets : pnpm.

## Architecture

```
src/
  main.tsx, router.tsx
  app/                      une route = un dossier (tableau-de-bord, courriers/arrives…)
  components/ui/            primitives stylées (Button, Field, Combobox, KpiCard…)
  components/layout/        Sidebar, Topbar, PageHeader, ImportTray, BackupBanner
  components/icons/         Logo, FileTypeIcon, illustrations d'état vide (SVG)
  features/<module>/        composants, hooks et schémas zod du module
  data/
    db.ts                   schéma Dexie et migrations de version
    repositories/           SEULE porte d'accès aux données (lecture et écriture)
    audit.ts                écriture du journal chaîné
    counters.ts             numérotation
    session.ts              utilisateur courant, contrôle des rôles
    backup.ts               export / restauration
    seed/                   données de démonstration générées dans le navigateur
  lib/ocr/                  moteur OCR
  lib/import/               file d'import, empreinte, miniatures
  lib/search/               index MiniSearch
public/ocr/                 moteur et modèles Tesseract (copiés au postinstall)
```

Règles d'architecture :

- Les composants n'importent **jamais** `db.ts`. Ils passent par les repositories et
  leurs hooks. Les repositories exposent des fonctions asynchrones typées : on pourra
  les rebrancher sur une API plus tard sans toucher à l'interface.
- Toute écriture métier se fait dans **une transaction Dexie** qui contient aussi le
  compteur (si numérotation) et le journal d'audit : l'action et sa trace sont écrites
  ensemble ou pas du tout.
- Aucun appel asynchrone hors Dexie (`fetch`, `crypto.subtle`, `setTimeout`) à
  l'intérieur d'une transaction : IndexedDB la clôturerait. Calculer avant, écrire dedans.
- Chaque repository vérifie le rôle de l'utilisateur courant (`requireRole`) et valide
  avec zod. L'interface masque ce qui n'est pas permis.
- Les binaires (fichiers, miniatures) sont dans des tables séparées des métadonnées :
  lister des documents ne charge jamais leurs fichiers en mémoire.
- Un fichier n'est remis à l'interface que par `openDocument`, `downloadDocument` ou
  `printDocument`, qui journalisent avant de rendre le Blob.
- Toute URL `blob:` créée est révoquée au démontage du composant.
- Code et noms de tables en anglais ; libellés d'interface en français (glossaire DOMAIN.md).
- Les modules liste + formulaire (décrets, arrêtés, notes, factures, journal des
  opérations, référentiels) sont générés à partir d'une config typée commune.

## Interdits — ce qui fait reconnaître une application générée

- Aucune image raster pour l'interface : pas de PNG/JPG/ICO pour une icône ou un logo,
  pas d'emoji. Favicon en `public/favicon.svg`. (Les miniatures de documents sont du
  contenu, pas des icônes.)
- Pas de dégradés violet/indigo, pas de texte en dégradé, pas de glassmorphism, pas de
  fond crème, pas d'ombre grise appuyée sous chaque carte.
- Pas de « tout en cartes » : une carte = un bloc de données (KPI, graphique, panneau).
- Pas de surtitres en MAJUSCULES espacées, pas de méta « A · B · C », pas de « → » dans les
  boutons ou liens, pas de police monospace pour les petits libellés.
- Pas d'animation d'entrée sur chaque section. Le mouvement répond aux actions.
- Pas de `alert()`, `confirm()`, `prompt()` : Dialog, AlertDialog, toasts.
- Pas de lorem ipsum ni de données en dur dans les composants : tout vient d'IndexedDB
  (données de démonstration générées au premier lancement si l'admin le demande).

## Rédaction de l'interface

Casse de phrase, phrases courtes, verbes précis. Un bouton dit ce qu'il fait
(« Enregistrer le courrier », pas « Valider ») et le toast reprend le même verbe
(« Courrier enregistré »). Une erreur dit quoi corriger, sous le champ concerné.
Un état vide propose l'action suivante. Dates au format `24/10/2026`, nombres au format
`1 750 000` (Intl `fr-FR`).

## Façon de travailler

- Travailler phase par phase. Pour toute tâche touchant plus de 3 fichiers, présenter un
  plan court et attendre ma validation.
- Ne pas inventer de champ métier absent de DOMAIN.md : le signaler.
- Toute modification du schéma Dexie passe par une nouvelle `db.version(n)` avec migration.
- Après chaque phase : résumé de ce qui a été fait, de ce qui reste, des décisions prises.

## Commandes

```
pnpm dev | pnpm build | pnpm preview | pnpm lint | pnpm typecheck | pnpm test | pnpm e2e
```

## Définition de « terminé »

- `pnpm typecheck`, `pnpm lint`, `pnpm test` et `pnpm build` passent.
- Chaque écriture produit une entrée dans `auditLog` et la chaîne reste vérifiable (testé).
- Les données survivent à un rechargement et se mettent à jour dans un second onglet.
- L'écran fonctionne en clair et en sombre, de 375 px à 1440 px, et au clavier.
- États vide, chargement (skeleton) et erreur traités.
- Aucune erreur dans la console, aucune URL `blob:` qui fuit.
- L'écran a été comparé à `docs/design/reference-dashboard.png` et à DESIGN.md.
