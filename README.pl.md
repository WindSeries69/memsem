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

> **Pamięć semantyczna dla agentów AI** — pamięta to, co ważne, i wie, co zapomnieć.
> Jedna komenda do instalacji. Działa w *każdym* projekcie, dla *każdego* AI. W 100% lokalnie.

## Po co?

Twój AI zapomina wszystko między sesjami. `CLAUDE.md` to statyczny plik — nie potrafi się uczyć.
Bazy wektorowe są ciężkie i często hostowane w chmurze. Większość narzędzi „pamięci" to pasywne magazyny:
trzymają to, co im wrzucisz, nigdy nie ustalają priorytetów, nigdy nie godzą sprzeczności.

**memsem jest inny.** To *system* pamięci, nie szuflada:

- 🧠 **Pisze się sam** — podczas sesji Twój AI automatycznie zapisuje trwałe fakty (preferencje, decyzje, ograniczenia). Koniec z „pamiętaj, żeby to zapisać".
- ⚖️ **Ustala priorytety** — każdy fakt ma dynamiczny priorytet (`importance × confidence × recency × frequency`). Gdy kontekst jest ciasny, najistotniejsze wspomnienia zawsze wysuwają się na pierwszy plan.
- 🔄 **Radzi sobie ze sprzecznościami** — „od lat piję mleko… chwila, mam nietolerancję laktozy". Stary fakt nie jest nadpisywany: *zanika* stopniowo i jest archiwizowany, a pełna historia zostaje zachowana. Fakty krytyczne (importance ≥ 0.9) są chronione.
- 🔗 **Łączy pojęcia** — opcjonalny lokalny indeks semantyczny (Ollama, na Twojej maszynie) sprawia, że `fromage` znajduje `lactose` bez ani jednego wspólnego słowa.
- 🕰️ **Ma pamięć epizodyczną** — podsumowania sesji na wierzchu faktów semantycznych, jak dwa systemy pamięci długotrwałej w mózgu.
- 🔧 **Sam się utrzymuje** — agenci w tle łączą drobne fakty we wzorce („hipokamp") i przeliczają priorytety przez porównania parami, tylko wtedy, gdy czyni to pamięć *lepszą do przeszukiwania*.

## Zobacz, jak działa

Zainstaluj raz i pozwól mu działać. To prawdziwa sesja na jednorazowej bazie danych — Twoja rzeczywista pamięć nigdy nie zostaje naruszona (`node scripts/demo.mjs`):

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

## Prywatność — Twoja pamięć należy do Ciebie

- **W 100% lokalnie** — przechowywana w `~/.memory-mcp/memory.db` na *Twojej* maszynie. Bez chmury, bez telemetrii, nic nie opuszcza Twojego komputera.
- **Nigdy nie trafia do repo** — baza danych żyje poza każdym repozytorium. Klonuj publiczne repo, wypychaj kod, udostępniaj zrzuty ekranu: Twoja pamięć zostaje z Tobą. Każdy użytkownik ma swoją własną pamięć.
- **Pamięć podąża za *Tobą***, a nie za Twoimi projektami — ta sama baza jest współdzielona przez wszystkie Twoje repozytoria. Utwórz nowy folder, nowe repo: pamięć wciąż tam jest.

## Instalacja

### opencode — jedna linia

Dodaj do `opencode.json` (projektowego lub `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

To wszystko. Wtyczka rejestruje serwer MCP, wstrzykuje protokół pamięci i indeks pamięci do każdej sesji, przyznaje potrzebne uprawnienia i uruchamia agentów w tle. Zrestartuj opencode.

### Claude Code — jedna komenda

```bash
npx -y memsem setup
```

To rejestruje serwer MCP (`claude mcp add memory -- npx -y memsem`) i dodaje blok „memsem memory" do `~/.claude/CLAUDE.md` wskazujący na pełny protokół.

**Albo zainstaluj z pomocą AI**: po prostu wklej do Claude:

> Install the memsem persistent memory: run `npx -y memsem setup`, read `~/.memsem/memory-protocol.md`, and apply the protocol.

### Dowolny klient MCP

```bash
npx -y memsem
```

Serwer mówi protokołem MCP po stdio. Wskaż na niego dowolny host obsługujący MCP i wstrzyknij `memory-protocol.md` do instrukcji hosta (np. jako `AGENTS.md`), aby uczynić AI autonomicznym.

### Uniwersalny instalator

```bash
npx -y memsem setup        # detects and configures your hosts (opencode, Claude)
npx -y memsem setup --help # see options
```

Idempotentny, bezpieczny, odwracalny (`--uninstall`).

## Jak to działa

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**Cykl życia pamięci** — każdy fakt przechodzi tę samą ścieżkę:

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

- **Fakty atomowe** — każda pamięć to trójka `subject → predicate → object` z ważnością (importance), pewnością (confidence), częstotliwością, tagami, tematem i pochodzeniem.
- **Tematy i fokus** — hierarchiczne tematy (`food/drinks`) są mapą routingu; wyszukiwanie po temacie przecina wszystkie projekty. Lista `focus` utrzymuje aktywne tematy sesji na pełnym priorytecie.
- **Dynamiczny priorytet** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. Fakt krytyczny bije powtarzający się wzorzec.
- **Miękka supersesja** — sprzeczności wygaszają stary fakt (pewność spada), aż ten zarchiwizuje się poniżej progu. Historia jest zawsze zachowana.
- **Indeks semantyczny (opcjonalnie)** — każdy fakt jest osadzany lokalnie (`mxbai-embed-large` przez Ollama); wyszukiwania z `relax: true` dodają podobieństwo cosinusowe (próg 0.5). Bez Ollamy wszystko działa identycznie — ścisłe wyszukiwanie leksykalne.

## Porównanie

| | memsem | `CLAUDE.md` / notatki | mem0 | Zep / Graphiti | oficjalne memory MCP | Obsidian jako pamięć |
|---|---|---|---|---|---|---|
| Automatyczne zapisy podczas sesji | ✅ | ❌ | ⚠️ przez kod aplikacji | ⚠️ | ❌ | ❌ |
| Priorytet dla budżetu kontekstu | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Sprzeczności (miękka supersesja) | ✅ | ❌ (nadpisuje) | ❌ (nadpisuje) | ❌ | ❌ | ❌ |
| Wyszukiwanie semantyczne, lokalne i prywatne | ✅ (Ollama) | ❌ | ⚠️ (wymaga bazy wektorowej) | ⚠️ (wymaga bazy grafowej) | ❌ | ⚠️ (wtyczki) |
| Pamięć epizodyczna + samo-utrzymanie | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Jedna pamięć dla wszystkich repo | ✅ | ❌ (per projekt) | ⚠️ | ⚠️ | ❌ | ⚠️ (vault) |
| Zero zależności, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Czytelna / edytowalna | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## Dokumentacja

- [`memory-protocol.md`](memory-protocol.md) — protokół wstrzykiwany do Twojego AI: jak automatycznie zapisuje, przeszukuje i utrzymuje pamięć.
- [`DESIGN.md`](DESIGN.md) — pełny projekt: wizja, zasady, studium przypadku z laktozą, roadmapa.
- [`scripts/demo.mjs`](scripts/demo.mjs) — odtwórz powyższą demonstrację na jednorazowej bazie danych.

## Roadmapa

- [x] Indeks semantyczny (lokalne osadzenia Ollama)
- [x] Pamięć epizodyczna + ekstrakcja sesji
- [x] Konsolidacja hipokampa + sędzia oceniający porównaniami parami
- [x] Uniwersalna wtyczka opencode + `memsem setup`
- [ ] Most Obsidian: eksport/import pamięci jako czytelnych notatek markdown
- [ ] Propagacja grafowa wieloetapowa (multi-hop)

## Licencja

MIT — wolno do wszystkiego. Twoja pamięć pozostaje Twoja.
