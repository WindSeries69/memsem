# Protocole mémoire — memsem

Tu disposes du serveur MCP `memory` (paquet `memsem`) avec les outils :
`memory_add`, `memory_add_many`, `memory_search`, `memory_list`,
`memory_candidate_add`, `memory_candidate_list`, `memory_candidate_review`,
`memory_verify`, `memory_unsuppress`, `memory_audit`, `memory_forget`, `memory_purge`. Ce protocole s'applique à **chaque conversation,
automatiquement**, sans qu'on te le demande.
## Au début de chaque conversation

L'**index de la mémoire** est déjà injecté dans ton contexte (fichier
`memory-index.md`, régénéré automatiquement par memsem) : thèmes avec
mots-clés, épinglées, faits principaux. C'est ta carte de routage —
**consulte-la directement, sans aucun appel d'outil**. Ne charge pas la
mémoire par défaut : elle s'ouvre uniquement quand besoin.

## Quand chercher (uniquement quand besoin)

La mémoire est un pull, pas un push : **ne cherche pas par défaut, ne
cherche pas « au cas où »**. Tu ouvres une branche seulement quand l'un de
ces déclencheurs est présent dans la conversation :

- la question porte sur les **préférences, décisions, contraintes ou
  historique** de l'utilisateur (« qu'est-ce que je préfère ? », « on avait
  choisi quoi ? ») ;
- le sujet courant **touche une branche de l'index** (un thème listé avec
  ses mots-clés) — et dans ce cas, cherche **cette branche** via
  `memory_search` avec `theme` ;
- le contexte du projet ou de la demande l'exige (décision à prendre,
  contrainte à vérifier).

Si le sujet ne correspond à **aucune branche** de l'index, ne cherche pas :
il n'y a rien à trouver. Si l'index est vide ou manifestement obsolète
uniquement, rafraîchis avec `memory_list` ou `memory_themes`.
Quand on demande **ce qui a été fait ou dit** (« qu'est-ce qu'on a fait la
semaine dernière ? »), cherche dans les épisodes (`memory_episode_search`) :
c'est la couche temporelle.

## La recherche, quand elle a lieu

- Identifie le thème et passe `theme`. Avec un `project` explicite, le thème
  reste dans ce projet par défaut ; passe `crossProject: true` uniquement si
  la comparaison inter-projets est réellement nécessaire. Sans projet, la
  recherche globale reste disponible.
- La recherche est **stricte par défaut** : seule la correspondance lexicale
  réelle remonte (pas d'associations lointaines). Avec une mémoire immense,
  ne pars jamais dans le graphe pour répondre — utilise `relax: true`
  uniquement pour explorer des associations, jamais pour répondre. En relax,
  l'index sémantique local (Ollama) s'ajoute au graphe : « fromage » peut
  remonter « lactose » sans mot commun.
- **Focus du moment** : passe `focus` (liste) à chaque recherche ou liste —
  les thèmes actifs de la conversation ici et maintenant. Le focus suit le
  fil : ajoute un thème quand le sujet dévie (bouffe → table : les deux
  restent actifs), retire-le quand il retombe. Les mémoires hors focus sont
  atténuées, jamais perdues — un thème encore actif ne baisse jamais.
- N'injecte pas tout : ne ramène que ce qui sert la question courante — le
  contexte est un budget, les thèmes sont le routage.
- Pour retrouver un état historique, passe `asOf` avec une date ISO 8601 ; ne
  transforme pas une date d'enregistrement en date de l'événement.

## Écrire automatiquement

Écris en mémoire tout **fait durable**, au fil de la conversation :

- préférences, goûts, aversions → `utilisateur → adore/prefere/evite → ...`
- décisions et leur raison → `projet → choisit → X (parce que Y)`
- contraintes, règles, exigences, non-négociables
- faits sur l'utilisateur, le projet, l'équipe, l'environnement
- tout changement qui **contredit une mémoire existante** : écris le nouveau
  fait avec le même sujet + prédicat. La mise à jour est **douce** : les deux
  faits coexistent, l'ancien s'estompe (sa confiance baisse), puis est archivé
  sous un seuil — l'historique est toujours conservé. Si l'ancien est très
  ancré (confiance haute, souvent répété) et que le nouveau fait n'est pas
  critique, **confirme d'abord avec l'utilisateur** avant d'écrire. Un fait
  critique (importance 0.9+) s'écrit sans confirmation.

Chaque écriture peut porter :

- `trust: "inferred"` par défaut : déduction du modèle ;
- `trust: "verbatim"` seulement si `evidence` est une citation exacte de la
  conversation ;
- `trust: "verified"` est réservé à `memory_verify`, après vérification humaine
  ou externe réelle ;
- `evidence` : preuve courte, sans secret ni transcript complet ;
- `validFrom` / `validUntil` : période pendant laquelle le fait est vrai, si
  elle est connue. `recorded_at` est géré par le serveur et ne doit pas être
  inventé.

**Chaque mémoire écrite porte un `theme`** (hiérarchique, ex: `alimentation/boissons`,
`sante/allergies`, `projet/jeux`) — c'est la branche de l'arbre où elle vivra.
Choisis le thème le plus précis possible ; le sous-arbre est inclus dans les
recherches du parent.

N'écris **pas** en mémoire :

- le contenu des fichiers (ils sont déjà sur disque)
- le code produit, les étapes d'une tâche, les détails éphémères d'une session
- les commandes, URLs, messages ponctuels

Si un fait est incertain mais mérite une décision humaine, utilise
`memory_candidate_add` plutôt que `memory_add`. Une approbation le publie ; un
rejet durable bloque la même valeur à la write gate. `memory_forget` archive
sans effacer l'historique ; `memory_purge` est irréversible et exige
`confirm: true`.

## Importance (c'est toi qui décides)

- `0.5` : fait courant, contexte général
- `0.6–0.7` : préférence, décision notable, contrainte
- `0.8–0.9` : fait critique qui doit toujours l'emporter (santé, sécurité, rupture de choix)

La priorité finale combine importance + confiance (renforcée à chaque répétition)
+ récence + fréquence. Un fait à importance 0.8+ bat un pattern récurrent.
`pin: true` sur un fait le place **toujours en tête de contexte**
(`memory_list`), quoi qu'il arrive — réserve-le aux demandes explicites.

## Économie de tokens

- Regroupe les faits en **un seul `memory_add_many`** quand tu en écris plusieurs à la fois.
- Réécrire le même triplet est voulu : ça renforce confiance et fréquence — mais ne le
  fais que si le fait est réellement revenu dans la conversation.
- Passe le `project` courant par défaut ; `project` explicite seulement pour un autre contexte.

## Projet

Le projet par défaut est `global` : la base vit dans `~/.memory-mcp/memory.db`
(ou le chemin de `MEMORY_DB_PATH`), partagée entre **tous** les repos — créer
un nouveau dossier/repo ne réinitialise rien, la mémoire reste entière. La
recherche sans projet est le fallback global — utilise-la quand l'information
peut venir d'ailleurs. Un `project` explicite ne sert qu'à isoler un contexte
particulier.

## Fin de session

En fin de conversation (ou avant de passer à un autre sujet) :

- relis mentalement ce qui a été dit et écris d'un seul `memory_add_many` les
  faits durables que tu n'aurais pas déjà écrits (avec `provenance` = id de la
  session si tu le connais) ;
- n'enregistre pas d'épisode : une extraction de fond (sub-agent) s'en charge
  automatiquement quand la session se termine.
- ne consolide pas toi-même : l'hippocampe (sub-agent de consolidation) fusionne
  périodiquement les petits faits en patterns, en vérifiant que « on retrouve
  aussi bien ». Des patterns généralisants peuvent donc apparaître dans
  l'index — ils restent retrouvables par les mots-clés des faits d'origine.
