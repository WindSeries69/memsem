# memsem

Serveur MCP de mémoire sémantique persistante et priorisée, pour n'importe quelle IA (opencode, Claude Code, et tout client compatible MCP). *Mémoire sémantique + épisodique — les deux systèmes long-terme du cerveau, consolidés en arrière-plan.*

Voir [DESIGN.md](DESIGN.md) pour la conception complète (vision, principes, cas lactose, feuille de route).

## Concept

- **Mémoires atomiques** : chaque fait est un triplet `sujet → prédicat → objet` avec métadonnées (importance, confiance, fréquence, tags, projet, provenance).
- **Supersession douce** : à une contradiction (« je buvais du lait depuis 6 mois, je deviens intolérant »), le nouveau fait coexiste et l'ancien s'estompe progressivement (confiance en baisse) jusqu'à l'archivage sous un seuil — l'historique est toujours conservé. Les faits critiques (importance 0.9+) sont protégés : ils ne s'estompent presque pas et battent les patterns récurrents.
- **Priorité dynamique** (règles pures, zéro dépendance) : `0.45 × importance + 0.25 × confiance + 0.2 × récence + 0.1 × fréquence`. Un fait ponctuel à importance élevée bat un pattern récurrent.
- **Graphe** : les mémoires partageant un sujet ou reliées par objet==sujet (chaînes sémantiques : lait → lactose → fromage) sont reliées par des arêtes ; la recherche en mode `relax` propage l'activation en cascade (2 sauts, décroissance ×0.3).
- **Recherche stricte par défaut** : seuil lexical de 50 % des mots de la requête, pas de propagation de graphe — avec une grande mémoire, la précision prime. `relax: true` pour explorer les associations.
- **Index sémantique local (Ollama, optionnel)** : chaque mémoire est embarquée (`mxbai-embed-large`, configurable) en arrière-plan ; en mode `relax`, la similarité cosinus (seuil 0.5) fait le pont conceptuel — « fromage » retrouve « lactose » sans mot commun. Sans Ollama, le système fonctionne identiquement.
- **Thèmes** : chaque mémoire a un thème hiérarchique (`alimentation/boissons`) ; la recherche par thème traverse tous les projets — une mémoire écrite dans `global` ressort dans n'importe quel projet quand le sujet correspond.
- **Projets** : une mémoire est rattachée à un projet (`global` par défaut — la base est partagée entre tous les repos, un nouveau dossier ne réinitialise rien). La recherche peut rester dans le projet ou tomber en fallback global.

## Installation

Le paquet npm est la source unique : chaque hôte le lance sans téléchargement
manuel ni build (`npx -y memsem`). La base de données est créée au premier
lancement dans `~/.memory-mcp/memory.db` (chemin surchargeable par
`MEMORY_DB_PATH`), l'index dans `~/.memsem/` — partagés entre **tous** les
repos et projets.

## Installation — un pas par IA

### opencode (recommandé)

**Une seule ligne.** Soit dans `opencode.json` (projet ou
`~/.config/opencode/opencode.json`) :

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["memsem"]
}
```

…soit la commande auto :

```bash
npx -y memsem setup
```

Le plugin `memsem` fait **tout** automatiquement à chaque session :
enregistre le serveur MCP `memory` (`npx -y memsem`), copie
`memory-protocol.md` dans `~/.memsem/` et l'injecte dans les instructions,
injecte l'index `~/.memsem/memory-index.md`, autorise `~/.memsem/**`,
et pilote l'extraction/consolidation/scoring de fond (voir plus bas).
Redémarrer opencode. Rien d'autre à faire.

### Claude Code

```bash
npx -y memsem setup
```

…ou manuellement :

```bash
claude mcp add memory -- npx -y memsem
```

Puis copier `memory-protocol.md` dans `CLAUDE.md` (le setup le fait tout
seul ; il ajoute aussi un bloc « Mémoire persistante — memsem » qui pointe
vers `~/.memsem/memory-protocol.md`).

**Installer avec l'IA (Claude)** : colle-lui simplement :

> Installe la mémoire persistante memsem : lance `npx -y memsem setup`,
> lis `~/.memsem/memory-protocol.md` et applique le protocole.

### N'importe quel client MCP

```bash
npx -y memsem
```

Le serveur s'expose en stdio (MCP universel). Injectez
`memory-protocol.md` dans les instructions de l'hôte (`AGENTS.md` pour les
autres agents) pour rendre l'IA autonome.

## Autonomie de l'IA

Le fichier `memory-protocol.md` rend l'IA autonome. Injection selon l'hôte :
opencode → `instructions` dans `opencode.json` ; Claude Code → `CLAUDE.md` ;
autres agents lisant `AGENTS.md` → copier le fichier en `AGENTS.md`.

## Outils

| Outil | Description |
| --- | --- |
| `memory_add` | Écrit ou renforce un fait. Répéter un même fait augmente confiance et fréquence. Changer l'objet déclenche la supersession (ancien archivé). |
| `memory_add_many` | Écrit plusieurs faits en un seul appel (économie de tokens pour l'écriture automatique). |
| `memory_search` | Recherche lexicale pondérée par la priorité + propagation dans le graphe. Sans `project`, recherche globale. |
| `memory_list` | Top mémoires d'un projet triées par priorité (injection de contexte en début de session). |
| `memory_forget` | Archive une mémoire (n'apparaît plus, reste en base). |
| `memory_episode_add` | Enregistre un épisode de session (résumé + provenance) — la couche épisodique. |
| `memory_stats` | État de la mémoire : compteurs, top priorités, historique récent, arêtes du graphe. |

`memory_add` accepte aussi `pin: true` : la mémoire est épinglée et reste
toujours en tête de `memory_list` (contexte systématique).

## Extraction de fin de session (autonome)

Le plugin opencode (`memsem`, ou le fichier autonome
`opencode-plugin/memsem-extract.ts`) rend l'extraction automatique et
asynchrone :

1. Quand une session passe en idle (90 s après le dernier échange), le plugin
   fait relire la conversation par un sub-agent sandboxé (outils mémoire
   uniquement).
2. Le sub-agent écrit les faits durables manqués en `memory_add_many` et
   enregistre l'épisode (`memory_episode_add`, provenance = session).
3. Rien ne s'exécute dans le fil de la conversation : l'utilisateur ne voit
   pas la différence en tokens, et le travail ne casse jamais la session.

## Consolidation (l'hippocampe)

Toutes les 6 h (à l'idle), un sub-agent de consolidation relit les mémoires
actives et fusionne les petits faits similaires en patterns généraux — avec
deux garde-fous :

- **Sûreté** : pour archiver un petit fait, il rejoue une recherche avec ses
  mots-clés et exige que le pattern remonte dans le top 5. Sinon, le fait
  reste vivant. Les faits critiques (importance ≥ 0.8) et épinglés ne sont
  jamais touchés.
- **Frugalité** : maximum 3 consolidations par passe.

Installation : le plugin est déjà actif via `"plugin": ["memsem"]` ou
`npx -y memsem setup` — rien à copier. (Variante fichier : copier
`opencode-plugin/memsem-extract.ts` dans `.opencode/plugin/` ou
`~/.config/opencode/plugin/`, puis redémarrer opencode.) L'état des
sessions déjà extraites est gardé dans `~/.memsem/extracted.json`.

### Exemples

```
memory_add { subject: "utilisateur", predicate: "boit", object: "lait", importance: 0.5, tags: ["alimentation"] }
memory_add { subject: "utilisateur", predicate: "intolerant a", object: "lactose", importance: 0.9 }
memory_search { query: "lait", project: "mon-projet" }
memory_list { project: "mon-projet", limit: 10 }
```

## Tests

```bash
npm test
```

Couvre : création, renforcement, supersession, priorité (important > récurrent),
filtre projet, propagation par le graphe, archivage.

## Feuille de route

- [ ] Index sémantique optionnel (embeddings Ollama local) — les requêtes sans chevauchement lexical (« fromage » → lactose) deviennent trouvables
- [ ] Sub-agent de scoring en comparaison par paires (règles pures par défaut, petit LLM local en option)
- [ ] Extraction de mémoires en fin de session (résumé épisodique → triples) et table `episodes`
- [ ] Consolidation de fond : fusionner les petits faits en patterns, seulement si « on retrouve aussi bien »
- [ ] Propagation multi-sauts dans le graphe
