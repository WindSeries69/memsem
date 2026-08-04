# memsem — Conception

Document de conception : la vision complète, réfléchie **avant** le MVP, pour
ne rien perdre. Le MVP est la ligne « État actuel » en fin de document.

*memsem = mémoire **sem**antique (+ épisodique) — les deux systèmes de mémoire
long-terme du cerveau, consolidés en arrière-plan.*

## 1. Vision

Un plugin de mémoire persistante **universel** : branchement sur toute IA
(opencode, Claude Code, et tout client MCP). La mémoire couvre absolument tout
ce que l'utilisateur fait, mais n'encombre jamais le contexte : seule une
partie pertinente y entre, à chaque demande.

Ce qui a déjà été essayé ailleurs (RAG naïf, Mem0, MemGPT/Letta) échoue sur
trois points : la mémoire est persistante mais **brute** (bruit, pas de
structure), l'IA ne sait **pas où chercher** (pas de hiérarchie), et elle ne
sait pas **se corriger** (un vieux fait contredit reste prioritaire).

## 2. Principes fondamentaux

### 2.1 Mémoires atomiques

Chaque mémoire est un **petit fait**, pas un grand bloc :

```
utilisateur → boit → lait        {fréquence: élevée, confiance: haute}
utilisateur → tolère → lactose   {non, depuis 2026-08, importance: 0.9}
```

Quelque chose est lié à une mémoire existante → on la met à jour (renforcement),
pas de doublons.

### 2.2 Priorité dynamique

Chaque mémoire a un **ordre**, une priorité qui n'est pas figée. La priorité
finale combine plusieurs signaux :

- **importance intrinsèque** (déclarée par l'utilisateur ou choisie par l'IA)
- **confiance** (monte à chaque confirmation, renforcée par répétition)
- **récence** (décroissance exponentielle)
- **fréquence** (un pattern répété 6 mois monte en confiance)
- **pertinence à la demande** (similarité avec la requête / le contexte)

L'ordre doit pouvoir **changer selon le projet ou la demande** : ce qui compte
pour un repo n'est pas ce qui compte pour l'autre.

### 2.3 Supersession (le cas lactose)

Exemple canonique : pendant des mois l'utilisateur boit du lait, toujours
présent dans ses recettes. Au bout de la septième année, il devient intolérant
au lactose.

- La mémoire « boit du lait » est **renforcée** depuis des mois (haute
  confiance, fréquence élevée).
- Le nouveau fait « intolérant au lactose » doit **l'emporter**, même s'il
  n'apparaît qu'une fois.
- Règle : **fréquence ≠ importance**. Un fait ponctuel à importance élevée bat
  un pattern récurrent.
- Mécanisme de **supersession douce** : à une contradiction, le nouveau fait
  coexiste avec l'ancien qui **s'estompe** (confiance ×0.6, ×0.9 si le fait
  est critique) ; sous le seuil 0.25, il est **archivé avec date et raison**
  (traçabilité, retour arrière possible). Un fait critique (0.8+) ne
  s'estompe presque pas et **n'est jamais archivé** ; un fait épinglé
  (`pinned`) est **intouchable** : aucune contradiction ne le fait bouger.
- **Tombstone (valeur rejetée)** : la ré-affirmation d'une valeur qui a déjà
  perdu une contradiction ne réinstaure pas le fait d'un coup — elle revient
  avec une confiance basse (`resurrectConfidence` 0.3), **sans faire
  s'estomper sa correction**, et le retour est tracé dans l'audit
  (`reason: resurrection`). La correction ne peut être inversée que par une
  répétition soutenue de l'utilisateur — jamais par un accident de
  formulation. Les archivages par supersession sont également audités.
- Le lactose doit remonter quand on parle de lait, mais aussi de **fromage, de
  menu, de recette** : par les liens du graphe et l'index sémantique.

### 2.4 Des index, pas des tokens

La recherche ne vise pas les tokens. Plusieurs index, comme un cerveau :

1. **Index lexical** (mots-clés) — routage rapide et gratuit.
2. **Index vectoriel** (sémantique) — les concepts proches sans mots communs.
3. **Index de graphe** — les mémoires sont des nœuds reliés entre eux,
   hiérarchisés par thème (un énorme arbre, des liaisons de cerveau).
   Activation en cascade (*spreading activation*) : une mémoire activée active
   ses voisines.
4. **Index temporel** — quand les choses se sont passées.

**Routage d'abord, ranking ensuite** : le filtrage projet/thème par mots-clés
coûte presque rien ; la recherche sémantique coûteuse ne tourne que dans le
sous-ensemble retenu.

### 2.5 Hiérarchie des index

Mémoire **globale** (tout) → **index principal par projet** → les seuls
fichiers/mémoires nécessaires. L'IA entre dans un projet, utilise son index,
n'a accès qu'à ce qu'il lui faut — mais si elle veut d'un coup autre chose,
**elle l'a** : fallback global avec budget (ex. max X résultats globaux par
requête).

### 2.6 Stockage économique

Économiser au maximum : l'IA n'a pas besoin de lire la mémoire, seulement de la
**comprendre**. Format triplet compressé type « caveman » — la langue la plus
économique et performante (sujet → prédicat → objet + tags + métadonnées). En
plus, une phrase courte « canonique » par mémoire pour l'index sémantique :
deux encodages, un seul fait.

## 3. Qui décide de la priorité

La priorité est choisie par **l'IA**, via un **sub-agent** pour économiser :

- Le sub-agent compare en **paires** (« cette mémoire vaut-elle plus que celle-
  là ? ») plutôt qu'en score absolu — les jugements par paires sont plus
  stables (façon Elo).
- 90 % du scoring est fait par des **règles pures** (décroissance temporelle,
  compteurs de fréquence, détection de contradiction) : zéro coût.
- Le petit modèle local (Ollama) ne juge que les **cas ambigus** — boost
  optionnel, jamais une dépendance à installer pour l'utilisateur.

## 4. Consolidation

Les petites mémoires atomiques sont bonnes pour la recherche ; l'humain, lui,
consolide en dormant. Processus de fond automatique :

- Fusionner les petits faits en **patterns de plus haut niveau**.
- **Règle de sûreté** : on ne fusionne que si « on retrouve aussi bien » — on
  rejoue les requêtes qui ciblaient les petites mémoires ; si le pattern les
  retrouve, la fusion est bonne, sinon elle est refusée.
- Les originaux restent **archivés** : rien n'est perdu.
- Tout en arrière-plan, **hors du fil de conversation** — l'utilisateur ne
  voit pas la différence en tokens.

## 5. Source d'apprentissage

Principalement la **conversation** : ce qui est dans les fichiers est « en
dur » (et vient de toute façon de conversations). Le plugin capture la
**cause**, pas le produit : les décisions, contraintes, raisons (« on a choisi
X parce que Y ») qui n'existent que dans la conversation et meurent avec la
session.

## 6. Économie de tokens (principe directeur)

Tout le travail lourd — indexation, scoring, consolidation, embeddings — est
**hors du fil de conversation**, asynchrone. Le fil principal ne paie que la
recherche ciblée. Écriture groupée (`memory_add_many`) quand plusieurs faits
émergent.

## 7. Plateformes

Première cible : **clients CLI** — opencode et Claude Code — via **MCP**, le
protocole standard devenu universel. Un seul serveur MCP, branché partout.
Stockage **local** pour l'instant (SQLite), sync multi-appareils plus tard.

## 8. État actuel

Implémenté et testé (49 tests) :

- Serveur MCP TypeScript (`src/index.ts`), transport stdio, nom `memsem`
- SQLite local (`src/db.ts`) : `memories` (triplets + importance/confiance/
  fréquence/projet/provenance), `memory_history` (supersession), `edges`
  (graphe), `episodes` (résumés de sessions + provenance)
- Outils : `memory_add`, `memory_add_many`, `memory_search`, `memory_list`,
  `memory_themes`, `memory_stats`, `memory_index`, `memory_episode_add`,
  `memory_episode_search`, `memory_score`, `memory_forget`
- Priorité par règles : `0.45×importance + 0.25×confiance + 0.2×récence +
  0.1×fréquence` (demi-vie : 7 jours)
- Supersession fonctionnelle : objet changé → estompage puis archivage +
  boost de confiance
- Graphe : arêtes sur sujet partagé ou chaînes objet==sujet (lait → lactose →
  fromage), propagation **2 sauts** en mode relax (boost ×0.3 par saut)
- Projet par défaut : `global` — la base vit dans `~/.memory-mcp/memory.db`,
  partagée entre tous les repos (un nouveau dossier ne réinitialise rien) ;
  recherche globale sans projet
- **Autonomie** : `memory-protocol.md` injecté via `instructions` (opencode)
  ou `CLAUDE.md` (Claude Code) — chargement du contexte en début de session,
  écriture automatique des faits durables, choix d'importance par l'IA,
  supersession automatique
- **Setup universel** : plugin opencode `memsem` (une ligne `"plugin": ["memsem"]`
  configure serveur MCP + protocole + index + permissions + agents de fond) ;
  `npx -y memsem setup` pour opencode et Claude Code ; base par utilisateur,
  jamais commitée

## 9. Feuille de route

- [x] **Extraction de fin de session** — plugin opencode sur `session.idle` :
      sub-agent sandboxé relit la conversation (90 s après le dernier
      échange), écrit les faits manqués en `memory_add_many` et enregistre
      l'épisode (`memory_episode_add`, provenance = session). Hors du fil de
      conversation, dé-dupliqué par `~/.memsem/extracted.json`. Le protocole
      ajoute la relecture mentale en fin de session (hôte-agnostique).
- [x] **Index par thèmes (l'arbre)** — thème hiérarchique sur chaque mémoire
      (`alimentation/boissons`), recherche par sous-arbre, traversée des
      projets ; `memory_themes` = carte de routage du cerveau
- [x] **Recherche stricte** — seuil lexical 50 %, pas de propagation par
      défaut ; `relax: true` en opt-in pour l'exploration d'associations
      (jamais pour répondre)
- [x] **Consolidation de fond (l'hippocampe)** — sub-agent toutes les 6 h à
      l'idle : fusion des petits faits en patterns, vérification « on
      retrouve aussi bien » (re-recherche par mots-clés, top 5 exigé), faits
      critiques et épinglés intouchables, max 3 fusions par passe
- [x] **Index sémantique optionnel (Ollama local)** — embeddings `mxbai-embed-large`
      en arrière-plan sur chaque écriture (texte enrichi : triple + tags +
      thème), similarité cosinus (seuil 0.5) dans le mode `relax` : « fromage »
      retrouve « lactose » sans chevauchement lexical. Strict inchangé.
- [x] **Sub-agent de scoring en paires** (le juge) — toutes les 6 h à l'idle,
      comparaisons par paires via `memory_score` (+0.1 / −0.1), épinglées et
      importance ≥ 0.9 intouchables, plafond 0.85, plancher 0.4, max 5
      ajustements, zéro changement sans preuve (fréquence ≥ 3 ou contradiction)
- [x] **Consolidation de fond** : fusion en patterns, seulement si « on
      retrouve aussi bien », archives conservées
- [x] **Propagation multi-sauts** — activation en cascade (2 sauts, boost ×0.3
      par saut) ; arêtes enrichies : sujet partagé **ou** objet == sujet d'une
      autre mémoire (chaînes sémantiques : lait → lactose → fromage)
- [x] **Niveaux de priorité déclarés** — `pin: true` (toujours en tête de
      contexte) en plus de l'importance
- [x] **Inspection** — `memory_stats` : compteurs, top priorités, historique
      récent, arêtes du graphe
- [x] **Épisodes lisibles** — `memory_episode_search` : les résumés de sessions
      deviennent interrogables (« qu'est-ce qu'on a fait la semaine
      dernière ? »), seuil strict, filtre projet, liste récente sans requête
- [x] **Présence globale** — plugin opencode universel (`"plugin": ["memsem"]`),
      `memsem setup` pour opencode + Claude Code (MCP + CLAUDE.md), base par
      utilisateur partagée entre tous les repos, jamais commitée

## 11. Constantes et calibration (résultat du banc d'essai)

Toutes les constantes vivent dans `src/config.ts`, surchargeables par l'utilisateur
via `~/.memsem/config.json` (ou `$MEMSEM_CONFIG`), fusion partielle et validée.

| Constante | Défaut | Rôle |
| --- | --- | --- |
| `priority.{importance,confidence,recency,frequency}` | 0.45 / 0.25 / 0.2 / 0.1 | pondération de la priorité |
| `halfLifeHours` | 168 (7 j) | demi-vie de la récence |
| `minLexical` | 0.5 | seuil lexical de la recherche stricte |
| `relaxCosineThreshold` | 0.5 | seuil cosinus du mode relax (sémantique) |
| `relaxGraphHops` / `relaxGraphBoost` | 2 / 0.3 | propagation du graphe en relax |
| `focusAttenuation` | 0.35 | atténuation hors focus |
| `fadeFactor` / `criticalFadeFactor` / `archiveThreshold` | 0.6 / 0.9 / 0.25 | supersession douce |
| `criticalImportance` | 0.8 | seuil au-delà duquel un fait est protégé |

### Méthode

`scripts/bench.mjs` : 51 faits (thèmes alimentation, santé, projet, dev), 20 requêtes
avec résultats attendus, certains faits vieillis (1 à 30 j) pour rendre la récence
discriminante, requêtes ambiguës avec distracteurs (ex. « node » : 5 candidats
lexicaux, 2 pertinents dont un vieilli à importance 0.9). Recherche stricte, top-5,
précision/rappel moyens sur les 20 requêtes (P@k, R@k pour k=3, 5). Hors ligne,
déterministe, exécuté à chaque `npm test`.

### Résultat (2026-08)

| jeu de constantes | P@3 | R@3 | P@5 | R@5 |
| --- | --- | --- | --- | --- |
| **défaut (0.45/0.25/0.2/0.1)** | **0.958** | **0.958** | 0.320 | 0.958 |
| egalitaire (0.25×4) | 0.933 | 0.933 | 0.320 | 0.958 |
| recence-heavy (0.3/0.15/0.45/0.1) | 0.933 | 0.933 | 0.320 | 0.958 |
| confiance-heavy (0.2/0.5/0.15/0.15) | 0.933 | 0.933 | 0.320 | 0.958 |
| seuil lexical 0.4 | 0.958 | 0.958 | 0.320 | 0.958 |

### Lecture honnête

- **Le réglage par défaut n'est pas arbitraire** : sur ce jeu de référence, il bat
  les alternatives (uniforme, récence-heavy, confiance-heavy) de +0.025 en P@3/R@3.
  La requête « node » (fait important vieilli face à des distracteurs récents) est
  le cas qui tranche : seule la pondération par défaut le garde dans le top-3.
- **Résultat modeste et borné** : le jeu est conçu par l'auteur, pas un standard ;
  P@5 (0.32) est bas car chaque requête n'a que 1-3 faits pertinents sur 5 résultats —
  c'est un artefact du jeu, pas un défaut du scoring. Le seuil lexical 0.4 ne change
  rien ici : tous les matchs pertinents étaient ≥ 0.5.
- **À enrichir** : jeux de requêtes tirés de vrais usages, comparaison avec le mode
  relax (nécessite Ollama), calibration du seuil cosinus 0.5 avec des embeddings réels.

## 10. Questions ouvertes

- Seuil de déclenchement de la consolidation (nombre de faits ? temps ?)
- Confiance initiale d'une nouvelle mémoire (0.5 aujourd'hui) : à calibrer
- Interaction supersession ↔ consolidation : un pattern consolidé contredit par
  un fait critique — qui gagne ?
- Granularité du projet : répertoire courant, ou détection de la racine du
  repo (git) ?
