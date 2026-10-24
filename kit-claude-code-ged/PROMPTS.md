# Prompts Claude Code — phase par phase

## Mise en place (une fois)

1. Créez un dépôt vide et décompressez ce kit à sa racine :
   `CLAUDE.md`, `docs/DESIGN.md`, `docs/DOMAIN.md`, `docs/FEATURES.md`,
   `docs/design/reference-dashboard.png`, `docs/legacy/*` (captures et code WinDev).
2. Installez Node LTS et pnpm, puis lancez `claude` à la racine. Pas de base de données à
   installer : tout est dans le navigateur.
3. Recommandé : ajoutez le serveur MCP Playwright à Claude Code pour qu'il ouvre
   l'application, prenne des captures et se compare lui-même à la référence.
4. Pour chaque phase : mode plan (Maj+Tab), collez le prompt, relisez le plan, validez,
   laissez coder, testez, `git commit`. Faites `/clear` entre deux phases : CLAUDE.md est
   relu automatiquement.

---

## Phase 0 — Vérification de compréhension

```
Lis CLAUDE.md, puis docs/DESIGN.md, docs/DOMAIN.md et docs/FEATURES.md.
Regarde docs/design/reference-dashboard.png, docs/legacy/ecrans-windev.pdf et le code
WinDev de docs/legacy/.
Ne code rien. Résume en 15 lignes ce que tu as compris (produit, stockage 100 %
navigateur, formats acceptés), liste les incohérences ou zones floues de la documentation,
puis propose l'ordre des phases. Attends ma validation.
```

## Phase 1 — Socle et design system

```
Phase 1 : socle et design system. Lis CLAUDE.md et docs/DESIGN.md en entier.
1. Initialise Vite + React + TypeScript strict avec pnpm, React Router, alias @/,
   Tailwind v4, ESLint, Prettier, Vitest. Scripts typecheck, lint, test.
2. Dépendances de cette phase seulement : Radix / shadcn, lucide-react, sonner, motion,
   cmdk, react-day-picker, date-fns, recharts.
3. Tokens de DESIGN.md §2 à §4 en variables CSS clair/sombre exposées via @theme inline.
   IBM Plex Sans auto-hébergée (@fontsource), pas de CDN de polices. Provider de thème
   maison + script anti-flash dans index.html (DESIGN.md §11).
4. SVG maison : Icon (wrapper lucide strokeWidth 1.75), FileTypeIcon (PDF et image),
   Logo, public/favicon.svg, 4 illustrations d'état vide. Aucune image raster, aucun emoji.
5. Layout : Sidebar repliable (état en localStorage), Topbar, PageHeader, BackupBanner,
   exactement selon DESIGN.md §5, §6 et §8. Navigation dans une config typée.
   Mobile : Sheet à gauche.
6. Primitives stylées : Button, Input, Textarea, Field, Select, Combobox, DatePicker,
   Switch, StatusBadge, Card, KpiCard (sparkline recharts), SegmentedControl, Tabs, Sheet,
   Dialog, AlertDialog, DropdownMenu, Tooltip, Avatar, Progress, Skeleton, EmptyState,
   DataTable (structure).
7. Page /dev/ui (en développement uniquement) montrant chaque composant dans tous ses
   états, et /tableau-de-bord avec des données factices LOCALES à cette page pour valider
   le rendu.
Avant de me rendre la main : compare /tableau-de-bord à la référence (1440 px et 390 px,
clair et sombre si tu as Playwright), liste les écarts et corrige-les.
```

## Phase 2 — Couche de données IndexedDB

```
Phase 2 : couche de données. Lis docs/DOMAIN.md en entier (surtout §2, §4, §5 et §7).
- data/db.ts : schéma Dexie de DOMAIN §4, version 1, types TypeScript de chaque table.
- data/session.ts : utilisateur courant, requireRole, canSee.
- data/audit.ts : appendAudit(tx, entry) avec chaînage @noble/hashes, verifyAuditChain(),
  data/audit-labels.ts (phrase française par action).
- data/counters.ts : numérotation transactionnelle, peekNextReference, formats paramétrables.
- data/repositories/ : une fonction par opération (create/update/delete/restore/list/get),
  chaque écriture dans une transaction qui inclut auditLog (et counters si numérotation),
  validation zod, contrôle de rôle, hooks useLiveQuery pour les lectures.
- data/seed/ : générateur des données de démonstration de DOMAIN §11, SANS les fichiers
  (ils viendront en phase 6).
Tests Vitest avec fake-indexeddb : pas de numéro en double avec 20 enregistrements
lancés en parallèle, remise à 1 au changement d'année, chaîne d'audit valide puis
détection d'une entrée modifiée, un reader ne peut rien écrire, un élément restreint est
invisible pour un compte non autorisé, suppression logique et restauration.
Pas d'interface dans cette phase, à part brancher la sidebar sur le compteur de
courriers non traités.
```

## Phase 3 — Comptes locaux et première utilisation

```
Phase 3 : comptes. Lis DOMAIN.md §2 et §3, FEATURES.md §12.
- Écran de première utilisation (base vide) : création de l'admin, nom de l'organisation,
  case « Charger des données de démonstration », demande de stockage persistant, encadré
  qui explique en trois phrases que les données restent dans ce navigateur.
- /connexion : formulaire à gauche, panneau sobre à droite avec Logo et organisation.
  PBKDF2 via crypto.subtle (hors transaction). Session en sessionStorage.
- Verrouillage après inactivité (écran verrouillé de DESIGN.md §8), « Changer d'utilisateur ».
- Routes protégées, redirection après connexion, journal auth.*.
- /utilisateurs (admin) : créer, rôle, désactiver, réinitialiser le mot de passe, lier à
  un collaborateur. Chaque action journalisée.
- Menu avatar de la topbar et carte utilisateur de la sidebar branchés sur la session.
```

## Phase 4 — Référentiels

```
Phase 4 : référentiels. Lis DOMAIN.md §1 et §4, DESIGN.md §8.
Page générique /referentiels/:type pilotée par une config typée pour : directions,
collaborateurs, partenaires, chefs de l'État, ministres, types de courrier, suivis,
positions (onglets). DataTable avec recherche, ajout/modification en Sheet, désactivation
au lieu de suppression si la valeur est utilisée. ReferenceCombobox réutilisable avec
création en ligne « Créer « … » » si le rôle le permet. Vérifie dans auditLog que chaque
opération est journalisée.
```

## Phase 5 — Courriers arrivés et départ

```
Phase 5 : courriers. Lis DOMAIN.md §5, §6, §8 et §9, FEATURES.md §6, DESIGN.md §8.
Relis docs/legacy/enregistrement-courrier-*.wl.txt et les captures pour retrouver chaque
champ et chaque contrôle.
- Listes /courriers/arrives et /courriers/departs : onglets Tous / En attente / Traités,
  filtres équivalents WinDev dans l'URL, tri, pagination, sélection multiple (marquer
  traité, exporter CSV).
- Formulaire en Sheet (sections de FEATURES §6), champs obligatoires de DOMAIN §6,
  aperçu du numéro, pré-remplissage fonction/direction, « Enregistrer et nouveau »,
  Ctrl+Entrée, garde-fou. Section Pièces jointes : emplacement prêt, branché en phase 6.
- Détail /courriers/:flow/:id avec chronologie des positions et onglet Historique.
- Suppression logique avec « Annuler » ; corbeille admin.
- Notification locale au destinataire à la création d'un courrier arrivé.
Ouvre deux onglets, enregistre dans les deux en même temps : numéros distincts, et
chaque liste se met à jour dans l'autre onglet.
```

## Phase 6 — Import de fichiers (PDF et images)

```
Phase 6 : import. Lis FEATURES.md §1 et §7, DOMAIN.md §6 (Documents), DESIGN.md §9 en
entier, et docs/legacy/archivage-masse-pdf.wl.txt.
- lib/import : store zustand de la file, contrôle extension + signature (PDF, JPEG, PNG,
  WebP uniquement), contrôle de l'espace disponible, lecture en flux avec progression,
  SHA-256 en Web Worker, détection de doublon, miniature (première page de PDF ou image
  réduite, WebP), enregistrement transactionnel.
- Dropzone avec tous ses états, ligne de fichier avec mini-étapes et barres distinctes
  (import en petrol, OCR en accent), panneau « Imports » persistant.
- Section Pièces jointes du formulaire courrier (dépôt + « Choisir dans les archives »).
- Page /archivage : options du lot, file, récapitulatif.
- Complète data/seed avec les ~25 documents générés (pdf-lib + canvas) de DOMAIN §11.
L'OCR n'est pas encore branché : les documents restent « en attente ».
Teste : un .docx renommé en .pdf doit être refusé ; un PDF importé deux fois → doublon.
```

## Phase 7 — Lecture OCR

```
Phase 7 : OCR. Lis FEATURES.md §2, DESIGN.md §9 et §10.
- lib/ocr : détection de couche texte avec le pdf.js de react-pdf, rendu des pages sans
  texte, images via createImageBitmap avec la rotation enregistrée, worker tesseract.js
  réutilisé, langues depuis les paramètres, moteur et modèles copiés dans /public/ocr par
  un script postinstall, import dynamique.
- File d'OCR persistante (reprise des documents pending / processing au démarrage),
  progression par page avec les libellés français, annulation, relance unitaire et groupée.
- Visuel : miniature de la page en cours avec ligne de balayage, coche de succès,
  confiance moyenne, avertissement de qualité. prefers-reduced-motion respecté.
- Enregistrement transactionnel et journal document.ocrCompleted / ocrFailed.
Donne-moi le temps de traitement d'un PDF texte de 10 pages et d'un PDF image de 3 pages
du seed, et ferme l'onglet pendant une lecture pour vérifier la reprise.
```

## Phase 8 — Visionneuse

```
Phase 8 : visionneuse. Lis FEATURES.md §3.
/documents/:id : openDocument / downloadDocument / printDocument (journal puis Blob),
PDF avec react-pdf (miniatures, zoom, navigation clavier, couche texte), images avec
zoom, déplacement et rotation enregistrée, panneau Informations / Texte / Historique,
lien profond ?page=&q= avec surlignage. Révocation de toutes les URL blob:.
Page /documents : tous les documents avec filtres (catégorie, type PDF/image, statut OCR,
période, importé par) et actions groupées.
Vérifie dans la console qu'aucune URL blob: ne survit à la fermeture de la visionneuse.
```

## Phase 9 — Historique et notifications

```
Phase 9 : historique et notifications. Lis DOMAIN.md §7 et §8, FEATURES.md §8.
/historique : tableau et vue chronologique, filtres, diff dépliable, export CSV
journalisé, bouton « Vérifier l'intégrité ». Composant AuditTimeline réutilisé dans les
onglets Historique. Cloche de la topbar sur useLiveQuery, popover, « Tout marquer comme lu ».
```

## Phase 10 — Tableau de bord réel

```
Phase 10 : tableau de bord. Lis FEATURES.md §5 et DESIGN.md §5, §8 et §10.
Remplace les données factices par data/repositories/stats.ts (requêtes indexées,
useLiveQuery). Espace utilisé via navigator.storage.estimate(). Sens métier des
tendances, unique animation de dessin au chargement, skeletons.
Compare à docs/design/reference-dashboard.png et corrige les écarts.
```

## Phase 11 — Recherche

```
Phase 11 : recherche. Lis FEATURES.md §4.
Index MiniSearch (une entrée par courrier et par page de document), normalisation sans
accents, persistance dans la table searchIndex, mises à jour après chaque écriture,
Web Worker au-delà de 2 000 entrées. Palette Ctrl K / ⌘K et page /recherche avec extraits.
Vérifie : « recu » trouve « reçu », « 12/2 » trouve « 12/26 », un mot présent seulement
dans le texte OCR d'une image est trouvé et ouvre la bonne page.
```

## Phase 12 — Autres registres

```
Phase 12 : registres. Lis DOMAIN.md §4 (Actes et autres registres) et FEATURES.md §10.
features/registers/config.ts et génération de décrets, arrêtés, notes de service,
factures arrivées et journal des opérations (liste, Sheet, détail, pièces jointes,
historique). Journal des opérations : montants en centimes, totaux débit, crédit, solde.
Signale tout champ supposé : la liste est marquée « à valider ».
```

## Phase 13 — Sauvegarde, paramètres, PWA et déploiement

```
Phase 13 : mise en production. Lis FEATURES.md §9, §12 et §13, DOMAIN.md §2.
- /sauvegarde : export zip en flux (fflate), restauration avec aperçu, vérifications et
  confirmation tapée, régénération des miniatures et de l'index, bandeau de rappel.
- /parametres complet, dont l'état du stockage persistant.
- vite-plugin-pwa (cache de l'app et de /public/ocr, message de mise à jour).
- vercel.json : réécriture SPA et en-têtes de sécurité de FEATURES §13. Avertissement
  quand l'app tourne sur une URL de prévisualisation.
- README de déploiement et de prise en main, avec en gras les règles du stockage local.
Teste : sauvegarde, vider les données du site dans le navigateur, restauration →
tout revient, documents consultables, recherche et chaîne d'audit intactes.
Puis passe la checklist « Définition de terminé » de CLAUDE.md écran par écran.
```

## Phase 14 (facultative) — Reprise des données WinDev

```
Phase 14 : import de l'existant. Lis DOMAIN.md §9 et §12.
Page admin « Importer depuis WinDev » : lecture du zip (CSV + pièces extraites), rapport à
blanc, puis import confirmé : courriers avec leur numéro d'origine, fichiers PDF/images,
historique legacy.imported, recalage des compteurs, documents mis en file d'OCR.
Donne-moi aussi le code WinDev (HExporteCSV + boucle HExtraitMémo) à exécuter côté poste
pour préparer le zip.
```

---

## Prompts de contrôle

### Revue visuelle
```
Revue visuelle. Ouvre chaque écran en 1440 px et 390 px, clair et sombre. Compare à
docs/design/reference-dashboard.png et à DESIGN.md. Pour chaque écran, liste les écarts :
espacements, tailles et graisses de texte, rayons, couleurs hors tokens, icônes non lucide
ou raster, états manquants (vide, chargement, erreur, focus), et tout point de la liste
« Interdits » de CLAUDE.md. Corrige, puis donne la liste de ce que tu as changé.
```

### Revue données et traçabilité
```
Revue de la couche de données. Vérifie qu'aucun composant n'importe data/db.ts, que
chaque écriture passe par un repository avec transaction incluant auditLog, contrôle de
rôle et validation zod, qu'aucun appel crypto.subtle ou fetch n'a lieu dans une
transaction, que les fichiers ne sont rendus que par openDocument / downloadDocument /
printDocument, que les URL blob: sont révoquées, que rien de métier n'est écrit dans le
localStorage. Tableau des constats, puis corrections.
```

### Quand le rendu « fait généré »
```
Ce rendu ressemble à une interface générée. Relis la section « Interdits » de CLAUDE.md
et DESIGN.md §1, §7 et §10. Repère sur cet écran ce qui relève d'un réflexe par défaut
(cartes partout, rayon unique, animation d'entrée, surtitre en capitales, icône non
lucide, couleur hors tokens) et remplace-le par ce que demande le design system.
```
