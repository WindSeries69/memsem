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
  <a href="https://github.com/WindSeries69/memsem/actions"><img src="https://img.shields.io/github/actions/workflow/status/WindSeries69/memsem/ci.yml?branch=main&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/MCP-server-1f1f1f" alt="MCP server">
  <img src="https://img.shields.io/badge/opencode-plugin-000" alt="opencode plugin">
</p>

> **Semantisches Gedächtnis für KI-Agenten** — erinnert sich an das Wichtige, weiß, was es vergessen soll.
> Ein Befehl zur Installation. Funktioniert in *jedem* Projekt, für *jede* KI. 100 % lokal.

## Warum — wo es doch schon große Memory-Systeme gibt?

Sie gibt es, und sie haben die schwierigen Teile richtig gelöst: Vektor-Speicher (mem0), temporale
Wissensgraphen (Zep / Graphiti), Agenten-Frameworks (MemGPT / Letta). Aber sie teilen
alle dieselben drei Schwächen:

1. **Roher Speicher, keine Struktur.** Sie behalten, was man ihnen hinwirft, und
   der Abruf ist eine Ähnlichkeitssuche über *alles*. Die KI weiß nicht,
   **wo sie suchen soll** — also sucht sie überall, und das Rauschen übertönt das Signal.
2. **Keine Präzision.** Eine unscharfe Übereinstimmung bleibt eine unscharfe Übereinstimmung:
   Fast-richtige Erinnerungen füllen das Kontextbudget und verschwenden Tokens.
3. **Keine Selbstkorrektur.** Ein vor Monaten widerlegter Fakt ist genauso stark wie
   am Tag, an dem er geschrieben wurde.

memsem behebt genau diese drei Dinge:

- 🧭 **Es weiß, wo es suchen muss.** Jede Sitzung beginnt mit einer Routing-Karte
  (`memory-index.md`): Themen + Schlüsselwörter, injiziert in den Kontext. Die KI
  routet nach Thema, durchquert Projekte und zahlt nur für das, was sie braucht.
  Hierarchische Themen + eine lebendige Fokus-Liste halten die aktiven Zweige der
  Sitzung bei voller Priorität — der Rest wird abgeschwächt, nie verloren.
- 🎯 **Es ist präzise.** Strikte lexikalische Suche standardmäßig (50-%-Wortübereinstimmungs-
  Schwelle, keine Graph-Ausbreitung außer du fragst ausdrücklich danach) — eine Abfrage liefert
  die richtigen Fakten, sortiert nach dynamischer Priorität
  (`importance × confidence × recency × frequency`). Präzision wird gemessen,
  nicht angenommen: **P@3 0.958** auf der Referenz-Benchmark (51 Fakten, 20 Abfragen,
  [`scripts/bench.mjs`](scripts/bench.mjs), Ergebnisse in
  [`DESIGN.md`](DESIGN.md) §11).
- 🔄 **Es korrigiert sich selbst.** Widersprüche lassen den alten Fakt verblassen,
  statt ihn zu überschreiben („Ich habe jahrelang Milch getrunken … Moment, laktoseintolerant") —
  die Historie bleibt immer erhalten, kritische Fakten (≥ 0.9) sind geschützt.
  Hintergrund-Agenten extrahieren am Sitzungsende dauerhafte Fakten, bündeln kleine
  Fakten zu Mustern und kalibrieren Prioritäten neu — nur dann, wenn die Erinnerung
  *mindestens genauso durchsuchbar* bleibt.

All die Versprechen der großen Systeme, minus ihre Schwächen: ein Befehl, 100 % lokal, und
deine Erinnerung bleibt deine — wird nie committet, pro Nutzer getrennt, über alle deine Repos geteilt.

## In Aktion sehen

Einmal installieren, laufen lassen. Dies ist eine echte Sitzung auf einer Wegwerf-Datenbank — deine tatsächliche Erinnerung wird nie angetastet (`node scripts/demo.mjs`):

<p align="center">
  <img src="assets/demo.svg" alt="memsem demo — terminal output" width="860">
</p>

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

## Privatsphäre — deine Erinnerung gehört dir

- **100 % lokal** — gespeichert in `~/.memory-mcp/memory.db` auf *deiner* Maschine. Keine Cloud, keine Telemetrie, nichts verlässt deinen Computer.
- **Wird nie committet** — die Datenbank liegt außerhalb jedes Repositories. Ein öffentliches Repo klonen, Code pushen, Screenshots teilen: Deine Erinnerung bleibt bei dir. Jeder Nutzer hat seine eigene Erinnerung.
- **Die Erinnerung folgt *dir***, nicht deinen Projekten — dieselbe Basis wird über alle deine Repos hinweg geteilt. Einen neuen Ordner, ein neues Repo anlegen: Die Erinnerung ist trotzdem noch da.

## Installation

### opencode — eine Zeile

Zu `opencode.json` hinzufügen (Projekt oder `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

Das war's. Das Plugin registriert den MCP-Server, injiziert das Memory-Protokoll und den Memory-Index in jede Sitzung, gewährt die nötigen Berechtigungen und führt die Hintergrund-Agenten aus. opencode neu starten.

### Claude Code — ein Befehl

```bash
npx -y memsem setup
```

Das registriert den MCP-Server (`claude mcp add memory -- npx -y memsem`) und fügt einen „memsem memory"-Block zu `~/.claude/CLAUDE.md` hinzu, der auf das vollständige Protokoll verweist.

**Oder mit KI installieren**: Einfach in Claude einfügen:

> Install the memsem persistent memory: run `npx -y memsem setup`, read `~/.memsem/memory-protocol.md`, and apply the protocol.

### Beliebiger MCP-Client

```bash
npx -y memsem
```

Der Server spricht MCP über stdio. Richte einen beliebigen MCP-fähigen Host darauf aus und injiziere `memory-protocol.md` in die Anweisungen des Hosts (z. B. als `AGENTS.md`), um die KI autonom zu machen.

### Universeller Installer

```bash
npx -y memsem setup        # erkennt und konfiguriert deine Hosts (opencode, Claude)
npx -y memsem setup --help # Optionen ansehen
```

Idempotent, sicher, umkehrbar (`--uninstall`).

## So funktioniert es

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**Der Lebenszyklus einer Erinnerung** — jeder Fakt durchläuft denselben Weg:

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

- **Atomare Fakten** — jede Erinnerung ist ein `subject → predicate → object`-Tripel mit importance, confidence, frequency, Tags, Theme und Provenienz.
- **Themen & Fokus** — hierarchische Themen (`food/drinks`) sind die Routing-Karte; eine Suche nach Thema durchquert alle Projekte. Die `focus`-Liste hält die aktiven Themen der Sitzung bei voller Priorität.
- **Dynamische Priorität** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. Ein kritischer Fakt schlägt ein wiederkehrendes Muster.
- **Sanfte Verdrängung** — Widersprüche lassen den alten Fakt verblassen (die confidence sinkt), bis er unter einem Schwellenwert archiviert wird. Die Historie bleibt immer erhalten.
- **Semantischer Index (optional)** — jeder Fakt wird lokal eingebettet (`mxbai-embed-large` über Ollama); Suchen mit `relax: true` ergänzen die Kosinus-Ähnlichkeit (Schwellenwert 0.5). Ohne Ollama funktioniert alles identisch — strikte lexikalische Suche.

## Vergleich

| | memsem | `CLAUDE.md` / Notizen | mem0 | Zep / Graphiti | offizielles Memory-MCP | Obsidian als Memory |
|---|---|---|---|---|---|---|
| Automatisches Schreiben während Sitzungen | ✅ | ❌ | ⚠️ über App-Code | ⚠️ über App-Code | ❌ | ❌ |
| Priorisierung für das Kontextbudget | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Widersprüche (sanfte Verdrängung) | ✅ | ❌ (überschreibt) | ❌ (überschreibt) | ✅ (temporale Versionierung) | ❌ | ❌ |
| Semantische Suche | ✅ lokal (Ollama) | ❌ | ✅ (Vektor-Speicher) | ✅ (Graph + Embeddings) | ❌ | ⚠️ (Plugins) |
| Episodisches Gedächtnis + Selbstwartung | ✅ | ❌ | ⚠️ (episodische Add-ons) | ✅ (temporaler Wissensgraph) | ❌ | ❌ |
| Eine Erinnerung über alle deine Repos | ✅ | ❌ (pro Projekt) | ⚠️ (pro App-Konfiguration) | ⚠️ (pro App-Konfiguration) | ❌ | ⚠️ (Vault) |
| Null Abhängigkeiten, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Menschenlesbar / bearbeitbar | ⚠️ (CLI list/edit) | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

*Vergleich Stand Aug 2026, aus öffentlichen Dokumentationen; die Fähigkeiten entwickeln sich weiter — vor der Auswahl verifizieren.*

## Befehlszeile

Alles, was über MCP möglich ist, geht auch vom Terminal aus:

```bash
memsem list [--theme x] [--project p] [--limit n] [--all]   # read your memory
memsem edit <id> [--object "..."] [--importance 0.6] [...]  # fix a fact by hand (audited)
memsem forget <id> [--yes]                                  # archive a fact (confirm)
memsem doctor [--limit n] [--hours h]                       # most-modified facts — spot drift
memsem export [--output f] [--project p]                    # full JSON dump
memsem import <file.json>                                   # restore / merge a dump
memsem setup [--host opencode|claude]                       # install for your hosts
```

Manuelle Korrekturen werden im Audit-Journal festgehalten — `memsem doctor` zeigt sie ebenfalls an.

## Konfiguration

Einstellbare Konstanten (Prioritäts-Gewichte, Schwellenwerte, Verblassungs-Faktoren, Modell…) liegen in
[`src/config.ts`](src/config.ts). Jede davon kann in `~/.memsem/config.json`
(oder `$MEMSEM_CONFIG`) überschrieben werden, per Deep-Merge mit Validierung:

```json
{ "priority": { "importance": 0.4, "confidence": 0.3 }, "minLexical": 0.4 }
```

Die Einstellungen werden durch eine Benchmark dokumentiert und validiert
([`scripts/bench.mjs`](scripts/bench.mjs) — 51 Fakten, 20 Abfragen, P@k/R@k über
Konstanten-Sets; Ergebnisse in [`DESIGN.md`](DESIGN.md) §11).

## Haltbarkeit

Die Datenbank ist versioniert und wird beim Start automatisch migriert (`schema_migrations`),
mit einem automatischen Backup vor jeder Migration (`~/.memory-mcp/backups/`, die letzten 5 werden behalten).
Der WAL-Modus ist aktiv — ein Absturz mitten im Schreiben lässt die Datenbank intakt. Vollständige Dumps und
Wiederherstellungen über `memsem export` / `memsem import`.

## Dokumentation

- [`memory-protocol.md`](memory-protocol.md) — das Protokoll, das in deine KI injiziert wird: wie sie Erinnerungen automatisch schreibt, durchsucht und wartet.
- [`DESIGN.md`](DESIGN.md) — vollständiges Design: Vision, Prinzipien, die Lactose-Fallstudie, Konstanten-Kalibrierung, Roadmap.
- [`scripts/demo.mjs`](scripts/demo.mjs) — reproduziere die Demo oben auf einer Wegwerf-Datenbank.

## Roadmap

- [x] Semantischer Index (lokale Ollama-Embeddings)
- [x] Episodisches Gedächtnis + Sitzungsextraktion
- [x] Hippocampus-Konsolidierung + paarweiser Scoring-Judge
- [x] Universelles opencode-Plugin + `memsem setup`
- [x] Versionierte Migrationen + automatisches Backup + Export/Import
- [x] Konfigurierbare Konstanten, validiert durch eine Benchmark
- [x] Sicherer Judge: Dry-Run, Audit-Journal, Schutzmechanismen, `memsem doctor`
- [x] CLI: `list` / `edit` / `forget` — einen Fakt von Hand korrigieren
- [ ] Obsidian-Brücke: Erinnerung als lesbare Markdown-Notizen exportieren/importieren
- [ ] Multi-Hop-Graph-Ausbreitung

## Lizenz

MIT — frei für alles. Deine Erinnerung bleibt deine.
