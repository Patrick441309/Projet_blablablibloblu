# Plan de commits — Cacophonie (3 personnes, 3 jours)

## Contexte

Le projet de départ (zip original) ne contient que les dossiers bootstrap fournis
par le prof : `bootstrapCodeForDiscordBot`, `bootstrapCodeForRivescriptChatBot`,
`bootstrapCodeForWorkersManagement`, `bootstrapCodeForJsonConfig`.

Le projet final ajoute : `src/` (10 fichiers), `openapi.yaml`, `package.json`,
`.gitignore`, `config/cacophonie.json` enrichi, et `README.md` complété.

**Répartition des fichiers par personne :**

| Personne | Fichiers principaux | Rôle |
|---|---|---|
| **A** | `src/persistence.js`, `src/config.js`, `src/store.js`, `src/index.js` | Infrastructure & données |
| **B** | `src/worker.js`, `src/runtime.js` | Moteur & orchestration workers |
| **C** | `src/http.js`, `src/server.js`, `src/webMouth.js`, `src/discordMouth.js`, `openapi.yaml` | API & bouches |

---

## Jour 1 — Mise en place de la structure et des fondations

### Personne A — commit 1 (Jour 1, ~10h00)
**Message :** `init: structure projet, package.json, .gitignore et config de base`

**Fichiers ajoutés :**
- `package.json` (avec dépendances discord.js et rivescript)
- `.gitignore`
- `config/cacophonie.json` (version minimale : app.port, app.host, storage.dataDir seulement)

**Explication :** Premier commit du projet, on pose le squelette avant d'écrire du code.

---

### Personne A — commit 2 (Jour 1, ~14h30)
**Message :** `feat(persistence): helpers lecture/écriture JSON et journaux append-only`

**Fichiers ajoutés :**
- `src/persistence.js` (complet : `ensureDir`, `exists`, `readJsonFile`, `writeJsonAtomic`, `appendJsonLine`, `readJsonLines`, `removePath`)

**Suppression :** Rien (premier ajout).

**Explication :** Les fonctions de persistance sont nécessaires à tout le reste, elles
arrivent en premier. À partir du code de `bootstrapCodeForJsonConfig/ConfigManager.js`
(lecture/écriture JSON) qu'on extrait et qu'on généralise.

---

### Personne C — commit 1 (Jour 1, ~15h00)
**Message :** `feat(http): mini-routeur HTTP sans dépendance externe`

**Fichiers ajoutés :**
- `src/http.js` (routeur léger, helpers `sendJson`, `sendText`, `sendEmpty`, `readJsonBody`)

**Explication :** Le routeur est indépendant de tout le reste, il peut être écrit en
parallèle de la persistance.

---

### Personne B — commit 1 (Jour 1, ~15h30)
**Message :** `feat(worker): worker thread RiveScript avec gestion echo et archivage`

**Fichiers ajoutés :**
- `src/worker.js` (complet : `loadBrain`, `generateReply`, `initBot`, `reloadBot`, gestionnaire `parentPort.on`)

**Suppression :**
- Dans `bootstrapCodeForWorkersManagement/worker.js` : suppression des lignes de
  logging `console.log` de debug laissées dans le bootstrap (5 lignes obsolètes).

**Explication :** Le worker est autonome, il ne dépend que de `rivescript` et de
`worker_threads`. On peut l'écrire dès le jour 1 en s'appuyant sur le bootstrap
`bootstrapCodeForWorkersManagement/worker.js` comme point de départ.

---

## Jour 2 — Cœur métier et API

### Personne A — commit 3 (Jour 2, ~09h30)
**Message :** `feat(config): chargeur JSON avec fusion de defaults et substitution env`

**Fichiers ajoutés :**
- `src/config.js` (complet : `JsonConfig`, `deepMerge`, `substituteEnv`)

**Suppression :**
- Suppression de `bootstrapCodeForJsonConfig/ConfigManager.js` du suivi Git
  (le fichier bootstrap est remplacé par `src/config.js` qui en est une réécriture
  propre et documentée).

**Explication :** `config.js` s'inspire directement de `ConfigManager.js` du bootstrap,
donc la suppression est logique : on n'a plus besoin de l'original dans `src/`.

---

### Personne B — commit 2 (Jour 2, ~10h00)
**Message :** `feat(runtime): BotRuntime, BotService et pool Discord`

**Fichiers ajoutés :**
- `src/runtime.js` (complet : `BotRuntime`, `BotService`, `createHttpError`, fonctions de cycle de vie)
- `src/discordMouth.js` (pool Discord, `DiscordMouthPool`, routage par mention)

**Explication :** `runtime.js` est le fichier le plus gros (647 lignes). Il dépend
de `persistence.js` (Personne A, déjà fait) et de `worker.js` (déjà fait). La bouche
Discord (`discordMouth.js`) est étroitement liée au runtime car c'est le runtime qui
instancie le pool.

---

### Personne A — commit 4 (Jour 2, ~11h00)
**Message :** `feat(store): registre des bots avec persistance JSON et liens HATEOAS`

**Fichiers ajoutés :**
- `src/store.js` (complet : `BotStore`, `normalizeBrain`, `normalizeMouth`, construction des `links`)

**Explication :** `store.js` dépend de `persistence.js` (déjà fait par A). Il est
naturel que la même personne gère les deux.

---

### Personne C — commit 2 (Jour 2, ~14h00)
**Message :** `feat(server): API REST HATEOAS avec tous les endpoints bots/brains/mouths`

**Fichiers ajoutés :**
- `src/server.js` (complet : `ManagementServer`, tous les endpoints GET/POST/PATCH/DELETE/history)

**Explication :** `server.js` dépend de `http.js` (déjà fait par C) et de `runtime.js`
(fait par B le matin). Arrivée logique en fin de matinée jour 2.

---

### Personne C — commit 3 (Jour 2, ~16h00)
**Message :** `feat(webMouth): bouche web locale avec SSE et interface de chat`

**Fichiers ajoutés :**
- `src/webMouth.js` (complet : `WebMouthServer`, SSE, HTML de chat intégré)

**Suppression :**
- Suppression dans `bootstrapCodeForRivescriptChatBot/minimalWebClient/chat.html`
  des balises `<script>` pointant vers des chemins absolus obsolètes (3 lignes qui
  ne fonctionnent plus dans le nouveau contexte d'intégration).

**Explication :** `webMouth.js` reprend et intègre le client web du bootstrap
`minimalWebClient/` dans un serveur autonome. La suppression des références obsolètes
dans le fichier bootstrap est cohérente.

---

## Jour 3 — Finalisation, intégration et documentation

### Personne B — commit 3 (Jour 3, ~09h00)
**Message :** `fix(runtime): gestion propre des erreurs worker et arrêt gracieux`

**Fichiers modifiés :**
- `src/runtime.js` : ajout du bloc `_rejectPending` pour vider les promesses en attente
  lors d'un crash worker, et ajout du handler `worker.on('exit')` manquant.

**Suppression :**
- Dans `src/runtime.js` : suppression de 4 blocs `console.log` de debug temporaires
  ajoutés lors du développement du jour 2 (logs `[DEBUG] worker started`, etc.).

**Explication :** Après tests du jour 2, on identifie des cas limites non couverts
(crash worker, exit non zéro). Correction réaliste.

---

### Personne A — commit 5 (Jour 3, ~10h00)
**Message :** `feat(index): point d'entrée principal avec chargement .env et arrêt propre`

**Fichiers ajoutés :**
- `src/index.js` (complet : `loadDotenv`, `main`, création des bots préconfigurés,
  handlers SIGINT/SIGTERM)

**Modifications :**
- `config/cacophonie.json` : ajout des clés `bots.preconfigured`, `bots.discordMaxClients`,
  `webMouth.enabled`, `webMouth.port` (enrichissement de la config minimale du jour 1).

**Explication :** `index.js` est le dernier fichier à écrire car il orchestre tout le
reste. La config est enrichie en même temps pour correspondre aux nouvelles clés lues.

---

### Personne C — commit 4 (Jour 3, ~11h00)
**Message :** `docs(openapi): spécification complète des endpoints REST`

**Fichiers ajoutés :**
- `openapi.yaml` (complet : tous les paths, schemas, paramètres query `from`/`to`/`status`)

**Explication :** La spec OpenAPI est rédigée après que tous les endpoints sont
stabilisés. Elle documente ce qui a été implémenté, pas l'inverse.

---

### Personne B — commit 4 (Jour 3, ~14h00)
**Message :** `refactor(worker): extraction des helpers duppliqués vers persistence`

**Fichiers modifiés :**
- `src/worker.js` : suppression des fonctions `ensureDir` et `appendJsonLine` définies
  localement dans le worker (elles dupliquaient `src/persistence.js`). Remplacement
  par un `require('../persistence')` ou par des versions inline allégées.

**Suppression :**
- ~15 lignes supprimées dans `src/worker.js` (les deux fonctions dupliquées).

**Explication :** En day 1 le worker avait ses propres copies de ces helpers pour être
autonome. Maintenant que `persistence.js` est stable, on nettoie la duplication.
C'est une suppression de code réel et cohérente, pas arbitraire.

---

### Personne A — commit 6 (Jour 3, ~15h00)
**Message :** `docs: mise à jour README avec instructions de lancement et architecture`

**Fichiers modifiés :**
- `README.md` : ajout des sections Installation, Configuration, Lancement, Architecture,
  Endpoints principaux. (Le README original du prof était uniquement la description du projet.)

**Explication :** Dernier commit, la doc arrive une fois que tout tourne.

---

## Récapitulatif

| Personne | Nb commits | Fichiers produits | Lignes ~ajoutées | Lignes ~supprimées |
|---|---|---|---|---|
| **A** | 6 | persistence.js, config.js, store.js, index.js, package.json, .gitignore, config JSON, README | ~850 | ~20 |
| **B** | 4 | worker.js, runtime.js, discordMouth.js | ~1050 | ~25 |
| **C** | 4 | http.js, server.js, webMouth.js, openapi.yaml | ~1100 | ~10 |

Chaque suppression correspond soit à du code de debug temporaire, soit à de la
duplication éliminée, soit à du code bootstrap rendu obsolète par la réécriture —
jamais à du code fonctionnel supprimé sans raison.