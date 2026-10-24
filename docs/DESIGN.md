# Design system

## 1. Intention

Un outil de travail quotidien pour un bureau d'ordre : calme, net, dense sans être serré.
La structure suit la référence `docs/design/reference-dashboard.png` : sidebar claire à
gauche, topbar fine, fond blanc, blocs de données bordés d'un trait fin, une couleur
d'accent vive utilisée avec parcimonie, noir pour l'action principale.

L'élément mémorable de l'application est le **dépôt de fichiers et la lecture OCR**
(section 9) : c'est là qu'on dépense l'audace visuelle. Tout le reste reste sobre.

## 2. Couleurs

Toutes les couleurs passent par des variables CSS déclarées sur `:root` et `.dark`,
exposées à Tailwind v4 via `@theme inline`. Aucune couleur en dur dans un composant.

| Token               | Clair     | Sombre    | Usage                                              |
|---------------------|-----------|-----------|----------------------------------------------------|
| `--bg`              | `#FFFFFF` | `#0E0E10` | fond de page                                       |
| `--sidebar`         | `#FAFAFB` | `#121215` | fond sidebar                                       |
| `--surface`         | `#FFFFFF` | `#151518` | cartes, inputs, panneaux                           |
| `--surface-muted`   | `#F5F5F6` | `#1C1C20` | survol, piste du segmented control, en-tête tableau|
| `--surface-active`  | `#EEEEF0` | `#24242A` | élément de navigation actif, piste des barres      |
| `--border`          | `#E6E6E9` | `#26262B` | traits, contours                                   |
| `--border-strong`   | `#D4D4D9` | `#34343B` | contour dropzone, input survolé                    |
| `--text`            | `#18181B` | `#F2F2F3` | texte principal, bouton principal                  |
| `--text-muted`      | `#6B6B74` | `#A0A0AA` | libellés, descriptions                             |
| `--text-subtle`     | `#9C9CA6` | `#6E6E78` | placeholder, méta                                  |
| `--accent`          | `#F2541B` | `#FF6B35` | accent de marque : courriers arrivés, OCR, focus   |
| `--accent-tint`     | `#FEEFE8` | `#2A1A13` | fond de tuile d'icône, dropzone survolée           |
| `--teal`            | `#0E9384` | `#2DB3A3` | courriers départ, succès « traité »                |
| `--teal-tint`       | `#E6F5F3` | `#10241F` |                                                    |
| `--petrol`          | `#1E4E5F` | `#5A9BB2` | archives, import de fichier                        |
| `--petrol-tint`     | `#E8EFF2` | `#14212A` |                                                    |
| `--amber`           | `#F2A20C` | `#F5B53D` | en attente, avertissement                          |
| `--amber-tint`      | `#FEF5E2` | `#2A2210` |                                                    |
| `--success`         | `#16A34A` | `#3FBF6E` | tendance positive                                  |
| `--danger`          | `#DC3B3B` | `#F06363` | erreur, tendance négative, suppression             |
| `--danger-tint`     | `#FDECEC` | `#2C1515` |                                                    |

Séries de graphiques, dans cet ordre : accent, teal, petrol, amber, puis `--text-subtle`.
Le orange de marque est vif et saturé ; ne pas le remplacer par un orange terreux.

## 3. Typographie

- **IBM Plex Sans** (400, 500, 600, 700), auto-hébergée avec `@fontsource` (pas de CDN), variable `--font-sans`.
  Choisie pour son registre institutionnel et ses chiffres tabulaires nets.
- **IBM Plex Sans Arabic** chargée uniquement dans le panneau de texte OCR quand le texte
  contient de l'arabe (`lang="ar" dir="rtl"`).
- `font-variant-numeric: tabular-nums` sur tous les nombres : KPI, montants, références
  (`12/26`), dates de tableau, pourcentages. Pas de monospace.

| Rôle                        | Taille / interligne | Graisse | Autre                 |
|-----------------------------|---------------------|---------|-----------------------|
| Titre de page (h1)          | 26 / 32             | 700     | `letter-spacing: -0.015em` |
| Titre de carte / section    | 16 / 24             | 600     |                       |
| Valeur KPI                  | 28 / 34             | 700     | tabular               |
| Corps                       | 14 / 20             | 400     |                       |
| Libellé de champ, nav       | 13–14 / 20          | 500     |                       |
| Description sous un titre   | 13 / 20             | 400     | `--text-muted`        |
| Méta, aide, axe de graphique| 12 / 16             | 400     | `--text-muted`        |
| Libellé de groupe sidebar   | 12 / 16             | 500     | `--text-subtle`, casse de phrase |

Longueur de ligne des textes courants ≤ 80 caractères (descriptions, aide, état vide).

## 4. Espacement, rayons, ombres

- Grille de 4 px. Padding de page : 24 px (≥ 1024 px), 16 px en dessous.
  Espace entre blocs : 20 px. Padding de carte : 20 px.
- Rayons hiérarchisés, pas un rayon unique partout :
  cartes et panneaux 12 px ; boutons, inputs, éléments de nav 8 px ;
  tuile d'icône KPI 10 px ; badges, pastilles, barres de progression : `9999px`.
- Ombres : cartes = trait `--border` + `0 1px 2px rgb(16 16 20 / 0.04)`.
  Popover, menu, dialog, sheet = `0 12px 32px -8px rgb(16 16 20 / 0.18)`. Rien d'autre.

## 5. Layout

```
┌──────────────────┬────────────────────────────────────────────────────────────────┐
│ [logo] Courrier  │ [loupe] Rechercher un courrier, un document…  Ctrl K           │
│        & Archives│                        [+ Nouveau courrier v] | lune cloche (NA)│
│ ─────────────────├────────────────────────────────────────────────────────────────┤
│ Principal      v │ Tableau de bord                                                 │
│  > Tableau de b. │ Bonjour Nadia. Voici l'activité du bureau d'ordre.              │
│    Recherche     │                                                                 │
│ Courriers      v │ ┌ KPI ─────┐ ┌ KPI ─────┐ ┌ KPI ─────┐ ┌ KPI ─────┐            │
│    Arrivés   12  │ │ sparkline│ │          │ │          │ │          │            │
│    Départ        │ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│ Actes et docs  v │ ┌ Volume mensuel (2/3) ─────────────┐ ┌ Répartition (1/3) ─┐  │
│    Décrets       │ │ area chart + segmented control    │ │ donut + légende    │  │
│    Arrêtés       │ │                                   │ ├ Indicateurs ───────┤  │
│    Notes de serv.│ │                                   │ │ barres de progrès  │  │
│    Factures      │ └───────────────────────────────────┘ └────────────────────┘  │
│    Journal opé.  │ ┌ Courriers en attente (1/2) ───────┐ ┌ Activité récente ──┐  │
│ Archives       v │ └───────────────────────────────────┘ └────────────────────┘  │
│ Administration v │                                                                 │
│ ─────────────────│                                                                 │
│ (NA) Nadia Ahmed │                                                                 │
│      Archiviste [sortie]                                                            │
└──────────────────┴────────────────────────────────────────────────────────────────┘
```

Tout est aligné à gauche. Pas de contenu centré sauf états vides et page de connexion.

### Sidebar
- Largeur 264 px ; repliée 72 px (icônes seules + Tooltip). État mémorisé dans le
  localStorage (préférence d'interface).
- Bouton de repli : cercle 24 px, `--surface` + `--border`, posé à cheval sur le bord droit
  à hauteur du titre de page (comme la référence), icône `ChevronLeft`/`ChevronRight` 14 px.
- En-tête : `Logo` (tuile 36 px, rayon 10, fond `--text`, glyphe blanc en SVG) + nom de
  l'application 15/600 + nom de l'organisation 12 `--text-muted` (les deux viennent des
  paramètres). Séparé du reste par un trait.
- Groupes repliables : libellé 12/500 `--text-subtle` en casse de phrase + `ChevronDown` 14.
- Élément : hauteur 36, padding horizontal 10, rayon 8, icône 18, écart 12, texte 14/400
  `--text-muted`. Survol : `--surface-muted`. Actif : `--surface-active`, texte `--text` 500,
  icône `--text`.
- Compteur à droite (ex. courriers non traités) : pastille hauteur 20, 11/600,
  fond `--surface-active` ; si des courriers dépassent 15 jours d'attente : fond
  `--accent-tint`, texte `--accent`.
- Pied : avatar 36 (initiales), nom 14/500, rôle 12 `--text-muted`, bouton icône `LogOut`.
- < 1024 px : la sidebar devient un Sheet à gauche ouvert par un bouton `Menu` dans la topbar.

### Topbar
- Hauteur 64, fond `--bg`, trait bas, collante.
- Gauche : bouton de recherche présenté comme un input (largeur 340, hauteur 38, icône
  `Search`, placeholder, `kbd` « Ctrl K » ou « ⌘K » selon la plateforme) qui ouvre la palette.
- Droite : bouton principal noir « Nouveau courrier » avec `Plus` et menu (Courrier arrivé,
  Courrier départ, Importer des documents) ; séparateur vertical ; boutons icône 36 px
  « fantôme » : thème (`Moon`/`Sun`), notifications (`Bell` + point `--accent` 8 px si non
  lus) ; avatar 36 avec menu (Mon profil, Thème, Se déconnecter).

### En-tête de page
Titre h1 + description sur une ligne. Actions de page alignées à droite sur la même ligne
(ex. « Exporter », « Enregistrer un courrier »). Fil d'Ariane uniquement sur les pages
de détail (`Courriers arrivés / 12/26`).

### Grille
≥ 1280 : 4 colonnes de KPI, graphique 2/3 + colonne 1/3. 768–1279 : 2 colonnes.
< 768 : 1 colonne.

## 6. Navigation et icônes

| Groupe          | Entrée                    | Icône lucide     | Route                        |
|-----------------|---------------------------|------------------|------------------------------|
| Principal       | Tableau de bord           | `LayoutGrid`     | /tableau-de-bord             |
|                 | Recherche                 | `Search`         | /recherche                   |
| Courriers       | Courriers arrivés         | `Inbox`          | /courriers/arrives           |
|                 | Courriers départ          | `Send`           | /courriers/departs           |
| Actes et documents | Décrets présidentiels  | `Landmark`       | /decrets                     |
|                 | Arrêtés ministériels      | `Gavel`          | /arretes                     |
|                 | Notes de service          | `NotebookPen`    | /notes-de-service            |
|                 | Factures arrivées         | `Receipt`        | /factures                    |
|                 | Journal des opérations    | `BookOpenText`   | /journal-operations          |
| Archives        | Tous les documents        | `Archive`        | /documents                   |
|                 | Importer des documents    | `FolderInput`    | /archivage                   |
| Administration  | Historique des opérations | `History`        | /historique                  |
|                 | Référentiels              | `Building2`      | /referentiels/directions     |
|                 | Utilisateurs              | `UserCog`        | /utilisateurs                |
|                 | Sauvegarde et restauration| `DatabaseBackup` | /sauvegarde                  |
|                 | Paramètres                | `Settings`       | /parametres                  |

Référentiels (sous-navigation par onglets) : Directions `Building2`, Collaborateurs `Users`,
Partenaires `Handshake`, Chefs de l'État `Flag`, Ministres `Briefcase`, Types de courrier
`Tags`, Suivis `ListChecks`, Positions `MapPin`.

Le groupe Administration n'est visible que selon le rôle (voir DOMAIN.md §2).

## 7. Icônes et illustrations

- Uniquement `lucide-react`, via un wrapper `Icon` qui impose `strokeWidth={1.75}`,
  `aria-hidden` par défaut et la couleur `currentColor`.
  Tailles : 14 (méta, tendances), 16 (boutons, inline), 18 (navigation), 20 (tuiles KPI).
- `FileTypeIcon` : SVG maison (pas d'icône lucide) : silhouette de page 24×30 avec coin
  plié, bandeau bas portant l'extension en 7 px 700. Deux variantes seulement :
  PDF (bandeau `#D64545`) et image JPG/PNG/WEBP (bandeau `--petrol`).
  Tailles 28 (tableaux), 36 (file d'import), 48 (visionneuse).
- `Logo` : SVG maison, réutilisé pour `public/favicon.svg`.
- Les miniatures et aperçus de documents (rendu d'une page de PDF, photo importée) sont
  du **contenu**, pas des icônes : ils peuvent être des images. L'interface, elle, n'utilise
  que du SVG.
- Illustrations d'état vide : petits dessins au trait en SVG inline (trait 1.5,
  `--text-subtle`, un seul détail `--accent`) : boîte aux lettres vide, classeur vide,
  loupe sans résultat, journal vide. 120 px de large maximum.

## 8. Composants

### Boutons
Hauteurs 32 (sm), 36 (défaut), 40 (lg). Écart icône/texte 8, icône 16.
- **Principal** : fond `--text`, texte `--bg` (s'inverse en sombre), survol opacité 0.9.
  Un seul bouton principal par zone.
- **Secondaire** : `--surface`, trait `--border`, texte `--text`, survol `--surface-muted`.
- **Fantôme** : transparent, survol `--surface-muted`. Boutons icône de la topbar.
- **Danger** : secondaire avec texte `--danger` ; fond `--danger` plein uniquement dans
  l'AlertDialog de confirmation.
- Chargement : spinner 14 px à la place de l'icône, libellé conservé, bouton désactivé.

### Champs
- Libellé au-dessus (13/500), astérisque `--accent` si obligatoire, aide en 12 `--text-muted`
  sous le champ, erreur en 12 `--danger` avec `CircleAlert` 14 sous le champ.
  Jamais de libellé suivi de « : » comme dans WinDev.
- Input : hauteur 38, rayon 8, fond `--surface`, trait `--border` (survol `--border-strong`),
  padding 12, texte 14. Focus : trait `--accent` + anneau 3 px `--accent` à 18 % d'opacité.
  Erreur : trait `--danger` + anneau `--danger` 15 %. Désactivé : `--surface-muted`.
- Textarea : même style, 3 lignes min, redimensionnable verticalement.
- **Combobox** (référentiels) : déclencheur identique à un input + `ChevronsUpDown` ;
  popover avec recherche (cmdk), liste, élément « Créer « … » » en bas si le rôle le permet.
- **DatePicker** : saisie directe `jj/mm/aaaa` + calendrier en popover (react-day-picker, fr).
- **Switch** pour Traité (oui/non), pas de liste déroulante OUI/NON.
- Montants : alignés à droite, séparateur de milliers espace, suffixe devise en `--text-muted`.

### Formulaires
- Création et modification dans un **Sheet** à droite (largeur 600, plein écran < 640),
  la liste reste visible derrière. En-tête : titre + description + fermer. Corps défilant
  en sections titrées (16/600) séparées d'un trait. Grille 2 colonnes ≥ 640 px.
  Pied collant : « Annuler » (secondaire), « Enregistrer et nouveau » (secondaire),
  action principale.
- `Ctrl+Entrée` enregistre. Fermer avec des modifications non enregistrées ouvre un
  AlertDialog.
- Après « Enregistrer et nouveau » : formulaire réinitialisé, date et direction conservées,
  focus sur le premier champ (reproduit le RAZ + DonneFocus de WinDev).

### Badges de statut
Pastille : point 6 px + texte 12/500, fond teinté, rayon plein.
Traité `--teal`, En attente `--amber`, En retard (> 15 j) `--accent`, Archivé `--petrol`,
OCR en cours `--petrol` + spinner, OCR terminé `--teal`, OCR à relancer `--danger`,
Restreint `--text` sur `--surface-active` avec `Lock` 12.

### Tableaux
- Barre d'outils au-dessus : recherche (input 280), filtres en Popover avec cases à cocher
  (puces actives affichées avec `X` pour retirer), période, « Réinitialiser », visibilité
  des colonnes, export.
- En-tête collant, hauteur 40, texte 12/500 `--text-muted`, fond `--surface-muted`.
  Lignes de 48, trait bas, survol `--surface-muted`, clic = ouverture du détail.
- Référence en 14/500 tabular. Objet tronqué avec Tooltip. Pièces jointes : `Paperclip` 14
  + nombre. Dernière colonne : menu `Ellipsis` (Ouvrir, Modifier, Télécharger, Supprimer).
- Sélection multiple : case à cocher, barre d'actions groupées qui apparaît en bas.
- Pied : « 1–25 sur 312 », taille de page, précédent/suivant.
- < 768 px : liste de lignes empilées (référence + objet + badge), pas de défilement horizontal.

### Cartes KPI (copie fidèle de la référence)
Libellé 13 `--text-muted` en haut à gauche ; tuile d'icône 40 px rayon 10 en haut à droite
(fond teinté, icône 20 colorée) ; valeur 28/700 ; ligne de tendance : `TrendingUp`/
`TrendingDown` 14 + pourcentage 13/600 + « vs mois dernier » `--text-muted`.
Sparkline en bas, hauteur 56, **qui touche les bords de la carte** (carte en
`overflow: hidden`, pas de padding bas), trait 2 px, remplissage en dégradé vertical de
la couleur de série de 18 % à 0 %. La couleur de tendance suit le sens métier, pas le signe :
une hausse des courriers en attente est rouge.

### Graphiques (recharts)
Grille horizontale en pointillés `--border`, pas de lignes d'axe, graduations 12
`--text-muted`, montants abrégés (`45 k`). Courbe `monotone`, trait 2.5, aire en dégradé
20 % → 0 %. Tooltip personnalisé : carte `--surface`, trait, ombre de popover, 12 px.
Donut : rayon intérieur 62 %, `paddingAngle` 2, total au centre (22/700) + légende
(12 `--text-muted`) ; légende à droite : point coloré, libellé, valeur 13/600 alignée à droite.

### Segmented control
Piste `--surface-muted`, rayon 8, padding 3 ; segment actif `--surface` + ombre 1 px +
texte `--text` 500 ; autres `--text-muted`. Déplacement du fond actif animé (150 ms).

### Barres de progression
Hauteur 8, rayon plein, piste `--surface-active`. Ligne au-dessus : libellé 14/500 +
pourcentage 13 `--text-muted` à droite. Ligne en dessous : 12 `--text-muted` (valeur / cible).
`role="progressbar"` + `aria-valuenow`.

### Autres
- Dialog 440 px ; une confirmation destructive dit la conséquence :
  « Supprimer le courrier 12/26 ? Il disparaîtra des listes. L'opération est enregistrée
  dans l'historique. »
- Toasts sonner en bas à droite, fond `--surface`, trait, icône colorée ; suppression avec
  bouton « Annuler » pendant 6 s.
- Skeletons `--surface-muted` avec léger miroitement (désactivé si mouvement réduit).
- Avatars : initiales blanches sur une couleur déterministe (hash du nom) parmi `--petrol`,
  `--teal`, `#B8431A`, `#3F3F46`.
- **Bandeau de sauvegarde** : si la dernière sauvegarde date de plus de 7 jours, bandeau
  fin sous la topbar, fond `--amber-tint`, icône `HardDriveDownload` 16, texte « Dernière
  sauvegarde il y a 9 jours. Les données ne sont enregistrées que dans ce navigateur. »,
  bouton secondaire « Sauvegarder maintenant ». Masquable 24 h.
- **Écran verrouillé** (inactivité) : même mise en page que la connexion, avatar et nom de
  l'utilisateur, champ mot de passe, lien « Changer d'utilisateur ».
- États vides : illustration SVG, titre 15/600, une phrase, une action.
  Ex. « Aucun courrier arrivé ce mois-ci » / « Les courriers enregistrés apparaîtront ici. »
  / [Enregistrer un courrier].

## 9. Dépôt de fichiers et lecture OCR (l'élément signature)

### Zone de dépôt
- Hauteur 200 (compacte 120 dans le formulaire de courrier), trait 1.5 px en pointillés
  `--border-strong`, rayon 12, fond `--surface`.
- Contenu centré : tuile 44 px `--surface-muted` avec `FileUp` 22 ; « Déposez vos documents
  ici » 15/600 ; « PDF ou images (JPEG, PNG, WebP), 50 Mo maximum par fichier » 13 `--text-muted` ;
  bouton secondaire « Parcourir les fichiers ».
- Survol avec fichiers : trait plein `--accent`, fond `--accent-tint`, tuile `--accent` avec
  icône blanche qui monte de 3 px, texte « Relâchez pour ajouter 4 fichiers ».
- Type refusé : trait `--danger`, texte qui dit quels types sont acceptés.
- Accessible au clavier (c'est un bouton), annonce les ajouts via une région `aria-live`.

### Ligne de fichier (file d'import et panneau « Imports »)
```
[FileTypeIcon 36] Fiche comptable mars.pdf                 [badge statut]  [x]
                  2,4 Mo, 6 pages                          Enregistrement 64 %
                  [===== barre d'import (petrol) =====------------]
                  Import ──●── Lecture OCR  ──○── Indexé
```
- Mini-étapes : Import, Lecture OCR, Indexé (vraie séquence, d'où les étapes). Étape en
  cours en `--text`, faites en `--teal` avec `Check`, à venir en `--text-subtle`.
- Barre d'import `--petrol`, barre OCR `--accent` : on voit au premier coup d'œil quelle
  phase tourne. Largeur animée en `transition: width 200ms linear`.
- Pendant l'OCR, l'icône est remplacée par la **miniature de la page en cours** (40×52)
  traversée par une ligne de balayage : 2 px `--accent` avec un halo dégradé de 12 px
  au-dessus, qui descend en boucle (1,6 s, `ease-in-out`). Sous la barre :
  « Lecture de la page 3 sur 12 ». C'est le seul mouvement en boucle de l'application.
- Succès : le cercle `--teal` dessine sa coche (stroke-dashoffset, 300 ms), la ligne se
  calme, texte « Indexé, confiance 91 % ». Confiance < 60 % : badge `--amber`
  « Lecture peu fiable » + aide « Un nouveau scan à 300 dpi améliore la recherche. »
- Doublon : badge `--amber` « Déjà archivé » + lien « Ouvrir le document existant ».
- Erreur : texte `--danger` sous le nom expliquant la cause + « Réessayer ».
- Arrivée d'une ligne : fondu + glissement de 8 px (200 ms), seulement pour les lignes
  ajoutées par l'utilisateur.

### Panneau « Imports »
Fixé en bas à droite (380 px), au-dessus de toute page, réductible en une pastille
« 3 imports en cours, 42 % » ; survit à la navigation ; se ferme de lui-même 5 s après
la fin si aucune erreur.

### Récapitulatif d'un import en masse
Carte avec 4 chiffres (Sélectionnés, Ajoutés, Doublons ignorés, Erreurs), chacun 22/700
tabular avec libellé 12 `--text-muted`, puis « Voir les documents ajoutés ».

## 10. Mouvement

- Durées : 120 ms (survol, appui), 200 ms (popover, sheet, segmented), 300 ms (coche de
  succès). Courbe `cubic-bezier(0.2, 0, 0, 1)`.
- Un seul moment orchestré au chargement : sur le tableau de bord, les sparklines et la
  courbe principale se dessinent une fois (animation recharts 700 ms). Les cartes, elles,
  n'ont pas d'animation d'entrée.
- `prefers-reduced-motion` : pas de balayage (remplacé par un contour `--accent` fixe sur
  la miniature), pas de dessin de courbe, pas de miroitement.

## 11. Mode sombre
Petit provider maison : classe `dark` sur `<html>`, préférence dans le localStorage,
script inline dans `index.html` pour éviter le flash au chargement ; défaut = système. Tous les tokens ont leur valeur sombre ;
vérifier les graphiques (couleurs de séries sombres) et les illustrations SVG
(`currentColor`).

## 12. Accessibilité et qualité
Contraste AA ; focus visible partout (anneau 2 px `--accent`, décalage 2 px) ;
`aria-label` sur chaque bouton icône ; tableaux et combobox navigables au clavier ;
fin d'import et fin d'OCR annoncées en `aria-live="polite"`.
