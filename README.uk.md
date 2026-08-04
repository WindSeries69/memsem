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

> **Семантична пам'ять для AI-агентів** — пам'ятає, що важливо, знає, що забути.
> Одна команда для встановлення. Працює в *кожному* проєкті, для *кожного* AI. 100% локально.

## Навіщо?

Ваш AI забуває все між сесіями. `CLAUDE.md` — це статичний файл, він не вміє навчатися.
Векторні бази даних важкі та часто розміщені в хмарі. Більшість інструментів «пам'яті» — це пасивне сховище:
вони зберігають те, що ви в них кидаєте, ніколи не пріоритизують, ніколи не узгоджують суперечності.

**memsem — інший.** Це *система* пам'яті, а не шухляда:

- 🧠 **Він пише сам себе** — під час сесії ваш AI автоматично записує тривалі факти (уподобання, рішення, обмеження). Більше жодного «не забудь це зберегти».
- ⚖️ **Він пріоритизує** — кожен факт має динамічний пріоритет (`importance × confidence × recency × frequency`). Коли контекст обмежений, найрелевантніші спогади завжди спливають першими.
- 🔄 **Він опрацьовує суперечності** — «Я роками пив молоко… стривай, у мене непереносимість лактози». Старий факт не перезаписується: він поступово *згасає* та архівується, зі збереженням повної історії. Критичні факти (importance ≥ 0.9) захищені.
- 🔗 **Він пов'язує поняття** — необов'язковий локальний семантичний індекс (Ollama, на вашій машині) дозволяє `fromage` знайти `lactose` без жодного спільного слова.
- 🕰️ **Він має епізодичну пам'ять** — підсумки сесій поверх семантичних фактів, як дві довготривалі системи мозку.
- 🔧 **Він підтримує себе сам** — фонові агенти об'єднують дрібні факти в патерни («гіпокамп») і перекалібровують пріоритети попарним порівнянням, і лише тоді, коли це робить пам'ять *кращою для пошуку*.

## Побачити в дії

Встановіть один раз і дайте йому працювати. Це реальна сесія на тимчасовій базі даних — ваша справжня пам'ять не зачіпається (`node scripts/demo.mjs`):

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

## Приватність — ваша пам'ять належить вам

- **100% локально** — зберігається в `~/.memory-mcp/memory.db` на *вашій* машині. Жодної хмари, жодної телеметрії, нічого не залишає ваш комп'ютер.
- **Ніколи не комітиться** — база даних живе поза кожним репозиторієм. Клонуйте публічний репозиторій, пуште код, діліться скріншотами: ваша пам'ять залишається з вами. Кожен користувач має власну пам'ять.
- **Пам'ять слідує за *вами***, а не за вашими проєктами — одна й та сама база використовується у всіх ваших репозиторіях. Створіть нову папку, новий репозиторій: пам'ять усе ще там.

## Встановлення

### opencode — один рядок

Додайте до `opencode.json` (проєктного або `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

І все. Плагін реєструє MCP-сервер, впроваджує протокол пам'яті та індекс пам'яті в кожну сесію, надає необхідні дозволи та запускає фонові агенти. Перезапустіть opencode.

### Claude Code — одна команда

```bash
npx -y memsem setup
```

Це реєструє MCP-сервер (`claude mcp add memory -- npx -y memsem`) і додає блок «memsem memory» до `~/.claude/CLAUDE.md`, який посилається на повний протокол.

**Або встановіть за допомогою AI**: просто вставте в Claude:

> Install the memsem persistent memory: run `npx -y memsem setup`, read `~/.memsem/memory-protocol.md`, and apply the protocol.

### Будь-який MCP-клієнт

```bash
npx -y memsem
```

Сервер розмовляє MCP через stdio. Підключіть до нього будь-якого хоста з підтримкою MCP і впровадьте `memory-protocol.md` в інструкції хоста (наприклад, як `AGENTS.md`), щоб зробити AI автономним.

### Універсальний інсталятор

```bash
npx -y memsem setup        # detects and configures your hosts (opencode, Claude)
npx -y memsem setup --help # see options
```

Ідемпотентний, безпечний, зворотний (`--uninstall`).

## Як це працює

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**Життєвий цикл пам'яті** — кожен факт проходить один і той самий шлях:

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

- **Атомарні факти** — кожен спогад — це триплет `subject → predicate → object` з importance, confidence, frequency, тегами, темою, джерелом (provenance).
- **Теми та фокус** — ієрархічні теми (`food/drinks`) — це карта маршрутизації; пошук за темою перетинає всі проєкти. Список `focus` тримає активні теми сесії на повному пріоритеті.
- **Динамічний пріоритет** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. Критичний факт перемагає патерн, що повторюється.
- **М'яке витіснення** — суперечності згашують старий факт (confidence знижується), доки він не архівується нижче порога. Історія завжди зберігається.
- **Семантичний індекс (необов'язково)** — кожен факт вбудовується локально (`mxbai-embed-large` через Ollama); пошуки з `relax: true` додають косинусну подібність (поріг 0.5). Без Ollama все працює так само — суворий лексичний пошук.

## Порівняння

| | memsem | `CLAUDE.md` / нотатки | mem0 | Zep / Graphiti | офіційний memory MCP | Obsidian як пам'ять |
|---|---|---|---|---|---|---|
| Автозапис під час сесій | ✅ | ❌ | ⚠️ через код застосунку | ⚠️ | ❌ | ❌ |
| Пріоритет для бюджету контексту | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Суперечності (м'яке витіснення) | ✅ | ❌ (перезапис) | ❌ (перезапис) | ❌ | ❌ | ❌ |
| Семантичний пошук, локальний і приватний | ✅ (Ollama) | ❌ | ⚠️ (потрібна векторна БД) | ⚠️ (потрібна графова БД) | ❌ | ⚠️ (плагіни) |
| Епізодична пам'ять + самопідтримка | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Одна пам'ять для всіх ваших репозиторіїв | ✅ | ❌ (на проєкт) | ⚠️ | ⚠️ | ❌ | ⚠️ (сховище) |
| Жодних залежностей, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Людиночитаний / редагований | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## Документація

- [`memory-protocol.md`](memory-protocol.md) — протокол, впроваджуваний у ваш AI: як він автоматично пише, шукає та підтримує пам'ять.
- [`DESIGN.md`](DESIGN.md) — повний дизайн: бачення, принципи, кейс із лактозою, дорожня карта.
- [`scripts/demo.mjs`](scripts/demo.mjs) — відтворіть демо вище на тимчасовій базі даних.

## Дорожня карта

- [x] Семантичний індекс (локальні Ollama-ембедінги)
- [x] Епізодична пам'ять + вилучення з сесій
- [x] Консолідація гіпокампа + суддя попарного оцінювання
- [x] Універсальний opencode-плагін + `memsem setup`
- [ ] Obsidian-міст: експорт/імпорт пам'яті як читабельних markdown-нотаток
- [ ] Багатокрокова графова пропагація

## Ліцензія

MIT — вільно для будь-чого. Ваша пам'ять залишається вашою.
