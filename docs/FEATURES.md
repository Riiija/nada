# Fonctionnalités

## 1. Import de fichiers

Pas de serveur : « importer » = lire le fichier, l'enregistrer dans IndexedDB, puis le lire
par OCR. La progression affichée est réelle à chaque étape.

### Déroulé
```
1. sélection / glisser-déposer
2. contrôle : extension + signature du fichier (PDF, JPEG, PNG, WebP) + taille
   + espace disponible (navigator.storage.estimate)
3. lecture du fichier par morceaux (file.stream()) avec progression
   + SHA-256 dans un Web Worker
4. doublon ? (index documents.sha256) → « Déjà archivé », sinon :
5. préparation hors transaction : nombre de pages, dimensions, miniature (WebP ~240 px)
6. transaction Dexie : documents + files + thumbnails + documentLinks + auditLog
   (document.imported, document.linked)
7. file d'OCR (§2)
```

### Détails
- Barre « Import » = octets lus et hachés / taille totale, puis « Enregistrement ».
- Concurrence : 3 imports en parallèle, OCR un document à la fois.
- La file vit dans un store zustand global : le panneau « Imports » survit à la
  navigation. `beforeunload` prévient si des imports ou lectures sont en cours.
- États d'une ligne : `queued` → `reading` → `saving` → `ocrQueued` → `ocrRunning` →
  `done` ; sorties : `duplicate`, `rejected` (format, taille, espace), `failed`, `canceled`.
- Refus clairs : « Ce fichier n'est pas un PDF ni une image JPEG, PNG ou WebP. »,
  « Le fichier dépasse 50 Mo. », « Espace insuffisant dans ce navigateur : 120 Mo
  disponibles. Faites une sauvegarde puis supprimez des documents. »
- Document ajouté mais OCR interrompu (onglet fermé) : il reste `pending` et la file
  d'OCR le reprend au prochain lancement (§2).

## 2. Lecture OCR — PDF et images uniquement

### Pipeline
1. **PDF** : ouverture avec pdf.js (l'instance exportée par `react-pdf`, pour n'avoir
   qu'une version et un seul worker). Pour chaque page, `getTextContent()` : au moins 80
   caractères non blancs → texte natif, pas d'OCR. Sinon la page est rendue sur un canvas
   d'environ 2000 px de large et passée à Tesseract. Si plus de 80 % des pages ont un texte
   natif : `ocrSource = 'nativeText'`.
2. **Images** (JPEG, PNG, WebP) : décodage avec `createImageBitmap`, application de la
   rotation enregistrée, réduction à 2500 px maximum sur le grand côté, puis Tesseract.
3. Aucun autre format n'est accepté à l'import.

### Tesseract.js
- Un seul worker réutilisé, créé à la demande, terminé après 60 s d'inactivité.
- Langues depuis `settings.ocrLanguages` (défaut `fra`, option `fra+ara`), modèles « fast ».
- Moteur (worker, core wasm) et modèles servis depuis `/public/ocr` (copiés par un script
  `postinstall`), mis en cache par la PWA : l'OCR fonctionne hors ligne.
- Modules OCR en import dynamique, chargés seulement quand un document est à lire.

### Progression
`global = (pages_terminées + progression_page_en_cours) / pages_à_lire`
(les pages à texte natif comptent comme terminées immédiatement).
Libellés : « Préparation du moteur de lecture », « Chargement du modèle français »,
« Lecture de la page 3 sur 12 », « Indexation ».
Fin : confiance moyenne ; < 60 % → avertissement de qualité (DESIGN.md §9).

### Enregistrement
Transaction : `documentPages` (une ligne par page), `documents.contentText`,
`ocrStatus = 'done'`, `ocrConfidence`, `ocrCompletedAt`, journal
`document.ocrCompleted` avec `{ pages, source, confidence, durationMs }`.
Puis mise à jour de l'index de recherche (§4).

### File d'OCR persistante
Au démarrage, tout document `pending` ou `processing` (interrompu) est remis dans la file.
Annulation : `worker.terminate()`, retour à `pending`. « Relancer la lecture » unitaire
(visionneuse) et groupée (liste des documents).

## 3. Visionneuse `/documents/:id`

- **Accès** : `openDocument(id)` vérifie le droit, journalise `document.viewed`, puis
  rend le Blob. Chaque ouverture est journalisée (comme la « Consultation » WinDev).
- **PDF** : react-pdf avec le Blob en source, couche texte active, colonne de miniatures
  (120 px, repliable), zoom 50–200 %, « ajuster à la largeur » par défaut, « 3 / 12 ».
- **Image** : affichage avec zoom (molette, boutons, pincement), déplacement, rotation
  par quarts de tour (enregistrée, journalisée `document.rotated`, proposée pour relancer
  l'OCR), « taille réelle » / « ajuster ».
- **Télécharger** : `downloadDocument(id)` journalise puis déclenche un lien `download`
  sur une URL `blob:` avec le nom d'origine.
- **Imprimer** : `printDocument(id)` journalise puis imprime depuis un iframe caché.
- En-tête : FileTypeIcon 48, titre modifiable en place, badges (catégorie, OCR, restreint),
  actions (Télécharger, Imprimer, Lier à un courrier, Supprimer).
- Panneau droit 360 px à onglets : **Informations** (métadonnées, éléments liés, taille,
  pages, empreinte, archivé le, importé par) ; **Texte** (texte OCR par page, recherche
  surlignée, copie, suit la page courante, arabe en IBM Plex Sans Arabic `dir="rtl"`) ;
  **Historique** (journal de ce document).
- Raccourcis : ← → pages, + − zoom, R rotation (images), `/` recherche dans le texte.
- Lien profond depuis la recherche : `?page=4&q=recouvrement`.
- Toutes les URL `blob:` sont révoquées à la fermeture.

## 4. Recherche

- **Index MiniSearch** : une entrée par courrier (référence, objet, n° dossier, noms de
  provenance / destinataire / parapheur, direction) et une entrée **par page** de document
  (titre + texte de la page), pour ouvrir le document à la bonne page.
- `processTerm` : minuscules, suppression des accents (NFD), mots vides français courts
  ignorés. Recherche par préfixe et tolérance aux fautes (`fuzzy: 0.2` au-delà de 4 lettres).
- Tokenisation qui conserve les références (`12/26`, `D14523696-23`) ; en complément,
  recherche par préfixe sur les index Dexie `reference`, `orderNumber`, `chequeNumber`.
- Index sérialisé dans la table `searchIndex`, rechargé au démarrage, reconstruit si la
  version change ; mis à jour après chaque écriture (ajout, modification, suppression).
  Construction dans un Web Worker au-delà de 2 000 entrées.
- Extraits : ±80 caractères autour du premier terme trouvé, termes entourés de `<mark>`.
- **Palette Ctrl K / ⌘K** (cmdk) : actions rapides, résultats Courriers, Documents (avec
  extrait), Pages. Requête après 150 ms, navigation clavier.
- **Page /recherche** : résultats complets, filtres (type, période, catégorie, direction,
  traité), ouverture au bon endroit.
- Filtres des listes : équivalents WinDev (n°, objet, parapheur / destinataire,
  provenance, date, traité), dans les paramètres de l'URL.

## 5. Tableau de bord `/tableau-de-bord`

Même structure que la référence (DESIGN.md §5). Calculs dans `data/repositories/stats.ts`
via des requêtes Dexie indexées, exposés par `useLiveQuery` (mise à jour immédiate).

En-tête : « Tableau de bord » + « Bonjour {prénom}. Voici l'activité du bureau d'ordre. »

**Ligne 1, cartes KPI** (mois en cours vs mois précédent, sparkline sur 30 jours) :
| Carte                      | Valeur                         | Icône       | Couleur  | Tendance              |
|----------------------------|--------------------------------|-------------|----------|-----------------------|
| Courriers arrivés          | nombre du mois                 | `Inbox`     | accent   | hausse = neutre/verte |
| Courriers départ           | nombre du mois                 | `Send`      | teal     | idem                  |
| Documents archivés         | total + taille (« 3,2 Go »)    | `Archive`   | petrol   | ajouts du mois        |
| En attente de traitement   | arrivés non traités            | `Hourglass` | amber    | hausse = rouge        |

**Ligne 2**
- « Volume mensuel » (2/3) : courbe sur 12 mois, segmented control Arrivés / Départs /
  Archivés, sélecteur d'année.
- « Répartition des documents » (1/3) : donut par catégorie, total au centre, légende en %.
- « Indicateurs » (1/3) : « Courriers traités » (taux de l'année), « Documents lisibles
  par la recherche » (OCR terminé / total), « Espace utilisé » (`navigator.storage.estimate()` :
  utilisé / disponible, avec « Stockage persistant : activé » ou un lien vers Paramètres).

**Ligne 3**
- « Courriers en attente » (1/2) : les 6 plus anciens non traités, ancienneté en badge
  (amber ≥ `staleAfterDays`, accent ≥ 2×), « Voir tout ».
- « Activité récente » (1/2) : 8 derniers événements visibles par l'utilisateur, avatar,
  phrase, temps relatif.

## 6. Courriers arrivés et départ

- **Listes** : en-tête + compteur, « Exporter », « Enregistrer un courrier » ; onglets
  Tous / En attente / Traités avec compteurs ; filtres ; tri ; pagination (25 par page).
  Colonnes arrivés : Date, N°, Objet, Provenance, Destinataire, Position, Pièces jointes,
  Statut. Colonnes départ : Date, N°, Objet, Paraphé par, Direction, Adressé à,
  Pièces jointes.
- **Formulaire** (Sheet), sections :
  « Enregistrement » (Date, N° attribué à l'enregistrement en aperçu, N° dossier) ;
  « Origine et destination » (Provenance, Au bureau de → Fonction + Direction pré-remplies ;
  ou Paraphé par, Direction, Adressé à) ; « Contenu » (Objet, Type) ;
  « Suivi » (Suivi, Position, Traité) pour les arrivés ;
  « Pièces jointes » (zone de dépôt compacte PDF/images + « Choisir dans les archives ») ;
  « Confidentialité » (Normal / Restreint).
  « Enregistrer et nouveau » garde date et direction ; Ctrl+Entrée ; garde-fou.
- **Détail** `/courriers/arrives/:id` : fil d'Ariane, référence + objet, badges, actions
  (Modifier, Marquer comme traité, Changer la position, Supprimer), champs, pièces jointes
  en cartes avec miniature (ouverture dans la visionneuse), chronologie des positions tirée
  du journal, onglet Historique.
- Suppression logique, toast « Annuler » ; corbeille pour l'admin.

## 7. Import en masse `/archivage`

Équivalent du traitement WinDev de sélection multiple : zone de dépôt (PDF et images),
options du lot (Catégorie, Date d'archivage — défaut aujourd'hui —, lier à un élément),
file détaillée, récapitulatif (Sélectionnés, Ajoutés, Doublons ignorés, Refusés, Erreurs),
« Voir les documents ajoutés ». Aucune boîte de dialogue bloquante pendant le lot.

## 8. Historique `/historique`

Tableau et vue chronologique, filtres (utilisateur, famille d'action, type d'élément,
période, texte), ligne dépliable avec le diff et le navigateur, export CSV journalisé,
bouton « Vérifier l'intégrité » (résultat : « 4 812 entrées vérifiées, chaîne intacte » ou
la première entrée incohérente). Chaque fiche a son onglet Historique.

## 9. Sauvegarde et restauration `/sauvegarde` (admin)

Les données n'existent que dans ce navigateur : cette page est vitale.
- En haut, un encadré qui explique en trois phrases où sont les données et ce qui les
  efface ; état du stockage persistant ; espace utilisé ; date de la dernière sauvegarde.
- **Sauvegarder** : vérifie la chaîne d'audit, journalise `backup.exported`, puis produit
  un zip (fflate, écriture en flux, `showSaveFilePicker` si disponible) :
  `manifest.json` (version d'application et de schéma, date, nombre d'éléments par table,
  empreinte de la dernière entrée du journal), `data/<table>.json` pour chaque table sauf
  les binaires, `files/<documentId>.<ext>`. Les miniatures et l'index de recherche ne sont
  pas sauvegardés : ils sont régénérés. Nom : `sauvegarde-ged-2026-10-24.zip`.
  Barre de progression par étape. Met à jour `lastBackupAt`.
- **Restaurer** : choix du zip, lecture du manifeste, aperçu (date, nombre de courriers,
  de documents, taille), vérification de version et de la chaîne d'audit contenue.
  Remplacement complet après un AlertDialog où l'admin tape « RESTAURER ». Puis
  régénération des miniatures et de l'index (avec progression), et journal
  `backup.restored` qui prolonge la chaîne restaurée.
- Rappel : bandeau si aucune sauvegarde depuis 7 jours (DESIGN.md §8).

## 10. Autres registres

Décrets, arrêtés, notes de service, factures arrivées, journal des opérations : même modèle
liste + Sheet + détail, générés depuis `features/registers/config.ts` (colonnes, schéma zod,
champs, scope de numérotation, filtres). Journal des opérations : colonnes Date,
N° commande, N° chèque, Intitulé, Débit, Crédit, Pièce jointe, Observation ; totaux
(débit, crédit, solde) sur la période.

## 11. Exports
CSV en UTF-8 avec BOM et séparateur `;` (ouverture directe dans Excel en français), générés
dans le navigateur avec les filtres courants, journalisés `export.generated`.

## 12. Administration
- `/utilisateurs` : comptes locaux, rôle, désactivation, réinitialisation du mot de passe,
  lien avec un collaborateur.
- `/referentiels/:type` : tableau + Sheet, désactivation si la valeur est utilisée.
- `/parametres` : nom de l'application et de l'organisation, fuseau horaire, formats de
  numérotation, langues OCR, taille max par fichier, devise, seuil de retard, délai de
  verrouillage, état du stockage persistant (bouton « Demander à nouveau »).
- Première utilisation : création de l'admin, nom de l'organisation, données de
  démonstration (facultatif), demande de stockage persistant.

## 13. PWA et déploiement Vercel

- vite-plugin-pwa : manifeste (nom, couleurs des tokens, icônes SVG), service worker qui
  met en cache l'application et `/public/ocr`. Application installable, utilisable hors
  ligne après le premier chargement. Message « Nouvelle version disponible » + « Mettre à
  jour » quand le service worker change.
- Vercel : projet Vite (sortie `dist`), `vercel.json` avec la réécriture SPA
  (`/(.*)` → `/index.html`) et les en-têtes de sécurité : CSP `default-src 'self'`,
  `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`,
  `img-src 'self' blob: data:`, `frame-src 'self' blob:`, `object-src 'none'` ;
  `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- **Un seul domaine de production** (les données sont liées au domaine) : le README le dit
  en gras, et l'application affiche un avertissement si elle tourne sur une URL de
  prévisualisation (`*.vercel.app` différente du domaine configuré).
- Aucune variable d'environnement secrète : il n'y a rien à protéger côté serveur.
