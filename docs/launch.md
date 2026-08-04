# Kit de lancement memsem

Tout pour faire tester et découvrir memsem. Chaque texte est prêt à copier-coller.

## Checklist avant lancement

- [ ] `npm publish` (1.0.0) — actuellement bloqué par la 2FA npm
- [ ] CI verte sur GitHub (badge « build » dans le README)
- [ ] Release GitHub `v1.0.0` (notes de version)
- [ ] Lancer `node scripts/demo.mjs` soi-même pour avoir les chiffres frais

---

## 1. Annuaires MCP (le plus rentable — les gens y CHERCHENT des serveurs)

| Annuaire | URL de soumission |
| --- | --- |
| mcp.so | https://mcp.so/submit |
| Smithery | https://smithery.ai — « Add server » |
| Glama | https://glama.ai/mcp/servers — « Submit server » |
| PulseMCP | https://www.pulsemcp.com/submit |
| MCP Market | https://mcpmarket.com/submit |
| awesome-mcp-servers (GitHub) | PR sur punkpeye/awesome-mcp-servers |

**Description courte (toutes plateformes, ~1 phrase)** :

> memsem — Semantic memory for AI agents. Auto-writes durable facts during sessions, dynamic priority for context budget, soft supersession on contradictions, local semantic search (Ollama). One command, works in every project, 100% local.

**Tags recommandés** : `memory`, `mcp`, `ai-agents`, `semantic-memory`, `opencode`, `claude-code`, `local`, `ollama`, `sqlite`

**Endpoint** : `npx -y memsem` (MCP, stdio)

**Setup** : opencode → `"plugin": ["memsem"]` · Claude → `npx -y memsem setup` · tout client MCP → `npx -y memsem`

---

## 2. Hacker News — « Show HN »

**Titre** : Show HN: memsem – a self-maintaining memory for AI agents (MCP, 100% local)

**Texte** (paste dans le premier commentaire, HN = pas de markdown riche) :

> I got tired of my AI forgetting everything between sessions, and of "memory tools" that are just passive storage. So I built memsem: a semantic memory MCP server with the two long-term systems of the brain — semantic facts + episodic session summaries — consolidated in background agents.
>
> What makes it different:
> - It writes itself: during a session the AI records durable facts (preferences, decisions, constraints) as subject → predicate → object triples.
> - Dynamic priority (importance × confidence × recency × frequency): the most relevant memories always fit the context budget.
> - Soft supersession: when a fact is contradicted ("I drank milk for years… wait, lactose intolerant"), the old one fades and archives — history always kept, critical facts protected.
> - Semantic search, fully local: Ollama embeddings let "cheese" find "lactose" with zero shared words. No cloud, no telemetry, your memory stays on your machine and is never committed to git.
> - It maintains itself: background sub-agents extract facts at session end, consolidate small facts into patterns (hippocampus), recalibrate priorities pairwise.
>
> Install in one line: opencode → "plugin": ["memsem"] · Claude Code → npx -y memsem setup · any MCP client → npx -y memsem
>
> Reproducible demo on a throwaway DB: node scripts/demo.mjs
> https://github.com/WindSeries69/memsem

---

## 3. Reddit

**r/LocalLLaMA + r/MCP_Servers + r/ClaudeAI + r/opencode** — même corps, titre adapté.

**Titre (r/LocalLLaMA)** : I built a self-maintaining memory for LLM agents — facts auto-written, contradictions fade instead of overwrite, semantic search stays on-device

**Titre (r/MCP_Servers)** : [Showcase] memsem — MCP server for semantic memory: auto-writes facts, dynamic priority, soft supersession, local embeddings

**Corps** :

> I built memsem, an MCP server that gives agents a memory that maintains itself.
>
> - Auto-writes durable facts from conversations (subject → predicate → object)
> - Dynamic priority so the right memories fit the context budget
> - Contradictions handled via soft supersession: old facts fade and archive, never overwritten, history kept
> - Optional semantic index via local Ollama (mxbai-embed-large) — "cheese" finds "lactose" without shared words
> - Episodic layer: session summaries searchable ("what did we do last week?")
> - Background sub-agents: session extraction, consolidation, pairwise priority recalibration
> - 100% local, per-user, never committed to git. One DB shared across all your repos.
>
> Try it (60 seconds, throwaway DB — your memory is never touched):
> git clone ... && npm i && npm run build && node scripts/demo.mjs
> Or just: npx -y memsem (MCP server, stdio)
>
> opencode: "plugin": ["memsem"] — Claude: npx -y memsem setup
>
> Feedback welcome — especially on the supersession thresholds and the consolidation safety rule.

---

## 4. Dev.to / Hashnode / Medium

**Titre** : « I built a memory that maintains itself — semantic + episodic for AI agents »

**Plan de l'article** :
1. Le problème : l'IA oublie, CLAUDE.md est statique, les outils de mémoire sont du stockage passif.
2. Les 3 décisions de conception : triplets atomiques + priorité dynamique ; supersession douce (le cas lactose) ; agents de fond (extraction, hippocampe, juge).
3. Le pont sémantique local (Ollama) — capture de la démo (assets/demo.svg).
4. Le setup universel : plugin opencode une ligne, `memsem setup` pour Claude, MCP partout.
5. Vie privée : local, par utilisateur, jamais commité.
6. Leçons apprises + chiffres (49 tests, 16 langues de README).

---

## 5. X / Twitter (thread court)

> 🧠 New: memsem — a memory for AI agents that maintains itself.
>
> ✅ auto-writes facts from conversations
> ✅ priorities for the context budget
> ✅ contradictions fade, never overwrite
> ✅ semantic search, 100% local (Ollama)
> ✅ one command, works in every project
>
> opencode: "plugin": ["memsem"]
> Claude: npx -y memsem setup
> Try it → github.com/WindSeries69/memsem

---

## 6. Après lancement (semaine 1-2)

- [ ] Surveiller les issues/étoiles, répondre à tout le monde
- [ ] Demander un feedback sur le seuil de supersession (0.25) et la règle de sûreté de consolidation
- [ ] Poster le premier « success story » réel (votre propre usage quotidien) sur X/Dev.to
- [ ] Ajouter les nouveaux contributeurs au README
- [ ] Reposter l'annonce sur r/MCP_Servers quand une fonctionnalité majeure sort (pont Obsidian, par ex.)
