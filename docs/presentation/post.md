# Le post de lancement memsem

Un seul post. Pas de « Excited to announce », pas de pluie d'émojis, pas de hashtags.
Une posture : les gros systèmes existent, on a corrigé leurs défauts.

---

## Variante principale (FR) — LinkedIn / Dev.to / X long / blog

La mémoire d'IA n'est pas un problème que je viens de découvrir. mem0, Zep, MemGPT :
des systèmes sérieux existent, avec des équipes et des fonds.

Mais ils partagent tous trois défauts :

1. Ils stockent, ils ne structurent pas. La recherche est une similarité sur tout —
   l'IA ne sait pas où chercher, alors elle cherche partout. Le bruit noie le signal.
2. Ils ne sont pas précis. Un souvenir « presque juste » remplit le contexte,
   gaspille des tokens, et finit par être cru.
3. Ils ne se corrigent pas. Un fait contredit il y a six mois est resté aussi fort
   que le jour où il a été écrit.

J'ai écrit la mémoire qui corrige ces trois défauts :

• Elle sait où chercher. Chaque session commence par une carte de routage (thèmes,
  mots-clés) injectée dans le contexte. Elle route par thème, traverse tes projets,
  ne paie que ce dont elle a besoin.
• Elle est précise. Recherche stricte par défaut, pas de propagation sauvage. Et la
  précision est mesurée, pas supposée : P@3 de 0.958 sur un banc de 51 faits et
  20 requêtes — chaque jeu de constantes est comparé, le résultat est documenté.
• Elle se corrige. Une contradiction fait s'estomper l'ancien fait au lieu de
  l'écraser. L'historique reste. Les faits critiques (≥ 0.9) sont protégés. Et des
  agents de fond consolident, recalibrent — seulement si la mémoire reste aussi
  cherchable.

Le plus honnête : elle se souvient de sa propre naissance. Il y a une semaine, elle
a consigné sa première mort manquée (un binaire natif absent au premier lancement).
Aucun autre outil de mémoire ne peut montrer ça.

Toutes les promesses des gros systèmes, sans leurs défauts. Une commande, 100% local,
ta mémoire reste tienne — jamais commitée, chacun a la sienne.

memsem — mémoire sémantique pour agents IA.
npx -y memsem · opencode : "plugin": ["memsem"] · Claude : npx -y memsem setup
github.com/WindSeries69/memsem

---

## Variante courte (X / Twitter)

Les gros systèmes de mémoire d'IA existent. Leurs défauts aussi :
ils stockent sans structurer, ils ne sont pas précis, ils ne se corrigent pas.

memsem corrige les trois. 🧭 routage par thème · 🎯 recherche stricte, P@3 0.958 · 🔄 supersession douce

Une commande, 100% local. github.com/WindSeries69/memsem

---

## Variante EN (HN / Reddit / X international)

Big memory systems for AI already exist — mem0, Zep, MemGPT. Serious projects,
serious teams.

They share three flaws:

1. They store, they don't structure. Retrieval is a similarity search over
   *everything* — the AI doesn't know where to look, so it looks everywhere.
   Noise drowns the signal.
2. They aren't precise. An "almost right" memory fills the context, burns tokens,
   and eventually gets believed.
3. They don't correct themselves. A fact contradicted six months ago stands as
   strong as the day it was written.

I wrote the memory that fixes exactly these three:

• It knows where to search. Every session starts with a routing card (themes +
  keywords) injected into context. It routes by theme, crosses your projects,
  pays only for what it needs.
• It is precise. Strict lexical search by default, no wild propagation. Precision
  is measured, not assumed: P@3 of 0.958 on a benchmark of 51 facts and 20 queries —
  constant sets are compared, results are documented (DESIGN.md §11).
• It corrects itself. Contradictions fade the old fact instead of overwriting.
  History stays. Critical facts (≥ 0.9) are protected. Background agents
  consolidate and recalibrate — only when the memory stays as searchable.

The most honest proof: it remembers its own birth. A week ago it logged its first
near-death (a missing native binary at first launch). No other memory tool can
show that.

All the big-system promises, minus their flaws. One command, 100% local, your
memory stays yours — never committed, per-user.

memsem — semantic memory for AI agents.
npx -y memsem · opencode: "plugin": ["memsem"] · Claude: npx -y memsem setup
github.com/WindSeries69/memsem
