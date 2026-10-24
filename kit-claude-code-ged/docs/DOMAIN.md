# Domaine métier

## 1. Glossaire (interface → code)

| Interface (FR)                      | Code (tables Dexie, champs camelCase)            |
|-------------------------------------|--------------------------------------------------|
| Courrier arrivé / départ            | `mails` avec `flow = 'incoming' / 'outgoing'`    |
| N° d'enregistrement                 | `seq` + `year` → `reference` (ex. `12/26`)       |
| Objet                               | `subject`                                        |
| Provenance (courrier arrivé)        | `sourcePartnerId` → `partners`                   |
| Au bureau de / destinataire interne | `assignedStaffId` → `staff`                      |
| Paraphé par (courrier départ)       | `signedByStaffId` → `staff`                      |
| Adressé à (courrier départ)         | `recipientPartnerId` ou `recipientLabel`         |
| Fonction occupée                    | `staffJobTitle` (copie au moment de la saisie)   |
| Direction                           | `departmentId` → `departments`                   |
| Type de courrier / Suivi / Position | `lookups` (catégories `mailType`, `followUp`, `position`) |
| N° dossier                          | `fileNumber`                                     |
| Traité (O/N)                        | `isProcessed` (0/1) + `processedAt`              |
| Pièce jointe, document archivé      | `documents` + `files` + `documentLinks`          |
| Partenaire                          | `partners`                                       |
| Collaborateur / personnel           | `staff`                                          |
| Chef de l'État, Ministre            | `officials` (`kind`)                             |
| Décret présidentiel                 | `decrees`                                        |
| Arrêté ministériel                  | `ministerialOrders`                              |
| Note de service                     | `serviceNotes`                                   |
| Facture arrivée                     | `incomingInvoices`                               |
| Journal des opérations              | `ledgerEntries`                                  |
| Historique des opérations           | `auditLog`                                       |
| Utilisateur                         | `users` (comptes locaux)                         |

Attention : « Direction » (service) = `department`. Le sens du courrier = `flow`.

## 2. Stockage local : ce que cela implique

Tout est enregistré dans l'IndexedDB du navigateur, pour le domaine où l'application est
publiée. Conséquences à respecter dans le code ET à expliquer dans l'interface
(page Sauvegarde, première utilisation) :

- **Un poste = une base.** Deux ordinateurs, ou deux navigateurs sur le même ordinateur,
  ont chacun leurs propres données. Pas de partage entre postes dans cette version.
- **Un domaine = une base.** Les URL de prévisualisation Vercel ont chacune leur stockage :
  les utilisateurs travaillent toujours sur le domaine de production.
- **Effacer les données du navigateur efface tout.** D'où la sauvegarde intégrée
  (FEATURES.md §9), le rappel tous les 7 jours, et la demande de stockage persistant
  (`navigator.storage.persist()`) au premier lancement, dont le résultat est affiché
  dans Paramètres.
- Safari peut effacer les données d'un site non visité pendant plusieurs jours : navigateur
  recommandé Chrome ou Edge, application installée en PWA.
- **Capacité** : celle accordée par le navigateur (souvent plusieurs Go), lue avec
  `navigator.storage.estimate()` et affichée sur le tableau de bord. Refus d'import si
  l'espace restant est insuffisant, avec un message clair.
- **Les comptes et les rôles organisent le travail, ils ne sont pas une protection** :
  une personne qui a accès au profil du navigateur peut lire les données avec les outils
  de développement. Ne jamais présenter l'application comme sécurisée.
- La couche `data/repositories` est conçue pour être remplacée par une API le jour où
  une base partagée sera nécessaire.

## 3. Rôles et droits

Trois rôles dans `users.role` : `admin`, `archivist` (secrétariat / bureau d'ordre),
`reader` (consultation). Un compte peut être lié à un collaborateur (`staffId`) : c'est ce
lien qui fait de lui le destinataire d'un courrier.

| Action                                        | admin | archivist | reader |
|-----------------------------------------------|:-----:|:---------:|:------:|
| Consulter courriers et documents « normaux »  | oui   | oui       | oui    |
| Consulter un élément « restreint »            | oui   | s'il l'a créé | s'il en est destinataire |
| Créer / modifier courriers, actes, documents  | oui   | oui       | non    |
| Importer des documents                        | oui   | oui       | non    |
| Marquer traité / changer la position          | oui   | oui       | s'il est destinataire (à valider) |
| Supprimer (logique)                           | oui   | oui       | non    |
| Corbeille et restauration d'éléments          | oui   | non       | non    |
| Référentiels                                  | oui   | création et modification | non |
| Comptes, paramètres, sauvegarde/restauration  | oui   | non       | non    |
| Journal : tout                                | oui   | tout sauf connexions | ses actions + historique des éléments visibles |
| Exporter (CSV)                                | oui   | oui       | non (à valider) |

Contrôle dans chaque repository (`requireRole`, `canSee(entity)`), et dans l'interface
pour masquer ce qui n'est pas permis.

### Comptes locaux
- Premier lancement (base vide) : écran « Créer le compte administrateur » + nom de
  l'organisation + case « Charger des données de démonstration ».
- `users` : `id`, `username` (unique), `fullName`, `role`, `staffId`, `isActive`,
  `passwordHash`, `passwordSalt`, `createdAt`, `lastLoginAt`.
- Mot de passe dérivé avec PBKDF2-SHA-256 (`crypto.subtle`, 210 000 itérations, sel aléatoire).
- Session : identifiant du compte dans `sessionStorage`. Verrouillage après 15 minutes
  d'inactivité (paramétrable) : écran verrouillé, mot de passe pour reprendre.

## 4. Schéma IndexedDB (Dexie)

Conventions :
- identifiants `crypto.randomUUID()` ;
- dates métier en chaîne `AAAA-MM-JJ`, horodatages en ISO 8601 UTC (triables) ;
- **booléens stockés en 0/1** : IndexedDB n'indexe pas `true`/`false` ;
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy` sur les tables métier ;
  suppression logique (`deletedAt`, `deletedBy`) sur `mails`, `documents` et les actes.

```ts
db.version(1).stores({
  users:             'id, &username, role, isActive',
  departments:       'id, name, isActive',
  staff:             'id, fullName, departmentId, isActive',
  partners:          'id, name, kind, isActive',
  officials:         'id, kind, fullName, isActive',
  lookups:           'id, category, &[category+label], isActive',
  mails:             'id, &[flow+year+seq], [flow+mailDate], [flow+isProcessed], mailDate, assignedStaffId, signedByStaffId, sourcePartnerId, departmentId, createdAt',
  documents:         'id, sha256, category, ocrStatus, archivedAt, createdAt, title',
  files:             'documentId',               // { documentId, blob }
  thumbnails:        'documentId',               // { documentId, blob } WebP ~240 px
  documentPages:     '[documentId+pageNumber], documentId',
  documentLinks:     '[documentId+entityType+entityId], documentId, [entityType+entityId]',
  decrees:           'id, &[year+seq], signedOn, officialId',
  ministerialOrders: 'id, &[year+seq], signedOn, officialId, departmentId',
  serviceNotes:      'id, &[year+seq], issuedOn, departmentId',
  incomingInvoices:  'id, &[year+seq], receivedOn, supplierPartnerId, status',
  ledgerEntries:     'id, operationDate, orderNumber, chequeNumber',
  counters:          '[scope+year]',
  notifications:     'id, recipientUserId, [recipientUserId+readAt], createdAt',
  auditLog:          '++seq, occurredAt, actorId, action, [entityType+entityId]',
  settings:          'key',
  searchIndex:       'key'                       // index MiniSearch sérialisé
});
```

### Champs
- `departments` : `code`, `name`, `isActive`.
- `staff` : `fullName`, `jobTitle`, `departmentId`, `email`, `isActive`.
- `partners` : `name`, `kind` (`presidency`, `ministry`, `publicBody`,
  `internationalOrg`, `company`, `individual`, `other`), `isActive`.
- `officials` : `kind` (`headOfState`, `minister`), `fullName`, `title`, `termStart`,
  `termEnd`, `isActive`.
- `lookups` : `category`, `label`, `sortOrder`, `isActive`.
- `mails` : `flow`, `seq`, `year`, `reference`, `mailDate`, `subject`, `departmentId`,
  `assignedStaffId`, `signedByStaffId`, `staffJobTitle`, `sourcePartnerId`,
  `recipientPartnerId`, `recipientLabel`, `mailTypeId`, `followUpId`, `positionId`,
  `fileNumber`, `isProcessed`, `processedAt`, `confidentiality` (`normal` | `restricted`),
  traçabilité.
- `documents` : `category` (`mailAttachment`, `archive`, `decree`, `ministerialOrder`,
  `serviceNote`, `invoice`, `ledger`), `title` (par défaut le nom du fichier sans
  extension, comme le `NomPiece` WinDev), `originalFilename`, `kind` (`pdf` | `image`),
  `mimeType`, `sizeBytes`, `sha256`, `pageCount`, `width`, `height` (images),
  `rotation` (0/90/180/270), `ocrStatus` (`pending`, `processing`, `done`, `failed`),
  `ocrSource` (`nativeText`, `tesseract`), `ocrLanguage`, `ocrConfidence`,
  `ocrCompletedAt`, `contentText`, `archivedAt` (date d'archivage saisie),
  `confidentiality`, traçabilité, suppression logique.
- `files` : le Blob d'origine, jamais modifié.
- `thumbnails` : miniature générée à l'import (première page ou image réduite).
- `documentPages` : `text`, `confidence` par page (une seule page pour une image).
- `documentLinks` : `entityType` ∈ `mail`, `decree`, `ministerialOrder`, `serviceNote`,
  `incomingInvoice`, `ledgerEntry` ; `linkedBy`, `linkedAt`.
- `settings` (clé → valeur) : `organizationName`, `appName`, `timezone`,
  `referenceFormats`, `ocrLanguages`, `maxUploadMb`, `currency`, `staleAfterDays`
  (défaut 15), `lockAfterMinutes` (défaut 15), `lastBackupAt`, `schemaVersion`.

### Actes et autres registres
Champs proposés, **à valider avec le métier** (non visibles dans les captures WinDev) :
- `decrees` : `seq`, `year`, `reference`, `officialNumber`, `signedOn`, `subject`,
  `officialId` (chef de l'État), `publishedOn`, `notes`.
- `ministerialOrders` : idem + `officialId` (ministre), `departmentId`.
- `serviceNotes` : `seq`, `year`, `reference`, `issuedOn`, `subject`, `departmentId`,
  `audience`, `signedByStaffId`.
- `incomingInvoices` : `seq`, `year`, `reference`, `supplierPartnerId`, `invoiceNumber`,
  `invoiceDate`, `receivedOn`, `amount`, `dueDate`, `status` (`received`, `validated`,
  `paid`, `rejected`), `departmentId`.
- `ledgerEntries` (visible dans les captures) : `operationDate`, `label`, `orderNumber`,
  `chequeNumber`, `debit` (≥ 0), `credit` (≥ 0), `observation`. Montants en centimes
  entiers pour éviter les erreurs d'arrondi ; solde cumulé calculé à l'affichage.

## 5. Numérotation

Comportement WinDev conservé : `n/aa` (`1/26`, `2/26`…), séquence propre à chaque
registre, remise à 1 chaque année. Format paramétrable par registre dans
`settings.referenceFormats` (défaut `{n}/{yy}` ; un format historique
`{n}-MFBSB/CAB/{yy}` existe en commentaire dans le code WinDev).

Dans la transaction d'enregistrement (`rw` sur `counters`, le registre et `auditLog`) :
lire `counters[scope+year]`, incrémenter, écrire, formater `reference`, ajouter l'élément,
écrire le journal. Les transactions IndexedDB en écriture sur les mêmes tables sont
sérialisées, y compris entre onglets : pas de doublon possible. L'index unique
`[flow+year+seq]` sert de garde-fou.
- `year` = année courante dans `settings.timezone`.
- Scopes : `mailIncoming`, `mailOutgoing`, `decree`, `ministerialOrder`, `serviceNote`,
  `incomingInvoice`.
- Le formulaire affiche un aperçu « N° attribué à l'enregistrement » (non réservé) ;
  le vrai numéro apparaît dans le toast.
- Un numéro supprimé (logiquement) n'est jamais réutilisé.
- Import de l'historique : le numéro d'origine est conservé et le compteur recalé au maximum.

## 6. Règles métier

### Courrier arrivé
Obligatoires (comme WinDev) : date, objet, direction, n° dossier, suivi, position,
destinataire (« au bureau de »). Provenance : facultative dans WinDev, **à valider**.
- Choisir le destinataire pré-remplit la fonction (modifiable) et la direction.
- Passage à traité : `processedAt` = maintenant, action `mail.processed`.
- À la création, si le destinataire est lié à un compte actif : notification locale
  « Nouveau courrier : {objet} » (équivalent de `NotifierNouveauCourrier`), visible
  quand ce compte se connecte sur ce poste.
- « En retard » : non traité depuis plus de `staleAfterDays` jours.

### Courrier départ
Obligatoires (comme WinDev) : date, objet, paraphé par. Direction et « adressé à » :
facultatifs, **à valider**. « Adressé à » accepte un partenaire ou un libellé libre.

### Documents
- **Formats acceptés : PDF, JPEG, PNG, WebP.** Contrôle de l'extension ET de la signature
  du fichier (`%PDF-`, `FF D8 FF`, `89 50 4E 47`, `RIFF….WEBP`), pas seulement du type MIME.
- Taille max `maxUploadMb` (défaut 50).
- Doublon = même empreinte SHA-256, quel que soit le nom. Même nom avec un contenu
  différent : accepté, avec un avertissement.
- La date d'archivage est saisie (défaut : maintenant), comme `SAI_Dat_archiveCD`.
- Le fichier d'origine n'est jamais modifié ; la rotation d'une image est un réglage
  d'affichage (`rotation`) réutilisé pour l'OCR.

### Journal des opérations
Montants au format `1 750 000`, devise des paramètres, totaux débit / crédit / solde sur
la période filtrée. Recherche par n° de commande et n° de chèque (comme WinDev).

## 7. Journal d'audit

### Entrée
`auditLog` : `seq` (auto), `occurredAt`, `actorId`, `actorName`, `actorRole` (copiés au
moment de l'action), `action`, `entityType`, `entityId`, `entityLabel`
(ex. « Courrier arrivé 12/26 : Visite du musée »), `changes`
(`{ "position": ["Au cabinet", "Parti à destination"] }`), `metadata`, `userAgent`,
`prevHash`, `hash`.

### Écriture
- Une seule fonction `appendAudit(tx, entry)` dans `data/audit.ts`, appelée **dans la
  transaction** de l'action métier. Elle lit la dernière entrée, calcule
  `hash = SHA-256(prevHash + JSON canonique de l'entrée)` avec `@noble/hashes`
  (synchrone, car `crypto.subtle` est asynchrone et clôturerait la transaction), puis ajoute.
- L'auteur est toujours l'utilisateur de la session, jamais une valeur passée par l'interface.
- Diff des seules propriétés modifiées ; `contentText` est remplacé par sa longueur.
- Aucune fonction de modification ou de suppression d'une entrée n'existe.

### Vérification
Le journal ne peut pas être rendu impossible à modifier dans un navigateur, mais il peut
rendre toute modification **détectable** : `verifyAuditChain()` recalcule la chaîne et
signale la première entrée incohérente. Bouton « Vérifier l'intégrité » sur la page
Historique ; vérification automatique avant chaque sauvegarde et après chaque restauration.

### Actions
- `auth.signedIn`, `auth.signedOut`, `auth.signInFailed`, `auth.locked`, `auth.unlocked`,
  `auth.passwordChanged`
- `mail.created`, `mail.updated`, `mail.processed`, `mail.positionChanged`,
  `mail.deleted`, `mail.restored`
- `document.imported`, `document.duplicateRejected`, `document.ocrCompleted`,
  `document.ocrFailed`, `document.viewed`, `document.downloaded`, `document.printed`,
  `document.linked`, `document.unlinked`, `document.updated`, `document.rotated`,
  `document.deleted`, `document.restored`
- `decree.*`, `ministerialOrder.*`, `serviceNote.*`, `incomingInvoice.*`,
  `ledgerEntry.*` (`created`, `updated`, `deleted`, `restored`)
- `referenceData.created`, `referenceData.updated`, `referenceData.deactivated`
- `user.created`, `user.roleChanged`, `user.deactivated`, `user.reactivated`,
  `user.passwordReset`
- `export.generated`, `audit.exported`, `audit.verified`
- `backup.exported`, `backup.restored`, `settings.updated`, `demo.loaded`, `legacy.imported`

Chaque action a une phrase française dans `data/audit-labels.ts` :
« a consulté le document », « a marqué le courrier comme traité », « a changé la
position : Au cabinet → Parti à destination ».

## 8. Notifications
Table `notifications` locale, lue avec `useLiveQuery` (se met à jour dans tous les onglets).
Cloche de la topbar : point si non lu, popover avec la liste, « Tout marquer comme lu »,
clic = ouverture de l'élément.

## 9. Correspondance avec WinDev

### Courrier_arrive → `mails` (`flow = 'incoming'`)
| WinDev              | Écran                  | Web                          |
|---------------------|------------------------|------------------------------|
| `NumEnrArr`         | N° Enr                 | `seq`, `year`, `reference`   |
| `Date_courArr`      | Date                   | `mailDate`                   |
| `Objet_courArr`     | Objet                  | `subject`                    |
| `Source_courArr`    | Provenance             | `sourcePartnerId`            |
| `NomPrenom`         | Au bureau de           | `assignedStaffId`            |
| `FonctionOccupe`    | Fonction               | `staffJobTitle`              |
| `Nom_Direction`     | Destinataire Direction | `departmentId`               |
| `Libelle_Type`      | Type                   | `mailTypeId`                 |
| `Suivie_Cour`       | Suivi                  | `followUpId`                 |
| `Position_actuelle` | Position               | `positionId`                 |
| `Num_Dos`           | N° dossier             | `fileNumber`                 |
| `Traite`            | Traité (O/N)           | `isProcessed`                |
| `NomPieceCA`        | Pièce jointe           | `documentLinks`              |
| `date_traite` + `heure_traite` | —           | `createdAt`                  |

### Courrier_depart → `mails` (`flow = 'outgoing'`)
| WinDev                | Écran        | Web                                     |
|-----------------------|--------------|-----------------------------------------|
| `NumEnrDepart`        | N° Enr       | `seq`, `year`, `reference`              |
| `Dat_courDep`         | Date         | `mailDate`                              |
| `Objet_courDep`       | Objet        | `subject`                               |
| `NomPrenom`           | Paraphé par  | `signedByStaffId`                       |
| `FonctionOccupe`      | —            | `staffJobTitle`                         |
| `Nom_Direction`       | Direction    | `departmentId`                          |
| `Destination_courDep` | Adressé à    | `recipientPartnerId` / `recipientLabel` |
| `NomPiece`            | Pièce jointe | `documentLinks`                         |

### Piece_Jointe → `documents` + `files`
`IDPiece_Jointe` → `id` ; `NomPiece` → `title` (+ `originalFilename`) ;
`LienPiece` (mémo binaire) → Blob dans `files` ; `Dat_archive` → `archivedAt`.

### Historique_Operation → `auditLog`
`LOGIN` → `actorId` (session) ; `OperEffect` → `action` ;
`DateTraite_Hist` + `HeureTraite_Hist` → `occurredAt` ;
`Num_Hist`, `Objet_Hist`, `NomPiece_Hist`, `NomDirect_Hist`, `Destinataire_Hist` →
`entityId`, `entityLabel`, `metadata` ; `Positio_Hist`, `Suivie_Hist`, `NumDos_Hist` → `changes`.

### Écarts volontaires (défauts corrigés)
1. **Numérotation** calculée avec `HLitDernier` puis une concaténation de chaînes
   (`Val(NumEnr + 1) + 1`), sans verrou : numéros en double possibles, « 9/26 » et
   « 10/26 » mal triés, remise à 1 non garantie. → compteur dans une transaction (§5).
2. **Lien pièce ↔ courrier par le nom de fichier** : deux fichiers différents de même nom
   sont refusés, deux copies identiques de noms différents passent. → lien par
   identifiant, doublon par empreinte SHA-256.
3. **Consultation** : extraction du PDF en clair dans le répertoire courant du poste, puis
   ouverture par Adobe Reader cherché à des chemins fixes ; si la pièce n'est pas trouvée,
   un ancien fichier extrait peut s'ouvrir sans être journalisé. → visionneuse intégrée,
   aucun fichier écrit sur le disque, journalisation avant tout affichage.
4. **Historique** écrit à la main dans chaque traitement, sans contrôle d'erreur, avec un
   identifiant pris dans un champ de saisie (`SAI_RecupLOGIN_HIST`). → écrit dans la même
   transaction que l'action, auteur tiré de la session, chaînage vérifiable.
5. **Validation** par un message global « Merci de renseigner la case vide » → erreurs par champ.
6. **Import en masse** : une boîte de dialogue bloquante par doublon ou erreur → file non
   bloquante + récapitulatif.
7. Date et heure de traitement dans deux champs → un horodatage.
8. Message erroné « Aucun fichier attaché à ce courrier arrivé » dans l'écran départ.

## 10. Points à valider avec le métier
- Un seul poste suffit-il, ou plusieurs postes doivent-ils partager les mêmes données ?
  (Dans le second cas, il faudra une base partagée : la couche repositories est prévue pour.)
- Champs des décrets, arrêtés, notes de service et factures (§4).
- Provenance obligatoire pour un courrier arrivé ? Direction et « adressé à » pour un départ ?
- Qui peut marquer un courrier comme traité et changer sa position ?
- Niveau « restreint » souhaité, et qui le voit ?
- Langues OCR : français seul, ou français + arabe ?
- Format de numérotation (avec ou sans préfixe de service).
- Les lecteurs peuvent-ils exporter ?

## 11. Données de démonstration
Générées dans le navigateur (`data/seed/`) quand l'admin coche « Charger des données de
démonstration » au premier lancement (et seulement sur une base vide) :
- 6 directions (Cabinet, DSI, DAF, Direction du budget, Direction des ressources humaines,
  Secrétariat général) ; 20 collaborateurs aux noms fictifs ; 15 partenaires (UNICEF,
  Cabinet présidentiel, Banque centrale, PNUD, ministères…) ;
- listes : types (Lettre, Note, Invitation, Facture, Rapport, Demande), suivis (À traiter,
  Pour information, Pour avis, Urgent), positions (Au bureau d'ordre, Au cabinet,
  En traitement, Parti à destination, Classé) ;
- ~180 courriers arrivés et ~120 départs répartis sur 12 mois (objets du type « Visite du
  musée », « Moyen de paiement », « Fiche comptable », « Recouvrement des prêts »),
  environ 20 % non traités dont certains en retard ;
- ~40 lignes de journal des opérations, quelques décrets, arrêtés, notes, factures ;
- ~25 documents générés avec pdf-lib et canvas : PDF avec couche texte, PDF composés
  uniquement d'images (pour tester l'OCR), images PNG/JPEG de « courriers scannés ».
  Les PDF texte sont indexés tout de suite ; 3 documents image restent « en attente »
  pour démontrer l'OCR ;
- 3 comptes de test (archiviste, lecteur, lecteur destinataire) dont les mots de passe
  sont affichés une seule fois à l'admin ;
- un historique d'audit cohérent et chaîné.

## 12. Reprise des données WinDev (phase optionnelle)
Côté WinDev : export CSV de chaque fichier HFSQL et extraction des mémos binaires
(`HExtraitMémo`) dans un dossier, un fichier par `IDPiece_Jointe`, le tout zippé.
Côté web : page admin « Importer depuis WinDev » qui lit le zip, rapproche les
référentiels par libellé, affiche un **rapport à blanc** (créations, libellés non reconnus,
fichiers manquants, formats refusés) puis, après confirmation, recrée les courriers avec
leur numéro d'origine (`12/26` → `seq = 12`, `year = 2026`), importe les fichiers PDF et
images, recrée l'historique en `legacy.imported` (date d'origine dans `metadata`), recale
les compteurs et met les documents en file d'OCR.
