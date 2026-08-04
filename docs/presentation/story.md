# L'histoire de memsem — la mémoire qui se souvient de sa propre naissance

*Le pitch, la preuve, l'histoire. À lire avant de publier quoi que ce soit.
Tout ce qui est cité est vrai : c'est ce que la mémoire de memsem contient sur elle-même.*

---

## Le pitch en une phrase

> Ton IA naît avec une amnésie. À chaque session, elle oublie qui tu es, ce que tu as décidé,
> ce que tu ne peux plus manger. memsem lui greffe une mémoire — elle s'écrit toute seule,
> priorise, gère les contradictions, et reste 100% locale.

## Pourquoi ce projet existe — l'histoire vraie

Il y a deux jours, le serveur de mémoire que j'étais en train de construire **est mort deux fois**.

**Première mort** : le paquet utilisait `better-sqlite3`, une dépendance native. Au premier
lancement via `npx`, le binaire était absent → le serveur plantait au démarrage, les gens
n'auraient jamais pu l'installer. La mémoire l'a enregistré telle quelle :

```
projet memsem → cause-du-flop → better-sqlite3 : binaire natif absent du paquet npx,
serveur plantait au demarrage
```

**Deuxième mort** : un index unique en base contredisait la supersession douce (deux faits
contradictoires, même sujet + prédicat, devaient coexister). Résultat : serveur en crash
au démarrage, mémoire injoignable. Le genre de bug invisible jusqu'au jour où il tue tout.

Pourquoi je raconte ça ? Parce que c'est exactement le problème que memsem résout :
**les trucs qu'on oublie sont précisément ceux qui nous tuent plus tard.** Une décision
prise un lundi, un binaire incompatible, une intolérance alimentaire — si rien ne les garde,
la conversation d'après repart de zéro.

Depuis, la mémoire contient sa propre histoire :

```
projet memsem → a-plugin-opencode-universel → une ligne "plugin": ["memsem"] configure tout
projet memsem → a-auto-installateur → memsem setup configure opencode et claude
projet memsem → publie-sur-npm → memsem@1.0.1, engines node >= 22.13
utilisateur → veut → sa memoire personnelle jamais commitee ni partagee
```

**Une mémoire qui se souvient d'être née. C'est le seul démo qu'aucun autre outil de
mémoire ne peut faire.**

## La démo en 30 secondes (le lactose)

La preuve par l'exemple canonique :

1. Pendant des mois, l'utilisateur boit du lait — le fait est renforcé à chaque session.
2. Un jour : « attends, je suis intolérant au lactose. »
3. Pas d'écrasement : l'ancien fait **s'estompe** (confiance en baisse), le nouveau
   (importance 0.9) **gagne**, l'historique est conservé.
4. Des mois plus tard, dans un **nouveau repo**, on demande « qu'est-ce que je dois éviter ? »
   → la réponse remonte, sans qu'on ait rien réinstallé.

Et le pont sémantique : la requête `fromage` retrouve `lactose` **sans aucun mot commun**,
via l'index sémantique local (Ollama). Le cerveau relie, il ne copie pas.

## Ce qui rend memsem différent (pas une liste de features — une posture)

- **La mémoire s'écrit pendant qu'on parle.** Pas de « pense à sauvegarder ». L'IA extrait
  les faits durables en fin de session, en arrière-plan.
- **La mémoire priorise.** Quand le contexte est serré, c'est le fait le plus pertinent qui
  entre, pas le plus récent. `importance × confiance × récence × fréquence`.
- **La mémoire se corrige.** Une contradiction fait s'estomper l'ancien fait au lieu de
  l'écraser. Les faits critiques (0.9+) sont protégés.
- **La mémoire s'entretient.** Des agents de fond consolident les petits faits en patterns
  (l'hippocampe) et recalibrent les priorités — seulement si « on retrouve aussi bien ».
- **La mémoire t'appartient.** 100% locale, jamais commitée, une base pour tous tes repos,
  chacun a la sienne. Pas de cloud, pas de télémétrie.

## Les chiffres qui rassurent

- 49 tests d'intégration, CI verte sur Node 22 + 24
- 16 langues de documentation
- `npm i memsem` → 74 kB, zéro dépendance native, Node ≥ 22.13
- Installable en une commande sur opencode, Claude Code, et tout client MCP

## La phrase d'accroche (variantes)

- « Ton IA naît avec une amnésie. On a réparé ça. »
- « La différence entre un outil et un collaborateur, c'est la mémoire. »
- « Mémoire n'est pas stockage. Le stockage garde ; la mémoire choisit, corrige, oublie. »
- « Your AI was born with amnesia. We fixed that. »
- « Storage keeps. Memory decides. »
