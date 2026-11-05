# Agent Hub

Un **méta-annuaire** des extensions pour agents IA de code (Claude Code, Codex, Cursor…) : **Skills**, **Hooks** et **Mods**, agrégés depuis GitHub, skills.sh, les marketplaces de plugins et les listes « awesome ». Site 100 % statique, mis à jour automatiquement toutes les 12 h, avec une seule barre de recherche (floue, pondérée, côté client).

```
agent-hub/
├── crawler/            # pipeline Python (python -m crawler) + tests pytest
│   ├── sources.yaml    # ← toute la configuration : sources, seuils, règles de détection
│   ├── adapters/       # un fichier par source
│   └── tests/          # fixtures locales, aucun appel réseau
├── data/               # items.json, meta.json (générés) · sample-items.json (démo, versionné)
├── web/                # Vite + React 18 + TS + Tailwind + framer-motion
├── scripts/gen_sample.py   # régénère data/sample-items.json
├── .github/workflows/update-and-deploy.yml
└── .env.example
```

## Démarrage rapide (données de démo, sans crawler)

```bash
cd web
npm install
npm run dev          # http://localhost:5173 — 59 entrées de démonstration (fictives)
```

Bascule démo ↔ données réelles (flag `DATA_SOURCE`) :

| Commande | Données |
|---|---|
| `npm run dev` / `npm run build` | `data/sample-items.json` (démo, **par défaut**) |
| `npm run dev:real` / `npm run build:real` | `data/items.json` produit par le crawler (repli sur la démo, avec avertissement, s'il n'existe pas) |

Les dépôts/auteurs de la démo sont **inventés** : étoiles et licences n'y reflètent aucun vrai projet. Un bandeau « Données de démonstration » le rappelle dans l'UI.

## Crawler

Python ≥ 3.12.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env     # puis export des variables (ou `export GITHUB_TOKEN=…`)

python -m crawler --limit 200            # analyse ≤ 200 dépôts
python -m crawler --limit 200 --no-summaries
pytest                                   # 67 tests, 0 appel réseau
```

Sorties : `data/items.json` (complet), `data/meta.json` (date + compteurs), `web/public/index/` (shards de recherche + `manifest.json`).

**Options** : `--limit N` (nombre max de **dépôts** analysés, pas d'éléments), `--config`, `--data-dir`, `--index-dir`, `--cache-dir`, `--no-summaries`, `-v`.

| Variable | Rôle |
|---|---|
| `GITHUB_TOKEN` | Recommandé. Sans lui : 60 req/h et **recherche de code désactivée** (token obligatoire côté API). |
| `ANTHROPIC_API_KEY` | Optionnel. Résumés FR + EN via Haiku. **Sans clé, le pipeline fonctionne** : repli sur la `description` du frontmatter, sinon la première phrase utile du README. |
| `SUMMARY_MODEL` | Modèle des résumés (défaut `claude-haiku-5-5`). |
| `MAX_SUMMARIES_PER_RUN` | Garde-fou de budget (défaut 300). |

### Comment ça marche

1. **Découverte** — les adapters (`crawler/adapters/`) renvoient des dépôts candidats. Interface commune ; **une source en panne est loggée puis ignorée**.
   `github_topics` (topics + dépôts de départ) · `marketplaces` (`marketplace.json` → plugins) · `awesome_lists` (liens dans les README) · `skills_sh` (optionnel, défensif) · `github_code_search` (`filename:SKILL.md`, throttlé ~6,5 s/requête).
2. **Filtre qualité** — étoiles min, non archivé, non fork, activité récente (tout est dans `sources.yaml`).
3. **Analyse incrémentale** — arbre git du dépôt → détection → lecture des seuls fichiers utiles (via `raw.githubusercontent.com`, hors quota API). Requêtes API en **ETag** (304 gratuits) ; un dépôt dont le `pushed_at` n'a pas changé est servi depuis `.cache/` sans re-parcours. Rate limit : attente via `Retry-After` / `x-ratelimit-reset`, **backoff exponentiel** sur les 5xx, abandon propre si l'attente dépasse 90 s.
4. **Normalisation** vers le schéma `Item`, puis **dédoublonnage en deux passes** (on garde toujours l'original non-fork, puis le plus étoilé) :
   - *exact* : même type et même `contentHash` (empreinte du **contenu** du fichier principal, indépendante du nom de dossier) ;
   - *quasi-doublons* : même type, même nom normalisé (`PDF-Skill` ≈ `pdf`) **et** résumés proches (Jaccard ≥ 0,6), ou résumés identiques. Deux outils homonymes de buts différents sont conservés.
5. **Résumés** — seulement si le `contentHash` a changé, par lots de 10, cache dans `.cache/summaries.json`, plafonnés par `MAX_SUMMARIES_PER_RUN`.
6. **Sorties** — et protection : si un crawl ne ramène **rien** (réseau coupé…), le `items.json` existant est conservé (code retour 1).

Résumés de repli : sans clé API, `summary` et `summary_en` contiennent le même texte (langue d'origine). Seul Claude produit la version française.

### Détection du type

| Type | Règle |
|---|---|
| **Skill** | un fichier `SKILL.md` (le dossier parent est l'élément) |
| **Hook** | `hooks/hooks.json` ou `hooks.json` ; à défaut, un dossier `hooks/` contenant des scripts (`.sh`, `.py`, `.js`, `.ts`) |
| **Mod** | **uniquement** si une règle de `detection.mods` (dans `sources.yaml`) correspond |

Les dossiers `node_modules`, `vendor`, `dist`, `build`, `test(s)`, `fixtures` sont ignorés.

### Définir les mods

Il n'existe **pas de format standard** pour les mods. Chaque règle est donc une heuristique modifiable :

```yaml
detection:
  mods:
    - { id: slash-command, glob: "**/commands/*.md",       scope: dir,  tags: [slash-command] }
    - { id: statusline,    glob: "**/statusline*.{sh,py,js,ts,json}", scope: file, tags: [statusline] }
    - { id: theme,         glob: "**/themes/*.json",       scope: file, tags: [theme] }
```

- `glob` : `**/` = zéro ou plusieurs dossiers, `*` = hors `/`, `{a,b}` = alternatives.
- `scope: file` → un mod par fichier ; `scope: dir` → **un mod par dossier parent** (ex. toutes les commandes d'un plugin forment un seul mod).
- `tags` : étiquettes affichées/filtrables.

Règles par défaut : slash commands, sous-agents, output styles, status lines, thèmes, keybindings, `.mcp.json`, `.claude-plugin/plugin.json`. Pour couvrir un nouveau format, ajoutez une ligne — aucun code à toucher. Les tests (`test_detect.py`) montrent comment valider une règle sur une liste de chemins.

### Scan de sécurité (heuristique !)

`crawler/security.py` cherche : `curl|wget … | sh`, `eval`, `rm -rf`, lecture de `~/.ssh` / `.env` / jetons, envoi de fichiers par `curl`, base64 suspect, `chmod 777`, `sudo`. Résultat : `risk.level` (`low` / `medium` / `high` / `n/a`) et `risk.flags`.

- Hooks : `hooks.json` + scripts voisins (≤ 5) analysés.
- Skills et mods en Markdown (prose) : seules les alertes **graves** comptent, plafonnées à `medium` (sinon, trop de faux positifs).
- ⚠️ **Ce n'est pas un audit.** Du code obfusqué, des dépendances compromises ou des scripts appelés indirectement passent entre les mailles ; une liste de commandes *interdites* peut déclencher une alerte. L'UI le répète (infobulle, filtre, panneau de détail, page « À propos »).

### Ajouter une source

Dans `crawler/sources.yaml` :

```yaml
seed_repos:   [owner/repo]                     # dépôt analysé à coup sûr
marketplaces: [owner/repo]                     # contient .claude-plugin/marketplace.json
awesome_lists:
  - { repo: owner/awesome-list, path: README.md }
github:
  topics: [mon-topic]
```

Une source d'un **autre type** (nouvelle API, annuaire…) = un fichier dans `crawler/adapters/` qui hérite de `Adapter`, implémente `discover() -> list[Candidate]`, puis ajout dans `adapters/__init__.py::ALL_ADAPTERS`.

## Frontend

Vite + React 18 + TypeScript + Tailwind (3.4) + framer-motion + lucide-react. Pas de lib de composants.

- **Recherche** : MiniSearch dans un **Web Worker** (flou, préfixes, accents ignorés, pondération `nom 6 > tags 3 > résumé 1`, surlignage). Les shards (`items-<type>-<n>.json`, 2000 entrées max) sont chargés progressivement, **type de l'onglet actif d'abord** ; la liste est virtualisée (`@tanstack/react-virtual`).
- **URL synchronisée** : `?type=hook&q=…&agent=…&tag=…&lic=…&risk=…&act=90&stars=100&sort=stars&item=<id>`.
- **⌘K / Ctrl+K** : palette de commandes ; `/` focalise la recherche.
- **Thèmes** clair/sombre (système par défaut), tokens centralisés (variables CSS + `tailwind.config.ts`), `prefers-reduced-motion` respecté.
- Lighthouse mobile (build de démo) : Performance 98 · Accessibilité 100 · Bonnes pratiques 100 · SEO 100. Testé avec 20 000 entrées synthétiques : premiers résultats en ~0,4 s, index complet en ~2 s, recherche floue ~130 ms, ~18 cartes dans le DOM.
- Accessibilité : focus visibles, onglets ARIA + flèches, dialogs avec piège de focus et `Esc`, lien d'évitement.
- Extension du schéma : champ optionnel `hookCommands` (commandes shell d'un hook) affiché dans le panneau de détail.

## Déploiement

`.github/workflows/update-and-deploy.yml` (commenté) : cron **toutes les 12 h** + déclenchement manuel (+ push sur `main`) → tests → crawl → build avec `DATA_SOURCE=real` → GitHub Pages.

1. *Settings → Pages → Source : GitHub Actions*.
2. (optionnel) secrets `ANTHROPIC_API_KEY` et `CRAWLER_GITHUB_TOKEN`. Sans eux : `GITHUB_TOKEN` automatique et résumés de repli.

Le site utilise `base: "./"` et des URLs de requête : il se déploie tel quel sur un sous-chemin GitHub Pages, ou sur Cloudflare Pages (`npm run build:real`, dossier `web/dist`). Le lien « code » du header pointe vers `REPO_URL` dans `web/src/App.tsx` : à adapter.

## Décisions prises (cas ambigus)

- `--limit` borne les **dépôts** analysés (c'est ce qui coûte des appels API), pas les éléments.
- Forks ignorés par défaut ; le dédoublonnage par `contentHash` gère aussi les copies non marquées.
- Client HTTP **synchrone** : plus simple et plus sûr vis-à-vis des rate limits ; un crawl de 600 dépôts reste dans l'heure.
- Shards **par type** (tri par étoiles) ; l'index MiniSearch est construit dans le worker à partir des shards plutôt que livré pré-calculé (plus léger à publier, ~1 s pour 20 000 entrées).
- Langue de l'UI : français ; bouton FR/EN pour les résumés.
- Licences : on n'affiche que métadonnées, résumé court et lien. Aucun contenu complet copié.

## Limites connues

- **Mods** : détection par heuristiques de chemins, donc approximative (faux positifs : un dossier `commands/` non destiné à un agent ; faux négatifs : tout format non décrit). Le nom d'un mod « dossier » est dérivé du dossier (`<plugin>-commands`).
- Le scan de sécurité est heuristique (voir plus haut).
- `skills.sh` : aucune API publique documentée → l'adapter tente quelques endpoints puis la page HTML ; il peut ne rien renvoyer.
- Recherche de code GitHub : 1000 résultats max/requête, ~10 req/min, token obligatoire.
- Agents compatibles : déduits (Claude Code par défaut + agents cités dans topics/description/README), pas vérifiés.
- Les `firstSeen` (« Nouveautés ») reposent sur `.cache/` (cache Actions) et, à défaut, sur le dernier `data/items.json` ; si les deux disparaissent, tout redevient « nouveau ».
- Les 59 entrées de démo sont fictives.
- Le crawl complet n'a pas pu être validé de bout en bout contre l'API GitHub dans l'environnement de développement (accès par dépôt bloqué) : voir le récap de livraison.

## Prochaines étapes

Recherche sémantique (embeddings), soumission de sources par les utilisateurs (formulaire → PR), serveur MCP « find-skills » pour interroger l'index depuis Claude, détection d'agents compatibles plus fine, vérification des commandes d'install.
