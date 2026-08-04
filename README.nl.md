<p align="center">
  🌍 <strong>Languages:</strong>
  <a href="README.md">🇬🇧 English</a> ·
  <a href="README.fr.md">🇫🇷 Français</a> ·
  <a href="README.de.md">🇩🇪 Deutsch</a> ·
  <a href="README.es.md">🇪🇸 Español</a> ·
  <a href="README.it.md">🇮🇹 Italiano</a> ·
  <a href="README.pt.md">🇵🇹 Português</a> ·
  <a href="README.nl.md">🇳🇱 Nederlands</a> ·
  <a href="README.ru.md">🇷🇺 Русский</a> ·
  <a href="README.ja.md">🇯🇵 日本語</a> ·
  <a href="README.zh.md">🇨🇳 中文</a> ·
  <a href="README.ko.md">🇰🇷 한국어</a> ·
  <a href="README.pl.md">🇵🇱 Polski</a> ·
  <a href="README.tr.md">🇹🇷 Türkçe</a> ·
  <a href="README.uk.md">🇺🇦 Українська</a> ·
  <a href="README.hi.md">🇮🇳 हिन्दी</a> ·
  <a href="README.vi.md">🇻🇳 Tiếng Việt</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="memsem — semantic memory for AI agents" width="900">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memsem"><img src="https://img.shields.io/npm/v/memsem" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/memsem" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-339933" alt="Node >= 22.13">
  <img src="https://img.shields.io/badge/MCP-server-1f1f1f" alt="MCP server">
  <img src="https://img.shields.io/badge/opencode-plugin-000" alt="opencode plugin">
</p>

> **Semantisch geheugen voor AI-agenten** — onthoudt wat ertoe doet, weet wat vergeten moet worden.
> Eén commando om te installeren. Werkt in *elk* project, voor *elke* AI. 100% lokaal.

## Waarom?

Je AI vergeet alles tussen sessies. `CLAUDE.md` is een statisch bestand — het kan niet leren.
Vector databases zijn zwaar en vaak cloud-gehost. De meeste "geheugen"-tools zijn passieve opslag:
ze bewaren wat je erin gooit, prioriteren nooit, verzoenen nooit tegenstrijdigheden.

**memsem is anders.** Het is een geheugen*systeem*, geen la:

- 🧠 **Het schrijft zichzelf** — tijdens een sessie legt je AI automatisch duurzame feiten vast (voorkeuren, beslissingen, beperkingen). Geen "vergeet niet dit op te slaan" meer.
- ⚖️ **Het prioriteert** — elk feit heeft een dynamische prioriteit (`belang × vertrouwen × recentheid × frequentie`). Wanneer de context krap is, verschijnen de meest relevante herinneringen altijd eerst.
- 🔄 **Het gaat om met tegenstrijdigheden** — "Ik drink al jaren melk… wacht, ik ben lactose-intolerant." Het oude feit wordt niet overschreven: het *vervaagt* geleidelijk en archiveert, met volledige geschiedenis behouden. Kritieke feiten (belang ≥ 0.9) worden beschermd.
- 🔗 **Het verbindt concepten** — een optionele lokale semantische index (Ollama, op jouw machine) laat `fromage` `lactose` vinden zonder één gedeeld woord.
- 🕰️ **Het heeft episodisch geheugen** — samenvattingen van sessies bovenop semantische feiten, net als de twee langetermijnsystemen van het brein.
- 🔧 **Het onderhoudt zichzelf** — achtergrondagenten consolideren kleine feiten tot patronen (de "hippocampus") en kalibreren prioriteiten opnieuw door paarsgewijze vergelijking, alleen wanneer dit het geheugen *beter doorzoekbaar* maakt.

## Zie het in actie

Installeer eenmaal, laat het draaien. Dit is een echte sessie op een wegwerp-database — jouw echte geheugen wordt nooit aangeraakt (`node scripts/demo.mjs`):

```
=== memsem — demo on a temporary database ===
(your real memory in ~/.memory-mcp stays untouched)

1. The AI writes durable facts (memory_add_many)
   → 4 facts written

2. Strict search (lexical): memory_search { query: 'milk' }
   → user → drinks → milk

3. Semantic search (relax, local embeddings): memory_search { query: 'cheese', relax: true }
   No shared word with « lactose » — the local semantic index (Ollama) bridges it
   → lactose → is-present-in → cheese, yogurt, cream
   → user → is-intolerant-to → lactose
   → user → drinks → milk

4. Soft supersession: the AI learns you no longer drink milk
   → conflict: true, old fact faded (faded: [1])

5. Search now returns the current fact
   → user → drinks → no more milk (lactose intolerant)
   → user → drinks → milk

Stats: 5 active memories, semantic index OK (mxbai-embed-large)
```

## Privacy — jouw geheugen is van jou

- **100% lokaal** — opgeslagen in `~/.memory-mcp/memory.db` op *jouw* machine. Geen cloud, geen telemetrie, niets verlaat je computer.
- **Nooit gecommit** — de database leeft buiten elke repository. Kloon een openbare repo, push code, deel screenshots: jouw geheugen blijft bij jou. Elke gebruiker heeft zijn eigen geheugen.
- **Het geheugen volgt *jou***, niet je projecten — dezelfde basis wordt gedeeld over al je repos. Maak een nieuwe map, een nieuwe repo: het geheugen is er nog steeds.

## Installatie

### opencode — één regel

Voeg toe aan `opencode.json` (project of `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

Dat is alles. De plugin registreert de MCP-server, injecteert het geheugenprotocol en de geheugenindex in elke sessie, verleent de benodigde rechten en draait de achtergrondagenten. Start opencode opnieuw.

### Claude Code — één commando

```bash
npx -y memsem setup
```

Dit registreert de MCP-server (`claude mcp add memory -- npx -y memsem`) en voegt een "memsem memory"-blok toe aan `~/.claude/CLAUDE.md` dat verwijst naar het volledige protocol.

**Of installeer het met AI**: plak dit gewoon in Claude:

> Installeer het memsem-persistent geheugen: voer `npx -y memsem setup` uit, lees `~/.memsem/memory-protocol.md` en pas het protocol toe.

### Elke MCP-client

```bash
npx -y memsem
```

De server spreekt MCP via stdio. Wijs elke MCP-capabele host erop aan en injecteer `memory-protocol.md` in de instructies van de host (bijv. als `AGENTS.md`) om de AI autonoom te maken.

### Universele installer

```bash
npx -y memsem setup        # detecteert en configureert je hosts (opencode, Claude)
npx -y memsem setup --help # zie opties
```

Idempotent, veilig, omkeerbaar (`--uninstall`).

## Hoe het werkt

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**De levenscyclus van het geheugen** — elk feit doorloopt hetzelfde pad:

```mermaid
flowchart LR
    W["memory_add — subject → predicate → object"] --> R["repeated → confidence ↑ frequency ↑"]
    W --> P["priority = f(importance, confidence, recency, frequency)"]
    R --> S{"contradiction?"}
    S -- yes --> F["old fact fades progressively"]
    F --> A["archived — history always kept"]
    S -- no --> K["kept, reinforced"]
    A --> J["pinned & critical (≥ 0.9) are protected"]
```

- **Atoomfeiten** — elke herinnering is een `subject → predicate → object`-triplet met belang, vertrouwen, frequentie, tags, thema, herkomst.
- **Thema's & focus** — hiërarchische thema's (`food/drinks`) zijn de routeringskaart; een zoekopdracht op thema doorkruist alle projecten. De `focus`-lijst houdt de actieve thema's van de sessie op volledige prioriteit.
- **Dynamische prioriteit** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. Een kritiek feit verslaat een terugkerend patroon.
- **Zachte vervanging** — tegenstrijdigheden laten het oude feit vervagen (vertrouwen neemt af) totdat het archiveert onder een drempelwaarde. Geschiedenis wordt altijd bewaard.
- **Semantische index (optioneel)** — elk feit wordt lokaal geëmbed (`mxbai-embed-large` via Ollama); zoekopdrachten met `relax: true` voegen cosinusovereenkomst toe (drempel 0.5). Zonder Ollama werkt alles identiek — strikte lexicale zoekopdracht.

## Vergelijking

| | memsem | `CLAUDE.md` / notes | mem0 | Zep / Graphiti | official memory MCP | Obsidian as memory |
|---|---|---|---|---|---|---|
| Schrijft automatisch tijdens sessies | ✅ | ❌ | ⚠️ via app code | ⚠️ | ❌ | ❌ |
| Prioriteit voor contextbudget | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tegenstrijdigheden (zachte vervanging) | ✅ | ❌ (overschrijft) | ❌ (overschrijft) | ❌ | ❌ | ❌ |
| Semantische zoekopdracht, lokaal & privé | ✅ (Ollama) | ❌ | ⚠️ (heeft vector DB nodig) | ⚠️ (heeft graph DB nodig) | ❌ | ⚠️ (plugins) |
| Episodisch geheugen + zelfonderhoud | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Eén geheugen voor al je repos | ✅ | ❌ (per project) | ⚠️ | ⚠️ | ❌ | ⚠️ (vault) |
| Nul afhankelijkheden, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Menselijk leesbaar / bewerkbaar | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## Documentatie

- [`memory-protocol.md`](memory-protocol.md) — het protocol dat in je AI wordt geïnjecteerd: hoe het automatisch schrijft, zoekt en onderhoudt.
- [`DESIGN.md`](DESIGN.md) — volledig ontwerp: visie, principes, de lactose-casestudy, roadmap.
- [`scripts/demo.mjs`](scripts/demo.mjs) — reproduceer de demo hierboven op een wegwerp-database.

## Roadmap

- [x] Semantische index (lokale Ollama-embeddings)
- [x] Episodisch geheugen + sessie-extractie
- [x] Hippocampus-consolidatie + paarsgewijze scoring-rechter
- [x] Universele opencode-plugin + `memsem setup`
- [ ] Obsidian-brug: geheugen exporteren/importeren als leesbare markdown-notities
- [ ] Multi-hop grafiekpropagatie

## Licentie

MIT — gratis voor alles. Jouw geheugen blijft van jou.
